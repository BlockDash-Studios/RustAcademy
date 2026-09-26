import { Controller, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('api/v1/users')
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get('me')
    async getMyProfile(@Req() req: any) {
        const userId = req.user?.id || 'mock-user-id';
        return this.usersService.getPublicProfile(userId);
    }

    @Patch('me')
    async updateMyProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
        const userId = req.user?.id || 'mock-user-id';
        return this.usersService.updateProfile(userId, dto);
    }

    @Get(':id/public')
    async getPublicProfile(@Param('id') id: string) {
        return this.usersService.getPublicProfile(id);
    }
}