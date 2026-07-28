import { Injectable, OnModuleInit } from '@nestjs/common';

export interface CouponRecord {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxRedemptions: number;
  currentRedemptions: number;
  expiresAt: Date | null;
  minPurchaseAmount: number;
  applicablePlans: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RedemptionRecord {
  id: string;
  couponId: string;
  code: string;
  userId: string;
  amount: number;
  discountApplied: number;
  redeemedAt: Date;
  orderId: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private coupons: Map<string, CouponRecord> = new Map();
  private redemptions: RedemptionRecord[] = [];

  onModuleInit() {
    this.seedSampleCoupons();
  }

  private seedSampleCoupons() {
    const sample: CouponRecord[] = [
      {
        id: 'coupon-stellar10',
        code: 'STELLAR10',
        discountType: 'percentage',
        discountValue: 10,
        maxRedemptions: 100,
        currentRedemptions: 0,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        minPurchaseAmount: 0,
        applicablePlans: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'coupon-academy25',
        code: 'ACADEMY25',
        discountType: 'fixed',
        discountValue: 25,
        maxRedemptions: 50,
        currentRedemptions: 0,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        minPurchaseAmount: 100,
        applicablePlans: ['premium', 'pro'],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    sample.forEach((c) => this.coupons.set(c.id, c));
  }

  async createCoupon(coupon: CouponRecord): Promise<CouponRecord> {
    this.coupons.set(coupon.id, coupon);
    return coupon;
  }

  async getCouponById(id: string): Promise<CouponRecord | null> {
    return this.coupons.get(id) ?? null;
  }

  async getCouponByCode(code: string): Promise<CouponRecord | null> {
    for (const coupon of this.coupons.values()) {
      if (coupon.code === code) return coupon;
    }
    return null;
  }

  async getAllCoupons(): Promise<CouponRecord[]> {
    return Array.from(this.coupons.values());
  }

  async updateCoupon(id: string, updates: Partial<CouponRecord>): Promise<CouponRecord | null> {
    const existing = this.coupons.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date() };
    this.coupons.set(id, updated);
    return updated;
  }

  async recordRedemption(redemption: RedemptionRecord): Promise<RedemptionRecord> {
    this.redemptions.push(redemption);
    return redemption;
  }

  async getRedemptionsByCoupon(couponId: string): Promise<RedemptionRecord[]> {
    return this.redemptions.filter((r) => r.couponId === couponId);
  }

  async getRedemptionsByUser(userId: string): Promise<RedemptionRecord[]> {
    return this.redemptions.filter((r) => r.userId === userId);
  }

  async getAllRedemptions(limit = 50): Promise<RedemptionRecord[]> {
    return this.redemptions.slice(-limit);
  }

  async validateCoupon(code: string, userId: string, amount: number): Promise<{ valid: boolean; reason?: string; coupon?: CouponRecord }> {
    const coupon = await this.getCouponByCode(code);
    if (!coupon) return { valid: false, reason: 'Coupon not found' };
    if (!coupon.isActive) return { valid: false, reason: 'Coupon is no longer active' };
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return { valid: false, reason: 'Coupon has expired' };
    if (coupon.currentRedemptions >= coupon.maxRedemptions) return { valid: false, reason: 'Coupon redemption limit reached' };
    if (amount < coupon.minPurchaseAmount) return { valid: false, reason: `Minimum purchase amount of ${coupon.minPurchaseAmount} not met` };
    const userRedemptions = await this.getRedemptionsByUser(userId);
    if (userRedemptions.some((r) => r.couponId === coupon.id)) return { valid: false, reason: 'Coupon already redeemed by this user' };
    return { valid: true, coupon };
  }

  async applyCoupon(code: string, userId: string, amount: number, orderId: string): Promise<{ success: boolean; finalAmount: number; discountApplied: number; reason?: string }> {
    const validation = await this.validateCoupon(code, userId, amount);
    if (!validation.valid) return { success: false, finalAmount: amount, discountApplied: 0, reason: validation.reason };
    const coupon = validation.coupon;
    const discountApplied = coupon.discountType === 'percentage' ? Math.round(amount * coupon.discountValue / 100) : coupon.discountValue;
    const finalAmount = Math.max(0, amount - discountApplied);
    await this.recordRedemption({
      id: `rdm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      couponId: coupon.id,
      code: coupon.code,
      userId,
      amount,
      discountApplied,
      redeemedAt: new Date(),
      orderId,
    });
    await this.updateCoupon(coupon.id, { currentRedemptions: coupon.currentRedemptions + 1 });
    return { success: true, finalAmount, discountApplied };
  }

  /**
   * Generic cursor-based pagination helper for in-memory collections.
   * Returns a stable page using (createdAt, id) as the sort key.
   */
  cursorPaginate<T extends { id: string; createdAt: Date }>(
    items: T[],
    options: { cursor?: string; limit: number },
  ): { page: T[]; nextCursor?: string } {
    const sorted = [...items].sort((a, b) => {
      const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });

    let startIndex = 0;
    if (options.cursor) {
      const idx = sorted.findIndex((item) => item.id === options.cursor);
      if (idx !== -1) startIndex = idx + 1;
    }

    const page = sorted.slice(startIndex, startIndex + options.limit);
    const nextCursor =
      page.length === options.limit ? page[page.length - 1].id : undefined;

    return { page, nextCursor };
  }
}
