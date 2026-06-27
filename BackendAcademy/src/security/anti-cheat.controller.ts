import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AntiCheatService } from './anti-cheat.service';
import { CheckSubmissionDto } from './dto/check-submission.dto';
import { AntiCheatResult } from './interfaces/anti-cheat.interface';

/**
 * AntiCheatController
 *
 * Exposes HTTP endpoints for triggering AI-based anti-cheat checks.
 * These routes are intended for internal use (admin/grader services)
 * and should be guarded by an appropriate auth guard before production use.
 *
 * TODO: Add AuthGuard / RolesGuard to restrict access to trusted callers.
 */
@Controller('security/anti-cheat')
export class AntiCheatController {
  constructor(private readonly antiCheatService: AntiCheatService) {}

  /**
   * POST /security/anti-cheat/check
   *
   * Analyse a single submission.
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  async check(@Body() dto: CheckSubmissionDto): Promise<AntiCheatResult> {
    return this.antiCheatService.analyzeSubmission(dto);
  }

  /**
   * POST /security/anti-cheat/check-batch
   *
   * Analyse multiple submissions in one request.
   */
  @Post('check-batch')
  @HttpCode(HttpStatus.OK)
  async checkBatch(@Body() dtos: CheckSubmissionDto[]): Promise<AntiCheatResult[]> {
    return this.antiCheatService.analyzeSubmissions(dtos);
  }
}
