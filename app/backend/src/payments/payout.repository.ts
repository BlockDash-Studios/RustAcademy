import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import { Payout, PayoutStatus } from "./entities/payout.entity";

/**
 * Data-access layer for payouts, backed by Supabase (the project's standard
 * persistence layer — TypeORM was removed from the codebase).
 */
@Injectable()
export class PayoutRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(data: {
    destinationAddress: string;
    amount: number;
  }): Promise<Payout> {
    const client = this.supabaseService.getClient();
    const { data: payout, error } = await client
      .from("payouts")
      .insert({
        destination_address: data.destinationAddress,
        amount: data.amount,
        status: PayoutStatus.Pending,
      })
      .select()
      .single();

    if (error) throw error;
    return this.toEntity(payout);
  }

  async findOne(id: string): Promise<Payout | null> {
    const client = this.supabaseService.getClient();
    const { data: payout, error } = await client
      .from("payouts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return payout ? this.toEntity(payout) : null;
  }

  async save(payout: Payout): Promise<Payout> {
    const client = this.supabaseService.getClient();
    const { data: saved, error } = await client
      .from("payouts")
      .update({
        destination_address: payout.destinationAddress,
        amount: payout.amount,
        status: payout.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id)
      .select()
      .single();

    if (error) throw error;
    return this.toEntity(saved);
  }

  private toEntity(row: Record<string, unknown>): Payout {
    return {
      id: String(row.id),
      destinationAddress: String(row.destination_address),
      amount: Number(row.amount),
      status: String(row.status ?? PayoutStatus.Pending) as PayoutStatus,
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    };
  }
}
