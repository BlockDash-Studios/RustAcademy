import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { AuditAction } from './audit.types';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Records a new audit log entry in the database.
   */
  async log(
    actor: string,
    action: AuditAction | string,
    target: string,
    metadata: Record<string, any> = {},
    requestId?: string,
  ): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error } = await client.from('audit_logs').insert({
      actor,
      action,
      target,
      metadata,
      request_id: requestId || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      this.logger.error(`Failed to write audit log: ${error.message}`);
    } else {
      this.logger.debug(`Audit log entry created: ${action} by ${actor} on ${target}`);
    }
  }

  /**
   * Queries audit logs with filtering and pagination.
   */
  async findLogs(filters: {
    actor?: string;
    action?: string;
    target?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const client = this.supabaseService.getClient();
    let query = client.from('audit_logs').select('*', { count: 'exact' });

    if (filters.actor) query = query.eq('actor', filters.actor);
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.target) query = query.eq('target', filters.target);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate) query = query.lte('created_at', filters.endDate);

    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      this.logger.error(`Failed to query audit logs: ${error.message}`);
      throw error;
    }

    return {
      data: data || [],
      total: count || 0,
      limit,
      offset,
    };
  }

  /**
   * Deletes logs older than the specified number of days.
   */
  async pruneOldLogs(days: number): Promise<number> {
    const client = this.supabaseService.getClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const { error, count } = await client
      .from('audit_logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff.toISOString());

    if (error) {
      this.logger.error(`Failed to prune audit logs: ${error.message}`);
      throw error;
    }

    this.logger.log(`Pruned ${count} old audit logs (older than ${days} days)`);
    return count || 0;
  }

  /**
   * Daily task to prune old logs (older than 90 days)
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleLogRetention() {
    this.logger.log('Running daily audit log retention task...');
    await this.pruneOldLogs(90);
  }
}
