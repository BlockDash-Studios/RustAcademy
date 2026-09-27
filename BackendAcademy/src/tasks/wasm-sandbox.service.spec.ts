import { BadRequestException } from '@nestjs/common';
import { TaskEntity } from './task.entity';
import { WasmSandboxService } from './wasm-sandbox.service';

describe('WasmSandboxService', () => {
  let service: WasmSandboxService;

  beforeEach(() => {
    service = new WasmSandboxService();
  });

  it('compiles once and returns each case result', async () => {
    const runProcess = jest
      .spyOn(service as any, 'runProcess')
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 12,
        timedOut: false,
        outputExceeded: false,
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'hello\r\n',
        stderr: '',
        durationMs: 8,
        timedOut: false,
        outputExceeded: false,
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'wrong',
        stderr: '',
        durationMs: 11,
        timedOut: false,
        outputExceeded: false,
      });

    const result = await service.execute(
      {
        testCases: ['first input', 'second input'],
        expectedOutput: 'hello',
      } as TaskEntity,
      'fn main() {}',
    );

    expect(result).toEqual({
      compiled: true,
      passed: false,
      results: [
        { index: 0, passed: true, stdout: 'hello\r\n', durationMs: 8 },
        { index: 1, passed: false, stdout: 'wrong', durationMs: 11 },
      ],
    });
    expect(runProcess).toHaveBeenCalledTimes(3);
    expect(runProcess.mock.calls[1][2]).toBe('first input');
    expect(runProcess.mock.calls[2][2]).toBe('second input');
  });

  it('rejects tasks without test cases', async () => {
    await expect(
      service.execute({ testCases: [] } as TaskEntity, 'fn main() {}'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
