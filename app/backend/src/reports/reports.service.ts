import { BadRequestException, Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";

type PaymentRow = Record<string, unknown>;

type NormalizedPayment = {
  createdAt: string;
  publicKeys: string[];
  asset: string;
  amountUsd: number;
  status: string;
};

export type DailyActivitySummary = {
  date: string;
  transactionCount: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalVolumeUsd: number;
  averageTransactionUsd: number;
  primaryAsset: string | null;
};

export type DailyActivityProgress = {
  totalDays: number;
  activeDays: number;
  inactiveDays: number;
  activityRate: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  totalVolumeUsd: number;
  averageDailyVolumeUsd: number;
  currentActiveStreak: number;
  longestActiveStreak: number;
};

export type DailySummaryReport = {
  window: {
    startDate: string;
    endDate: string;
  };
  summaries: DailyActivitySummary[];
  progress: DailyActivityProgress;
};

@Injectable()
export class ReportsService {
  constructor(private readonly supabase: SupabaseService) {}

  async getDailySummaryReport(
    publicKey: string,
    startDate?: string,
    endDate?: string,
    includeEmptyDays = true,
    organizationId?: string,
  ): Promise<DailySummaryReport> {
    const { startIso, endIso } = this.resolveDateWindow(startDate, endDate);
    const rows = await this.fetchPaymentRows(
      publicKey,
      startIso,
      endIso,
      organizationId,
    );
    const payments = this.normalizeAndFilterRows(rows, publicKey);
    const fullSummaries = this.buildDailySummaries(
      payments,
      startIso,
      endIso,
      true,
    );
    const summaries = includeEmptyDays
      ? fullSummaries
      : fullSummaries.filter((item) => item.transactionCount > 0);

    return {
      window: {
        startDate: startIso,
        endDate: endIso,
      },
      summaries,
      progress: this.buildProgress(fullSummaries),
    };
  }

  private async fetchPaymentRows(
    publicKey: string,
    startIso: string,
    endIso: string,
    organizationId?: string,
  ): Promise<PaymentRow[]> {
    const client = this.supabase.getClient();

    let query = client
      .from("payment_records")
      .select("*")
      .or(
        `sender_public_key.eq.${publicKey},receiver_public_key.eq.${publicKey}`,
      )
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: true });

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data, error } = await query;

    if (error) {
      throw new BadRequestException({
        code: "REPORTS_QUERY_FAILED",
        message: `Failed to fetch payment records: ${error.message}`,
      });
    }

    return (data ?? []) as PaymentRow[];
  }

  private normalizeAndFilterRows(
    rows: PaymentRow[],
    publicKey: string,
  ): NormalizedPayment[] {
    return rows
      .map((row) => this.normalizeRow(row))
      .filter((row): row is NormalizedPayment => row !== null)
      .filter((row) => row.publicKeys.includes(publicKey));
  }

  private normalizeRow(row: PaymentRow): NormalizedPayment | null {
    const createdAt = this.readString(row, ["created_at", "createdAt"]);
    if (!createdAt) {
      return null;
    }

    const amount = this.readNumber(row, ["amount"]);
    const amountUsdRaw = this.readNumber(row, ["amount_usd", "amountUsd"]);
    const amountUsd = amountUsdRaw > 0 ? amountUsdRaw : amount;
    const asset = (
      this.readString(row, ["asset", "asset_code", "assetCode"]) ?? "XLM"
    ).toUpperCase();
    const status = (
      this.readString(row, ["status"]) ?? "unknown"
    ).toLowerCase();

    const publicKeys = [
      this.readString(row, ["sender_public_key", "from_address", "from"]),
      this.readString(row, ["receiver_public_key", "to_address", "to"]),
      this.readString(row, ["public_key", "publicKey"]),
    ].filter((item): item is string => Boolean(item));

    if (publicKeys.length === 0) {
      return null;
    }

    return {
      createdAt,
      publicKeys,
      asset,
      amountUsd,
      status,
    };
  }

  private buildDailySummaries(
    payments: NormalizedPayment[],
    startIso: string,
    endIso: string,
    includeEmptyDays: boolean,
  ): DailyActivitySummary[] {
    const buckets = new Map<
      string,
      {
        transactionCount: number;
        successfulTransactions: number;
        failedTransactions: number;
        totalVolumeUsd: number;
        assetVolumes: Map<string, number>;
      }
    >();

    payments.forEach((payment) => {
      const date = this.getDayKey(payment.createdAt);
      const current = buckets.get(date) ?? {
        transactionCount: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        totalVolumeUsd: 0,
        assetVolumes: new Map<string, number>(),
      };

      current.transactionCount += 1;
      current.totalVolumeUsd += payment.amountUsd;

      if (this.isSuccessfulStatus(payment.status)) {
        current.successfulTransactions += 1;
      }

      if (this.isFailedStatus(payment.status)) {
        current.failedTransactions += 1;
      }

      current.assetVolumes.set(
        payment.asset,
        (current.assetVolumes.get(payment.asset) ?? 0) + payment.amountUsd,
      );

      buckets.set(date, current);
    });

    const summaries = includeEmptyDays
      ? this.buildFullDateRange(startIso, endIso).map(
          (date) => this.toSummary(date, buckets.get(date)),
        )
      : Array.from(buckets.entries()).map(([date, bucket]) =>
          this.toSummary(date, bucket),
        );

    return summaries.sort((a, b) => a.date.localeCompare(b.date));
  }

  private toSummary(
    date: string,
    bucket?:
      | {
          transactionCount: number;
          successfulTransactions: number;
          failedTransactions: number;
          totalVolumeUsd: number;
          assetVolumes: Map<string, number>;
        }
      | undefined,
  ): DailyActivitySummary {
    const totalVolumeUsd = this.round2(bucket?.totalVolumeUsd ?? 0);
    const transactionCount = bucket?.transactionCount ?? 0;

    return {
      date,
      transactionCount,
      successfulTransactions: bucket?.successfulTransactions ?? 0,
      failedTransactions: bucket?.failedTransactions ?? 0,
      totalVolumeUsd,
      averageTransactionUsd: this.round2(
        totalVolumeUsd / Math.max(transactionCount, 1),
      ),
      primaryAsset: bucket ? this.getPrimaryAsset(bucket.assetVolumes) : null,
    };
  }

  private buildProgress(
    summaries: DailyActivitySummary[],
  ): DailyActivityProgress {
    const totalDays = summaries.length;
    const activeDays = summaries.filter((item) => item.transactionCount > 0).length;
    const totalTransactions = summaries.reduce(
      (sum, item) => sum + item.transactionCount,
      0,
    );
    const successfulTransactions = summaries.reduce(
      (sum, item) => sum + item.successfulTransactions,
      0,
    );
    const failedTransactions = summaries.reduce(
      (sum, item) => sum + item.failedTransactions,
      0,
    );
    const totalVolumeUsd = this.round2(
      summaries.reduce((sum, item) => sum + item.totalVolumeUsd, 0),
    );

    return {
      totalDays,
      activeDays,
      inactiveDays: Math.max(totalDays - activeDays, 0),
      activityRate: totalDays ? this.round2((activeDays / totalDays) * 100) : 0,
      totalTransactions,
      successfulTransactions,
      failedTransactions,
      totalVolumeUsd,
      averageDailyVolumeUsd: this.round2(totalVolumeUsd / Math.max(totalDays, 1)),
      currentActiveStreak: this.getCurrentActiveStreak(summaries),
      longestActiveStreak: this.getLongestActiveStreak(summaries),
    };
  }

  private getCurrentActiveStreak(summaries: DailyActivitySummary[]): number {
    let streak = 0;

    for (let index = summaries.length - 1; index >= 0; index -= 1) {
      if (summaries[index].transactionCount <= 0) {
        break;
      }
      streak += 1;
    }

    return streak;
  }

  private getLongestActiveStreak(summaries: DailyActivitySummary[]): number {
    let longest = 0;
    let current = 0;

    summaries.forEach((summary) => {
      if (summary.transactionCount > 0) {
        current += 1;
        longest = Math.max(longest, current);
        return;
      }

      current = 0;
    });

    return longest;
  }

  private getPrimaryAsset(assetVolumes: Map<string, number>): string | null {
    let topAsset: string | null = null;
    let topVolume = -1;

    assetVolumes.forEach((volume, asset) => {
      if (volume > topVolume) {
        topAsset = asset;
        topVolume = volume;
      }
    });

    return topAsset;
  }

  private buildFullDateRange(startIso: string, endIso: string): string[] {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const days: string[] = [];
    const cursor = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()),
    );
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
    );

    while (cursor <= last) {
      days.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(
          cursor.getUTCDate(),
        ).padStart(2, "0")}`,
      );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return days;
  }

  private getDayKey(createdAt: string): string {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return createdAt;
    }

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate(),
    ).padStart(2, "0")}`;
  }

  private isSuccessfulStatus(status: string): boolean {
    return ["completed", "paid", "success", "settled", "confirmed"].includes(
      status,
    );
  }

  private isFailedStatus(status: string): boolean {
    return ["failed", "error", "cancelled", "rejected"].includes(status);
  }

  private readString(row: PaymentRow, keys: string[]): string | null {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  private readNumber(row: PaymentRow, keys: string[]): number {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return 0;
  }

  private resolveDateWindow(
    startDate?: string,
    endDate?: string,
  ): { startIso: string; endIso: string } {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException({
        code: "INVALID_DATE_RANGE",
        message: "startDate and endDate must be valid ISO-8601 strings",
      });
    }

    if (start > end) {
      throw new BadRequestException({
        code: "INVALID_DATE_RANGE",
        message: "startDate must be earlier than or equal to endDate",
      });
    }

    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
