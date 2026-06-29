import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { SupabaseService } from "../supabase/supabase.service";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  let service: ReportsService;

  const sampleRows = [
    {
      created_at: "2026-06-01T09:00:00.000Z",
      sender_public_key:
        "GA1234567890123456789012345678901234567890123456789012345",
      receiver_public_key:
        "GB1234567890123456789012345678901234567890123456789012345",
      amount: "10",
      amount_usd: "10",
      asset: "USDC",
      status: "completed",
    },
    {
      created_at: "2026-06-01T13:00:00.000Z",
      sender_public_key:
        "GB1234567890123456789012345678901234567890123456789012345",
      receiver_public_key:
        "GC1234567890123456789012345678901234567890123456789012345",
      amount: "5",
      amount_usd: "5",
      asset_code: "XLM",
      status: "failed",
    },
    {
      created_at: "2026-06-03T15:30:00.000Z",
      from_address:
        "GB1234567890123456789012345678901234567890123456789012345",
      to_address:
        "GD1234567890123456789012345678901234567890123456789012345",
      amount: "25",
      amount_usd: "0",
      asset: "USDC",
      status: "paid",
    },
  ];

  const queryBuilder: {
    select: jest.Mock;
    or: jest.Mock;
    gte: jest.Mock;
    lte: jest.Mock;
    order: jest.Mock;
    eq: jest.Mock;
    then?: Promise<unknown>["then"];
  } = {
    select: jest.fn(),
    or: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
    order: jest.fn(),
    eq: jest.fn(),
  };

  const mockClient = {
    from: jest.fn(() => queryBuilder),
  };

  const mockSupabaseService = {
    getClient: jest.fn(() => mockClient),
  };

  beforeEach(async () => {
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.or.mockReturnValue(queryBuilder);
    queryBuilder.gte.mockReturnValue(queryBuilder);
    queryBuilder.lte.mockReturnValue(queryBuilder);
    queryBuilder.eq.mockReturnValue(queryBuilder);
    queryBuilder.order.mockReturnValue(queryBuilder);
    queryBuilder.then = (resolve) =>
      Promise.resolve(resolve?.({ data: sampleRows, error: null }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    jest.clearAllMocks();
  });

  it("builds daily summaries with zero-activity days and progress", async () => {
    const report = await service.getDailySummaryReport(
      "GB1234567890123456789012345678901234567890123456789012345",
      "2026-06-01T00:00:00.000Z",
      "2026-06-03T23:59:59.999Z",
      true,
    );

    expect(report.summaries).toHaveLength(3);
    expect(report.summaries[0]).toMatchObject({
      date: "2026-06-01",
      transactionCount: 2,
      successfulTransactions: 1,
      failedTransactions: 1,
      totalVolumeUsd: 15,
      primaryAsset: "USDC",
    });
    expect(report.summaries[1]).toMatchObject({
      date: "2026-06-02",
      transactionCount: 0,
      totalVolumeUsd: 0,
      primaryAsset: null,
    });
    expect(report.progress).toMatchObject({
      totalDays: 3,
      activeDays: 2,
      inactiveDays: 1,
      activityRate: 66.67,
      totalTransactions: 3,
      successfulTransactions: 2,
      failedTransactions: 1,
      totalVolumeUsd: 40,
      averageDailyVolumeUsd: 13.33,
      currentActiveStreak: 1,
      longestActiveStreak: 1,
    });
  });

  it("omits empty days when requested", async () => {
    const report = await service.getDailySummaryReport(
      "GB1234567890123456789012345678901234567890123456789012345",
      "2026-06-01T00:00:00.000Z",
      "2026-06-03T23:59:59.999Z",
      false,
    );

    expect(report.summaries).toHaveLength(2);
    expect(report.summaries.map((item) => item.date)).toEqual([
      "2026-06-01",
      "2026-06-03",
    ]);
    expect(report.progress.inactiveDays).toBe(1);
  });

  it("applies organization scoping when present", async () => {
    await service.getDailySummaryReport(
      "GB1234567890123456789012345678901234567890123456789012345",
      "2026-06-01T00:00:00.000Z",
      "2026-06-03T23:59:59.999Z",
      true,
      "org_123",
    );

    expect(queryBuilder.eq).toHaveBeenCalledWith("organization_id", "org_123");
  });

  it("throws on invalid dates", async () => {
    await expect(
      service.getDailySummaryReport(
        "GB1234567890123456789012345678901234567890123456789012345",
        "invalid-date",
        "2026-06-03T23:59:59.999Z",
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
