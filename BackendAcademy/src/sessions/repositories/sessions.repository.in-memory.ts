import { OfficeHoursEntity } from '../office-hours.entity';
import { ISessionsRepository } from './sessions.repository.interface';

/**
 * In-memory implementation of the sessions repository.
 * Stores office hours sessions in process-local Map.
 */
export class InMemorySessionsRepository implements ISessionsRepository {
  private readonly officeHours = new Map<string, OfficeHoursEntity>();

  create(officeHours: OfficeHoursEntity): OfficeHoursEntity {
    this.officeHours.set(officeHours.id, officeHours);
    return officeHours;
  }

  findAll(filters?: {
    tutorId?: string;
    startDate?: string;
    endDate?: string;
  }): OfficeHoursEntity[] {
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

  findById(id: string): OfficeHoursEntity | null {
    return this.officeHours.get(id) || null;
  }

  update(id: string, updates: Partial<OfficeHoursEntity>): OfficeHoursEntity | null {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return null;

    const updated = { ...officeHours, ...updates, updatedAt: new Date() };
    this.officeHours.set(id, updated);
    return updated;
  }

  remove(id: string): boolean {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return false;

    officeHours.isActive = false;
    officeHours.updatedAt = new Date();
    return true;
  }

  bookSlot(id: string): OfficeHoursEntity | null {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return null;

    if (officeHours.currentAttendees >= officeHours.maxAttendees) {
      throw new Error('Office hours are fully booked');
    }

    officeHours.currentAttendees++;
    officeHours.updatedAt = new Date();
    return officeHours;
  }

  cancelBooking(id: string): OfficeHoursEntity | null {
    const officeHours = this.officeHours.get(id);
    if (!officeHours) return null;

    if (officeHours.currentAttendees > 0) {
      officeHours.currentAttendees--;
      officeHours.updatedAt = new Date();
    }
    return officeHours;
  }

  clearAll(): void {
    this.officeHours.clear();
  }
}
