import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { UsersService, UserPreferencesDto } from './users.service';
import {
  JwtAuthGuard,
  RolesGuard,
  SubjectOwnershipGuard,
  Roles,
  Ownership,
  UserRole,
} from '../auth';

/**
 * Users API.
 *
 * `PUT /users/:userId/preferences` is subject-owned: callers may only
 * update their own preferences unless they are an admin.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put(':userId/preferences')
  @UseGuards(JwtAuthGuard, RolesGuard, SubjectOwnershipGuard)
  @Roles(UserRole.LEARNER, UserRole.TUTOR, UserRole.ADMIN)
  @Ownership('userId')
  async updatePreferences(
    @Param('userId') userId: string,
    @Body() dto: UserPreferencesDto,
  ) {
    return this.usersService.updatePreferences(userId, dto);
  }
}