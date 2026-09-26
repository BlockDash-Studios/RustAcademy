import {
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { spawn } from 'child_process';

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_PARALLEL_RUNS = 50;

@Injectable()
export class SandboxService {
  private activeRuns = 0;

  async runRust(source: string): Promise<SandboxResult> {
    if (this.activeRuns >= MAX_PARALLEL_RUNS) {
      throw new ServiceUnavailableException('Sandbox capacity is full; retry shortly');
    }

    this.activeRuns += 1;
    try {
      return await this.runContainer(source);
    } finally {
      this.activeRuns -= 1;
    }
  }

  private runContainer(source: string): Promise<SandboxResult> {
    const image = process.env.RUSTACADEMY_SANDBOX_IMAGE ?? 'rust:1.86-slim';
    const args = [
      'run', '--rm', '-i',
      '--network=none',
      '--memory=128m',
      '--memory-swap=128m',
      '--cpus=0.5',
      '--pids-limit=32',
      '--read-only',
      '--tmpfs=/tmp:rw,nosuid,size=64m',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--user=65534:65534',
      image,
      'sh', '-c',
      'timeout -k 1s 10s sh -c \'cat > /tmp/main.rs && rustc /tmp/main.rs -o /tmp/main && /tmp/main\'',
    ];

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let timedOut = false;
      let settled = false;
      const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, 12_000);

      const append = (target: 'stdout' | 'stderr', chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > MAX_OUTPUT_BYTES) {
          child.kill('SIGKILL');
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new PayloadTooLargeException('Sandbox output exceeded 64 KiB'));
          }
          return;
        }
        if (target === 'stdout') stdout += chunk.toString('utf8');
        else stderr += chunk.toString('utf8');
      };

      child.stdout.on('data', (chunk: Buffer) => append('stdout', chunk));
      child.stderr.on('data', (chunk: Buffer) => append('stderr', chunk));
      child.on('error', () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new ServiceUnavailableException('Sandbox runtime is unavailable'));
        }
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve({ stdout, stderr, exitCode, timedOut: timedOut || exitCode === 124 || exitCode === 137 });
      });
      child.stdin.end(source);
    });
  }
}