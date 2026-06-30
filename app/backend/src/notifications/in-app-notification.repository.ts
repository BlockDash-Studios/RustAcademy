// src/notifications/in-app-notification.repository.ts

import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  applyCursorFilter,
  clampLimit,
  decodeCursor,
  paginateResult,
} from '../common/pagination/cursor.util';

export interface InAppNotificationPage {
  items: any[];
  next_cursor: string | null;
  has_more: boolean;
}

@Injectable()
export class InAppNotificationRepository {
  constructor(private readonly db: SupabaseService) {}

  async create(data: {
    publicKey: string;
    eventType: string;
    eventId: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.db.getClient().from("in_app_notifications").insert({
      ...data,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Fetch notifications for a user using cursor-based pagination.
   * Returns notifications ordered newest first.
   *
   * @param publicKey - The user's public key
   * @param limit - Max rows to return (capped at 100, default 20)
   * @param cursor - Opaque cursor string from a previous response, or undefined for first page
   */
  async findByUser(
    publicKey: string,
    limit?: number,
    cursor?: string,
  ): Promise<InAppNotificationPage> {
    const effectiveLimit = clampLimit(limit);
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    let query = this.db
      .getClient()
      .from("in_app_notifications")
      .select("*")
      .eq("publicKey", publicKey);

    query = applyCursorFilter(
      query,
      decodedCursor,
      "createdAt",
      false, // descending order (newest first)
      effectiveLimit,
    );

    const { data, error } = await query;

    if (error) {
      throw new Error(
        `Failed to fetch notifications for user ${publicKey}: ${error.message}`,
      );
    }

    const { data: pageData, next_cursor, has_more } = paginateResult(
      data ?? [],
      effectiveLimit,
      "createdAt",
    );

    return {
      items: pageData,
      next_cursor,
      has_more,
    };
  }

  async markAsRead(id: string) {
    return this.db.getClient().from("in_app_notifications").update({ read: true }).eq("id", id);
  }

  async markAllAsRead(publicKey: string) {
    return this.db
      .getClient()
      .from("in_app_notifications")
      .update({ read: true })
      .eq("publicKey", publicKey);
  }
}