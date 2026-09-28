import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SandboxService } from "./sandbox.service";

describe("SandboxService", () => {
  let service: SandboxService;

  beforeEach(() => {
    service = new SandboxService();
  });

  it("returns pass/fail and output for each test case", async () => {
    const runContainer = jest
      .spyOn(service as any, "runContainer")
      .mockResolvedValueOnce({
        stdout: "42\r\n",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        durationMs: 34,
        compiled: true,
      })
      .mockResolvedValueOnce({
        stdout: "wrong",
        stderr: "",
        exitCode: 0,
        timedOut: false,
        durationMs: 29,
        compiled: true,
      });

    const result = await service.runRustTests(
      "fn main() {}",
      ["1\n", "2\n"],
      "42",
    );

    expect(result).toEqual({
      compiled: true,
      passed: false,
      results: [
        { index: 0, passed: true, stdout: "42\r\n", durationMs: 34 },
        { index: 1, passed: false, stdout: "wrong", durationMs: 29 },
      ],
    });
    expect(runContainer).toHaveBeenCalledTimes(2);
    expect(runContainer.mock.calls[0]).toEqual(["fn main() {}", "1\n"]);
    expect(runContainer.mock.calls[1]).toEqual(["fn main() {}", "2\n"]);
  });

  it("reports compilation failure without running test cases", async () => {
    jest.spyOn(service as any, "runContainer").mockResolvedValueOnce({
      stdout: "",
      stderr: "error: expected item",
      exitCode: 1,
      timedOut: false,
      durationMs: 16,
      compiled: false,
    });

    await expect(
      service.runRustTests("not rust", ["input"], "output"),
    ).resolves.toEqual({
      compiled: false,
      passed: false,
      results: [],
      compileError: "error: expected item",
    });
  });

  it("rejects empty test-case lists", async () => {
    await expect(
      service.runRustTests("fn main() {}", [], ""),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
