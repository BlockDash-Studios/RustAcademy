import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";

export type IndexMode = "normal" | "dual-read-current" | "dual-read-previous";

export interface IndexerCheckpoint {
  contractId: string;
  network: string;
  mode: IndexMode;
  lastLedger: number;
  pagingToken: string | null;
}

@Injectable()
export class IndexerCheckpointRepository {
  private readonly logger = new Logger(IndexerCheckpointRepository.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Retrieves the comprehensive coordinate pointer checkpoint for a tracking stream.
   */
  async getCheckpoint(
    contractId: string,
    network: string,
    mode: IndexMode
  ): Promise<IndexerCheckpoint | null> {
    const { data, error } = await this.supabase.getClient()
      .from("indexer_checkpoints")
      .select("last_ledger, paging_token")
      .eq("contract_id", contractId)
      .eq("network", network)
      .eq("mode", mode)
      .maybeSingle();

    if (error) {
      this.logger.error(
        `Failed to read checkpoint for [${network}::${mode}] ${contractId}: ${error.message}`
      );
      throw error;
    }

    if (!data) return null;

    return {
      contractId,
      network,
      mode,
      lastLedger: Number(data.last_ledger),
      pagingToken: data.paging_token || null,
    };
  }

  /**
   * Idempotently saves the exact snapshot block state containing ledger alignment and paging keys.
   */
  async saveCheckpoint(checkpoint: IndexerCheckpoint): Promise<void> {
    const { error } = await this.supabase.getClient()
      .from("indexer_checkpoints")
      .upsert(
        {
          contract_id: checkpoint.contractId,
          network: checkpoint.network,
          mode: checkpoint.mode,
          last_ledger: checkpoint.lastLedger,
          paging_token: checkpoint.pagingToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "contract_id,network,mode" }
      );

    if (error) {
      this.logger.error(
        `Failed to save checkpoint for [${checkpoint.network}::${checkpoint.mode}] ${checkpoint.contractId}: ${error.message}`
      );
      throw error;
    }
  }


  /**
   * Backward-compatible fallback for external services tracking generic progress
   */
  async getLastLedger(contractId: string): Promise<number | null> {
    const checkpoint = await this.getCheckpoint(contractId, "testnet", "normal");
    return checkpoint ? checkpoint.lastLedger : null;
  }
}