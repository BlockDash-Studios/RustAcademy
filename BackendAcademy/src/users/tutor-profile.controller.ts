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

  @Get(':id/reviews')
  async getReviews(@Param('id', ParseUUIDPipe) id: string) {
    return this.tutorService.getReviews(id);
  }

  @Get(':id/reputation')
  async getReputation(@Param('id', ParseUUIDPipe) id: string) {
    return this.tutorService.getReputation(id);
  }
}