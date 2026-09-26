import { Injectable, OnModuleInit } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';
import { resolveStellarNetwork, StellarNetworkConfig } from './network.config';

@Injectable()
export class StellarService implements OnModuleInit {
  readonly config: StellarNetworkConfig;
  readonly server: StellarSdk.Horizon.Server;

  constructor() {
    this.config = resolveStellarNetwork(process.env.STELLAR_NETWORK);
    this.server = new StellarSdk.Horizon.Server(this.config.horizonUrl);
  }

  onModuleInit(): void {
    if (process.env.REWARD_POOL_SECRET) this.getRewardPoolKeypair();
  }

  getRewardPoolKeypair(): StellarSdk.Keypair {
    const secret = process.env.REWARD_POOL_SECRET;
    if (!secret) throw new Error('REWARD_POOL_SECRET is not configured');
    return StellarSdk.Keypair.fromSecret(secret);
  }

  async submitTransaction(transaction: StellarSdk.Transaction): Promise<unknown> {
    transaction.sign(this.getRewardPoolKeypair());
    return this.server.submitTransaction(transaction);
  }
}