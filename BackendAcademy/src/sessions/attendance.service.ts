import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendanceEntity } from './attendance.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceEntity)
    private readonly attendanceRepo: Repository<AttendanceEntity>,
  ) {}

  async join(sessionKey: string, userId: string): Promise<AttendanceEntity> {
    const now = new Date();

    const existing = await this.attendanceRepo.findOne({
      where: {
        sessionKey,
        userId,
        isActive: true,
      },
      order: { joinedAt: 'DESC' },
    });

    if (existing) {
      return existing;
    }

    const record = this.attendanceRepo.create({
      sessionKey,
      userId,
      joinedAt: now,
      isActive: true,
      leftAt: null,
      durationSeconds: null,
    });

    return this.attendanceRepo.save(record);
  }

  async leave(sessionKey: string, userId: string): Promise<AttendanceEntity> {
    const existing = await this.attendanceRepo.findOne({
      where: {
        sessionKey,
        userId,
        isActive: true,
      },
      order: { joinedAt: 'DESC' },
    });

    if (!existing) {
      throw new BadRequestException('No active attendance found for this user/session');
    }

    const now = new Date();
    const durationMs = now.getTime() - existing.joinedAt.getTime();
    const durationSeconds = Math.max(0, Math.floor(durationMs / 1000));

    existing.isActive = false;
    existing.leftAt = now;
    existing.durationSeconds = durationSeconds;

    return this.attendanceRepo.save(existing);
  }

  async getSessionStats(sessionKey: string): Promise<{
    presentCount: number;
    totalJoins: number;
    totalDurationSeconds: number;
  }> {
    const active = await this.attendanceRepo.count({
      where: {
        sessionKey,
        isActive: true,
      },
    });

    const all = await this.attendanceRepo.find({ where: { sessionKey } });

    const totalJoins = all.length;
    const totalDurationSeconds = all.reduce((acc, r) => acc + (r.durationSeconds ?? 0), 0);

    return {
      presentCount: active,
      totalJoins,
      totalDurationSeconds,
    };
  }
}

