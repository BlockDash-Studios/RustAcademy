import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { InAppNotification, NotificationEventType } from "./types/notification.types";

interface RawInAppNotification {
  id: string;
  public_key: string;
  event_type: string;
  event_id: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  occurred_at: string;
  created_at: string;
}

function mapRow(row: RawInAppNotification): InAppNotification {
  return {
    id: row.id,
    publicKey: row.public_key,
    eventType: row.event_type as NotificationEventType,
    eventId: row.event_id,
    title: row.title,
    body: row.body,
    metadata: (row.metadata as Record<string, unknown>) || {},
    isRead: row.is_read,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

@Injectable()
export class InAppNotificationRepository {
  private readonly logger = new Logger(InAppNotificationRepository.name);

  constructor(private readonly supabase: SupabaseService) {}

  async create(notification: Partial<InAppNotification>): Promise<InAppNotification> {
    const row = {
      public_key: notification.publicKey,
      event_type: notification.eventType,
      event_id: notification.eventId,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata || {},
      occurred_at: notification.occurredAt || new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from("in_app_notifications")
      .upsert(row, { onConflict: "public_key,event_type,event_id" })
      .select()
      .single();

    if (error) {
      this.logger.error(`Failed to create in-app notification: ${error.message}`);
      throw error;
    }

    return mapRow(data as RawInAppNotification);
  }

  async findMany(
    publicKey: string,
    limit = 20,
    offset = 0,
  ): Promise<{ data: InAppNotification[]; count: number }> {
    const { data, error, count } = await this.supabase
      .getClient()
      .from("in_app_notifications")
      .select("*", { count: "exact" })
      .eq("public_key", publicKey)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to fetch notifications for ${publicKey}: ${error.message}`);
      throw error;
    }

    return {
      data: (data || []).map(mapRow),
      count: count || 0,
    };
  }

  async markAsRead(id: string, publicKey: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from("in_app_notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("public_key", publicKey);

    if (error) {
      this.logger.error(`Failed to mark notification ${id} as read: ${error.message}`);
      throw error;
    }
  }

  async markAllAsRead(publicKey: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from("in_app_notifications")
      .update({ is_read: true })
      .eq("public_key", publicKey)
      .eq("is_read", false);

    if (error) {
      this.logger.error(`Failed to mark all notifications as read for ${publicKey}: ${error.message}`);
      throw error;
    }
  }
}
