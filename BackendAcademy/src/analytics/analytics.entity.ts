export class AnalyticsEvent {
  id: string;
  eventType: string;
  userId?: string;
  sessionId?: string;
  properties?: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;

  constructor(data: Partial<AnalyticsEvent>) {
    this.id = data.id || crypto.randomUUID();
    this.eventType = data.eventType || '';
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.properties = data.properties;
    this.timestamp = data.timestamp || new Date();
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
  }
}
