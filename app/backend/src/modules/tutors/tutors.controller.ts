import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { TutorsService } from './tutors.service';
import { TutorApplicationDto } from './dto/tutor-application.dto';

@Controller('api/v1/tutors')
export class TutorsController {
    constructor(private readonly tutorsService: TutorsService) {}

    @Post('apply')
    async apply(@Req() req: any, @Body() dto: TutorApplicationDto) {
        const userId = req.user?.id || 'mock-user-id';
        return this.tutorsService.applyForTutor(userId, dto);
    }

    @Get('admin/pending')
    async getPending(@Req() req: any) {
        const adminId = req.user?.id || 'mock-admin-id';
        return this.tutorsService.getPendingApplications(adminId);
    }

    @Patch('admin/review/:userId')
    async review(
        @Req() req: any,
        @Param('userId') targetUserId: string,
        @Body('approved') approved: boolean,
    ) {
        const adminId = req.user?.id || 'mock-admin-id';
        return this.tutorsService.reviewApplication(adminId, targetUserId, approved);
    }
}