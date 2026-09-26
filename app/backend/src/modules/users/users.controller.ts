// src/modules/users/users.controller.ts
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { LearnerProfileResponseDto } from './dto/learner-profile.dto';

@Controller('api/v1/users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get(':id/profile')
    async getProfile(@Param('id') id: string): Promise<LearnerProfileResponseDto> {
        return this.usersService.getLearnerProfile(id);
    }
}