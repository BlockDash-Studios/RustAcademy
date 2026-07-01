import { Injectable, NotFoundException } from '@nestjs/common';
import { OfficeHoursEntity } from './office-hours.entity';
import { CreateOfficeHoursDto } from './dto/create-office-hours.dto';
import { ListOfficeHoursDto } from './dto/list-office-hours.dto';

@Injectable()
export class OfficeHoursService {
  private readonly officeHours: Map<string, OfficeHoursEntity> = new Map();

  async create(dto: CreateOfficeHoursDto): Promise<OfficeHoursEntity> {
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (endTime <= startTime) {
      throw new Error('End time must be after start time');
    }

    const officeHours = new OfficeHoursEntity({
      id: crypto.randomUUID(),
      tutorId: dto.tutorId,
      title: dto.title,
      description: dto.description,
      startTime,
      endTime,
      maxAttendees: dto.maxAttendees || 10,
    });
    this.officeHours.set(officeHours.id, officeHours);
    return officeHours;
  }

  async findAll(filters?: ListOfficeHoursDto): Promise<OfficeHoursEntity[]> {
    let results = Array.from(this.officeHours.values()).filter(oh => oh.isActive);

    if (filters?.tutorId) {
      results = results.filter(oh => oh.tutorId === filters.tutorId);
    }

    if (filters?.startDate) {
      const startDate = new Date(filters.startDate);
      results = results.filter(oh => oh.startTime >= startDate);
    }

    if (filters?.endDate) {
      const endDate = new Date(filters.endDate);
      results = results.filter(oh => oh.endTime <= endDate);
    }

    return results.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  async findById(id: string): Promise<OfficeHoursEntity | null> {
    return this.officeHours.get(id) || null;
  }

  async update(id: string, dto: Partial<CreateOfficeHoursDto>): Promise<OfficeHoursEntity | null> {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return null;

    if (dto.startTime) {
      officeHours.startTime = new Date(dto.startTime);
    }
    if (dto.endTime) {
      officeHours.endTime = new Date(dto.endTime);
    }
    if (dto.title) {
      officeHours.title = dto.title;
    }
    if (dto.description) {
      officeHours.description = dto.description;
    }
    if (dto.maxAttendees !== undefined) {
      officeHours.maxAttendees = dto.maxAttendees;
    }

    officeHours.updatedAt = new Date();
    return officeHours;
  }

  async remove(id: string): Promise<boolean> {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return false;
    
    officeHours.isActive = false;
    officeHours.updatedAt = new Date();
    return true;
  }

  async bookSlot(id: string): Promise<OfficeHoursEntity | null> {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return null;

    if (officeHours.currentAttendees >= officeHours.maxAttendees) {
      throw new Error('Office hours are fully booked');
    }

    officeHours.currentAttendees++;
    officeHours.updatedAt = new Date();
    return officeHours;
  }

  async cancelBooking(id: string): Promise<OfficeHoursEntity | null> {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return null;

    if (officeHours.currentAttendees > 0) {
      officeHours.currentAttendees--;
      officeHours.updatedAt = new Date();
    }
    return officeHours;
  }
}
