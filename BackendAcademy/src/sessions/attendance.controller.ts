import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JoinSessionAttendanceDto } from './dto/join-session-attendance.dto';
import { LeaveSessionAttendanceDto } from './dto/leave-session-attendance.dto';

@Controller('sessions/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('join')
  async join(@Body() dto: JoinSessionAttendanceDto) {
    const record = await this.attendanceService.join(dto.sessionKey, dto.userId);
    return {
      id: record.id,
      sessionKey: record.sessionKey,
      userId: record.userId,
      joinedAt: record.joinedAt,
      leftAt: record.leftAt,
      durationSeconds: record.durationSeconds,
      isActive: record.isActive,
    };
  }

  @Post('leave')
  async leave(@Body() dto: LeaveSessionAttendanceDto) {
    const record = await this.attendanceService.leave(dto.sessionKey, dto.userId);
    return {
      id: record.id,
      sessionKey: record.sessionKey,
      userId: record.userId,
      joinedAt: record.joinedAt,
      leftAt: record.leftAt,
      durationSeconds: record.durationSeconds,
      isActive: record.isActive,
    };
  }

  @Get(':sessionKey/stats')
  async stats(@Param('sessionKey') sessionKey: string) {
    return this.attendanceService.getSessionStats(sessionKey);
  }
}

