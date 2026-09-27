import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { RecordTaskResultDto } from './dto/record-task-result.dto';
import { RegisterCertificateCriteriaDto } from './dto/register-certificate-criteria.dto';

/**
 * REST surface for certification eligibility (BE-042).
 *
 * Base path: /api/v1/certificates
 *
 * The certificate minting job calls the eligibility routes below before it
 * mints a `certificate_nft`; the POST routes are how the grading pipeline makes
 * course requirements and final task scores known to that check. The controller
 * stays thin — `CertificatesService` owns the rules and NestJS maps its
 * exceptions to status codes:
 *
 *   NotFoundException   (404) → unknown course criteria / task not required
 *   ConflictException   (409) → criteria already registered
 *   BadRequestException (400) → thin criteria / score outside 0–100
 */
@ApiTags('certificates')
@Controller('v1/certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post('courses')
  @ApiOperation({ summary: 'Register the tasks and minimum score a certificate requires' })
  registerCourse(@Body() dto: RegisterCertificateCriteriaDto) {
    return this.certificates.registerCourse(dto);
  }

  @Post('results')
  @ApiOperation({ summary: 'Record a learner’s final task score from the grading pipeline' })
  recordTaskResult(@Body() dto: RecordTaskResultDto) {
    return this.certificates.recordTaskResult(dto);
  }

  @Get('users/:userId/courses/:courseId/eligibility')
  @ApiOperation({ summary: 'Check whether a learner is eligible for a course certificate' })
  checkEligibility(@Param('userId') userId: string, @Param('courseId') courseId: string) {
    return this.certificates.checkEligibility(userId, courseId);
  }

  @Get('courses/:courseId/eligible-learners')
  @ApiOperation({ summary: 'List learners the minting job may issue a certificate to' })
  listEligibleLearners(@Param('courseId') courseId: string) {
    const learners = this.certificates.listEligibleLearners(courseId);
    return { courseId, count: learners.length, learners };
  }
}
