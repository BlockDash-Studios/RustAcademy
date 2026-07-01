export class OfficeHoursEntity {
  id: string;
  tutorId: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  maxAttendees: number;
  currentAttendees: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<OfficeHoursEntity>) {
    Object.assign(this, partial);
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    this.isActive = this.isActive ?? true;
    this.currentAttendees = this.currentAttendees || 0;
    this.maxAttendees = this.maxAttendees || 10;
  }
}
