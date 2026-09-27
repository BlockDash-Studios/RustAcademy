import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TaskEntity } from './task.entity';

const COMPILE_TIMEOUT_MS = 10_000;
const EXECUTION_TIMEOUT_MS = 2_000;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_TEST_CASES = 20;
const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
const FUEL_LIMIT = 10_000_000;

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputExceeded: boolean;
}

export interface TestCaseResult {
  index: number;
  passed: boolean;
  stdout: string;
  durationMs: number;
  error?: string;
}

export interface TaskExecutionResult {
  compiled: boolean;
  passed: boolean;
  results: TestCaseResult[];
  compileError?: string;
}

@Injectable()
export class WasmSandboxService {
  async execute(task: TaskEntity, code: string): Promise<TaskExecutionResult> {
    if (!task.testCases.length) {
      throw new BadRequestException('Task has no test cases configured');
    }
    if (task.testCases.length > MAX_TEST_CASES) {
      throw new BadRequestException(`A task may have at most ${MAX_TEST_CASES} test cases`);
    }

    const workspace = await mkdtemp(join(tmpdir(), 'rustacademy-wasm-'));
    const sourcePath = join(workspace, 'main.rs');
    const wasmPath = join(workspace, 'main.wasm');

    try {
      await writeFile(sourcePath, code, { encoding: 'utf8', flag: 'wx' });
      let compilation: ProcessResult;

      try {
        compilation = await this.runProcess(
          process.env.RUSTC_BIN || 'rustc',
          [
            '--edition=2021',
            '--target=wasm32-wasip1',
            '--crate-type=bin',
            '-o',
            wasmPath,
            sourcePath,
          ],
          '',
          workspace,
          COMPILE_TIMEOUT_MS,
          this.compilerEnvironment(workspace),
        );
      } catch {
        throw new ServiceUnavailableException('Rust WASM compiler is unavailable');
      }

      if (compilation.exitCode !== 0 || compilation.timedOut || compilation.outputExceeded) {
        return {
          compiled: false,
          passed: false,
          results: [],
          compileError: compilation.timedOut
            ? 'Compilation timed out'
            : compilation.outputExceeded
              ? 'Compiler output exceeded the limit'
              : compilation.stderr || 'Rust compilation failed',
        };
      }

      const results: TestCaseResult[] = [];
      for (const [index, input] of task.testCases.entries()) {
        results.push(
          await this.runTestCase(wasmPath, workspace, input, task.expectedOutput, index),
        );
      }

      return {
        compiled: true,
        passed: results.every((result) => result.passed),
        results,
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private async runTestCase(
    wasmPath: string,
    workspace: string,
    input: string,
    expectedOutput: string,
    index: number,
  ): Promise<TestCaseResult> {
    let execution: ProcessResult;

    try {
      execution = await this.runProcess(
        process.env.WASMTIME_BIN || 'wasmtime',
        [
          'run',
          '--fuel',
          String(FUEL_LIMIT),
          '--max-memory-size',
          String(MAX_MEMORY_BYTES),
          wasmPath,
        ],
        input,
        workspace,
        EXECUTION_TIMEOUT_MS,
        this.sandboxEnvironment(workspace),
      );
    } catch {
      throw new ServiceUnavailableException('Wasmtime runtime is unavailable');
    }

    const error = execution.timedOut
      ? 'Execution timed out'
      : execution.outputExceeded
        ? 'Program output exceeded the limit'
        : execution.exitCode !== 0
          ? execution.stderr || `Program exited with code ${execution.exitCode}`
          : undefined;
    const stdout = execution.stdout;

    return {
      index,
      passed: !error && this.normalizeOutput(stdout) === this.normalizeOutput(expectedOutput),
      stdout,
      durationMs: execution.durationMs,
      ...(error ? { error } : {}),
    };
  }

  private runProcess(
    command: string,
    args: string[],
    input: string,
    cwd: string,
    timeoutMs: number,
    env: NodeJS.ProcessEnv,
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let timedOut = false;
      let outputExceeded = false;
      let settled = false;

      let child;
      try {
        child = spawn(command, args, {
          cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (error) {
        reject(error);
        return;
      }

      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      const collect = (target: 'stdout' | 'stderr') => (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          outputExceeded = true;
          child.kill('SIGKILL');
          return;
        }
        if (target === 'stdout') stdout += chunk.toString('utf8');
        else stderr += chunk.toString('utf8');
      };

      child.stdout.on('data', collect('stdout'));
      child.stderr.on('data', collect('stderr'));
      child.once('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut,
          outputExceeded,
        });
      });
      child.stdin.end(input);
    });
  }

  private sandboxEnvironment(workspace: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: workspace,
      TMPDIR: workspace,
      TEMP: workspace,
      TMP: workspace,
    };

    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    if (process.env.WINDIR) env.WINDIR = process.env.WINDIR;
    return env;
  }

  private compilerEnvironment(workspace: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      RUSTUP_HOME:
        process.env.RUSTUP_HOME ||
        join(process.env.USERPROFILE || process.env.HOME || tmpdir(), '.rustup'),
      HOME: workspace,
      TMPDIR: workspace,
      TEMP: workspace,
      TMP: workspace,
    };

    if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
    if (process.env.WINDIR) env.WINDIR = process.env.WINDIR;
    return env;
  }

  private normalizeOutput(output: string): string {
    return output.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  }
}
