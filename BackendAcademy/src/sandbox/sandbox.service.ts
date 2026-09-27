import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { spawn } from "child_process";

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export interface SandboxTestCaseResult {
  index: number;
  passed: boolean;
  stdout: string;
  durationMs: number;
  error?: string;
}

export interface SandboxTestsResult {
  compiled: boolean;
  passed: boolean;
  results: SandboxTestCaseResult[];
  compileError?: string;
}

interface ContainerResult extends SandboxResult {
  compiled: boolean;
}

const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_TEST_CASES = 10;
const MAX_PARALLEL_RUNS = 4;
const COMPILE_TIMEOUT_SECONDS = 10;
const EXECUTION_TIMEOUT_SECONDS = 2;
const COMPILE_SUCCESS_MARKER = "__RUSTACADEMY_WASM_COMPILE_SUCCESS__";

@Injectable()
export class SandboxService {
  private activeRuns = 0;

  async runRust(source: string): Promise<SandboxResult> {
    return this.withRunSlot(async () => {
      const result = await this.runContainer(source, "");
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
      };
    });
  }

  async runRustTests(
    source: string,
    testCases: string[],
    expectedOutput: string,
  ): Promise<SandboxTestsResult> {
    if (testCases.length === 0 || testCases.length > MAX_TEST_CASES) {
      throw new BadRequestException(
        `Provide between 1 and ${MAX_TEST_CASES} test cases`,
      );
    }

    return this.withRunSlot(async () => {
      const results: SandboxTestCaseResult[] = [];

      for (const [index, input] of testCases.entries()) {
        const execution = await this.runContainer(source, input);
        if (!execution.compiled) {
          return {
            compiled: false,
            passed: false,
            results: [],
            compileError: execution.timedOut
              ? "Compilation timed out"
              : execution.stderr || "Rust compilation failed",
          };
        }

        const error = execution.timedOut
          ? "Execution timed out"
          : execution.exitCode !== 0
            ? execution.stderr ||
              `Program exited with code ${execution.exitCode}`
            : undefined;

        results.push({
          index,
          passed:
            !error &&
            this.normalizeOutput(execution.stdout) ===
              this.normalizeOutput(expectedOutput),
          stdout: execution.stdout,
          durationMs: execution.durationMs,
          ...(error ? { error } : {}),
        });
      }

      return {
        compiled: true,
        passed: results.every((result) => result.passed),
        results,
      };
    });
  }

  private async withRunSlot<T>(run: () => Promise<T>): Promise<T> {
    if (this.activeRuns >= MAX_PARALLEL_RUNS) {
      throw new ServiceUnavailableException(
        "Sandbox capacity is full; retry shortly",
      );
    }

    this.activeRuns += 1;
    try {
      return await run();
    } finally {
      this.activeRuns -= 1;
    }
  }

  private runContainer(
    source: string,
    input: string,
  ): Promise<ContainerResult> {
    const image =
      process.env.RUSTACADEMY_SANDBOX_IMAGE ??
      "rustacademy-wasm-sandbox:1.86-wasmtime-29.0.1";
    const sourceBuffer = Buffer.from(source, "utf8");
    const inputBuffer = Buffer.from(input, "utf8");
    const inputPayload = Buffer.concat([
      Buffer.from(`${sourceBuffer.length}\n`),
      sourceBuffer,
      Buffer.from(`${inputBuffer.length}\n`),
      inputBuffer,
    ]);
    const runnerCommand = [
      "IFS= read -r source_len",
      'head -c "$source_len" > /tmp/main.rs',
      "IFS= read -r input_len",
      'head -c "$input_len" > /tmp/stdin',
      `timeout -k 1s ${COMPILE_TIMEOUT_SECONDS}s rustc --edition=2021 --target=wasm32-wasip1 --crate-type=bin -o /tmp/main.wasm /tmp/main.rs`,
      `printf '%s\\n' '${COMPILE_SUCCESS_MARKER}' >&2`,
      `timeout -k 1s ${EXECUTION_TIMEOUT_SECONDS}s wasmtime run --fuel 10000000 --max-memory-size 16777216 /tmp/main.wasm < /tmp/stdin`,
    ].join(" && ");
    const args = [
      "run",
      "--rm",
      "-i",
      "--network=none",
      "--memory=512m",
      "--memory-swap=512m",
      "--cpus=0.5",
      "--pids-limit=32",
      "--read-only",
      "--tmpfs=/tmp:rw,nosuid,size=64m",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--user=65534:65534",
      image,
      "sh",
      "-c",
      runnerCommand,
    ];

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let timedOut = false;
      let settled = false;
      let child;

      try {
        child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
      } catch {
        reject(
          new ServiceUnavailableException("Sandbox runtime is unavailable"),
        );
        return;
      }

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, 15_000);

      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          child.kill("SIGKILL");
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(
              new PayloadTooLargeException("Sandbox output exceeded 64 KiB"),
            );
          }
          return;
        }
        if (target === "stdout") stdout += chunk.toString("utf8");
        else stderr += chunk.toString("utf8");
      };

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
      child.on("error", () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(
            new ServiceUnavailableException("Sandbox runtime is unavailable"),
          );
        }
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        const markerIndex = stderr.indexOf(COMPILE_SUCCESS_MARKER);
        const compiled = markerIndex >= 0;
        if (compiled) {
          stderr = `${stderr.slice(0, markerIndex)}${stderr.slice(
            markerIndex + COMPILE_SUCCESS_MARKER.length,
          )}`.replace(/^\r?\n/, "");
        }
        resolve({
          stdout,
          stderr,
          exitCode,
          timedOut: timedOut || exitCode === 124 || exitCode === 137,
          durationMs: Date.now() - startedAt,
          compiled,
        });
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(inputPayload);
    });
  }

  private normalizeOutput(output: string): string {
    return output.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  }
}
