import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TutorProfileService } from './tutor-profile.service';
import { CreateTutorProfileDto } from './dto/create-tutor-profile.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { RateTutorDto } from './dto/rate-tutor.dto';
import { VerifyTutorDto } from './dto/verify-tutor.dto';
import { RequestVerificationDto } from './dto/request-verification.dto';
import { TutorProfileEntity } from './tutor-profile.entity';

@Controller('tutors')
export class TutorProfileController {
  constructor(private readonly tutorService: TutorProfileService) {}

  @Post()
  async create(@Body() dto: CreateTutorProfileDto): Promise<TutorProfileEntity> {
    return this.tutorService.create(dto);
  }

  // ---- Static collection routes (MUST come before /:id) -----------------

  @Get()
  async findAll(): Promise<TutorProfileEntity[]> {
    return this.tutorService.findAll();
  }

  @Get('verified')
  async listVerified(): Promise<TutorProfileEntity[]> {
    return this.tutorService.findVerified();
  }

  @Get('pending')
  async listPending(): Promise<TutorProfileEntity[]> {
    return this.tutorService.findPending();
  }

  @Get('user/:userId')
  async findByUserId(@Param('userId') userId: string): Promise<TutorProfileEntity | null> {
    return this.tutorService.findByUserId(userId);
  }

  @Get('specialty/:specialty')
  async findBySpecialty(@Param('specialty') specialty: string): Promise<TutorProfileEntity[]> {
    return this.tutorService.findBySpecialty(specialty);
  }

  // ---- Parameterized routes (must come after static routes) ------------

  @Get(':id')
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TutorProfileEntity | null> {
    return this.tutorService.findById(id);
  }

  @Get(':id/earnings')
  async getEarningsSummary(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReturnType<TutorProfileService['getEarningsSummary']>> {
    return this.tutorService.getEarningsSummary(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTutorProfileDto,
  ): Promise<TutorProfileEntity | null> {
    return this.tutorService.update(id, dto);
  }

  @Post(':id/rate')
  async rate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateTutorDto,
  ): Promise<TutorProfileEntity> {
    return this.tutorService.rate(id, dto);
  }

  // ---- Verification lifecycle endpoints --------------------------------

  /**
   * Tutor requests verification (moves status -> PENDING).
   * Idempotent if already VERIFIED.
   */
  @Post(':id/request-verification')
  async requestVerification(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestVerificationDto,
  ): Promise<TutorProfileEntity> {
    return this.tutorService.requestVerification(id, dto);
  }

  /**
   * Admin verifies a tutor. Records audit metadata (verifiedAt, verifiedBy,
   * optional verificationNote). Idempotent if already VERIFIED.
   */
  @Post(':id/verify')
  async verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyTutorDto,
  ): Promise<TutorProfileEntity> {
    return this.tutorService.verify(id, dto);
  }

  /**
   * Admin removes a tutor's verification. Wipes all audit metadata so
   * downstream consumers never read stale "last verified at" timestamps.
   */
  @Post(':id/unverify')
  async unverify(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TutorProfileEntity> {
    return this.tutorService.unverify(id);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<boolean> {
    return this.tutorService.remove(id);
  }
}
