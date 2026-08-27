import { OfficeHoursEntity } from '../office-hours.entity';

/**
 * Repository interface for sessions storage.
 * Isolates persistence concerns from business logic.
 */
export interface ISessionsRepository {
  /**
   * Create a new office hours session.
   */
  create(officeHours: OfficeHoursEntity): OfficeHoursEntity;

  /**
   * Get all office hours sessions, optionally filtered.
   */
  findAll(filters?: {
    tutorId?: string;
    startDate?: string;
    endDate?: string;
  }): OfficeHoursEntity[];

  /**
   * Find a session by ID.
   */
  findById(id: string): OfficeHoursEntity | null;

  /**
   * Update a session.
   */
  update(id: string, updates: Partial<OfficeHoursEntity>): OfficeHoursEntity | null;

  /**
   * Remove a session (soft delete by setting isActive to false).
   */
  remove(id: string): boolean;

  /**
   * Book a slot in a session.
   */
  bookSlot(id: string): OfficeHoursEntity | null;

  /**
   * Cancel a booking in a session.
   */
  cancelBooking(id: string): OfficeHoursEntity | null;

  /**
   * Clear all session data (useful for testing).
   */
  clearAll(): void;
}
