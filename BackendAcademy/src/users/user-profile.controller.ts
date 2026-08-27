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
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { UserProfileService } from './user-profile.service';
import { UserProfileEntity } from './user-profile.entity';
import {
  JwtAuthGuard,
  RolesGuard,
  Roles,
  UserRole,
  JwtPayload,
  assertSameSubject,
} from '../auth';

type AuthedRequest = Request & { user: JwtPayload };

/**
 * User profile API.
 *
 * Reads stay public; writes are gated on authentication and ownership so
 * a user can only create/edit/delete their own profile.
 */
@Controller('user-profiles')
export class UserProfileController {
  constructor(private readonly profileService: UserProfileService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async create(
    @Body() dto: Partial<UserProfileEntity>,
    @Req() req: AuthedRequest,
  ) {
    // The subject always comes from the JWT; ignore any client-supplied userId.
    return this.profileService.create({ ...dto, userId: req.user.sub });
  }

  @Get()
  async findAll() {
    return this.profileService.findAll();
  }

  @Get('user/:userId')
  async findByUserId(@Param('userId') userId: string) {
    return this.profileService.findByUserId(userId);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.profileService.findById(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updates: Partial<UserProfileEntity>,
    @Req() req: AuthedRequest,
  ) {
    const profile = await this.profileService.findById(id);
    if (!profile) {
      throw new BadRequestException({ statusCode: 404, message: 'Profile not found' });
    }
    assertSameSubject(req.user, profile.userId, 'profile');
    // Never allow reassigning the profile to another subject.
    return this.profileService.update(id, { ...updates, userId: profile.userId });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    const profile = await this.profileService.findById(id);
    if (!profile) {
      throw new BadRequestException({ statusCode: 404, message: 'Profile not found' });
    }
    assertSameSubject(req.user, profile.userId, 'profile');
    return this.profileService.remove(id);
  }
}