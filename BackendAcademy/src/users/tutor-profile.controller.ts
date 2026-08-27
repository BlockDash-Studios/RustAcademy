import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { TutorProfileService } from './tutor-profile.service';
import { CreateTutorProfileDto } from './dto/create-tutor-profile.dto';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto';
import { RateTutorDto } from './dto/rate-tutor.dto';
import { TutorProfileEntity } from './tutor-profile.entity';
import {
  JwtAuthGuard,
  JwtAdminGuard,
  RolesGuard,
  Roles,
  UserRole,
  JwtPayload,
  assertSameSubject,
} from '../auth';

type AuthedRequest = Request & { user: JwtPayload };

/**
 * Tutor profile API.
 *
 * Public surface (browse/list verified tutors) stays open. Privileged
 * routes declare their required roles via @Roles and verify that a tutor
 * only touches their own profile via subject-ownership checks.
 */
@Controller('tutors')
export class TutorProfileController {
  constructor(private readonly tutorService: TutorProfileService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async create(
    @Body() dto: CreateTutorProfileDto,
    @Req() req: AuthedRequest,
  ): Promise<TutorProfileEntity> {
    // The profile owner is always the authenticated subject; never trust a
    // client-supplied userId.
    return this.tutorService.create({ ...dto, userId: req.user.sub });
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
  @UseGuards(JwtAdminGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async getEarningsSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ): Promise<ReturnType<TutorProfileService['getEarningsSummary']>> {
    const profile = await this.tutorService.findById(id);
    if (!profile) {
      throw new NotFoundException('Tutor profile not found');
    }
    assertSameSubject(req.user, profile.userId, 'tutor profile');
    return this.tutorService.getEarningsSummary(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TUTOR, UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTutorProfileDto,
    @Req() req: AuthedRequest,
  ): Promise<TutorProfileEntity | null> {
    const profile = await this.tutorService.findById(id);
    if (!profile) {
      throw new NotFoundException('Tutor profile not found');
    }
    assertSameSubject(req.user, profile.userId, 'tutor profile');
    return this.tutorService.update(id, dto);
  }

  @Post(':id/rate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async rate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateTutorDto,
    @Req() req: AuthedRequest,
  ): Promise<TutorProfileEntity> {
    const profile = await this.tutorService.findById(id);
    if (!profile) {
      throw new NotFoundException('Tutor profile not found');
    }
    if (profile.userId === req.user.sub) {
      throw new ForbiddenException({
        error: 'SELF_RATE_FORBIDDEN',
        message: 'You cannot rate your own tutor profile',
      });
    }
    return this.tutorService.rate(id, { ...dto, raterUserId: req.user.sub });
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