import { Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";

export type ReplayClaim =
  | { kind: "claimed" }
  | { kind: "cached"; response: unknown }
  | { kind: "conflict" }
  | { kind: "in_flight" };

@Injectable()
export class InvocationReplayService {
  constructor(private readonly supabase: SupabaseService) {}

  async claim(
    scope: string,
    key: string,
    fingerprint: string,
  ): Promise<ReplayClaim> {
    const { data, error } = await this.supabase.getClient().rpc("claim_transaction_invocation", {
      p_scope: scope,
      p_key: key,
      p_fingerprint: fingerprint,
    });
    if (error) throw error;
    return data as ReplayClaim;
  }

  async complete(scope: string, key: string, response: unknown): Promise<void> {
    const { error } = await this.supabase.getClient().rpc("complete_transaction_invocation", {
      p_scope: scope,
      p_key: key,
      p_response: response,
    });
    if (error) throw error;
  }

  async release(scope: string, key: string): Promise<void> {
    const { error } = await this.supabase.getClient().rpc("release_transaction_invocation", {
      p_scope: scope,
      p_key: key,
    });
    if (error) throw error;
  }
}