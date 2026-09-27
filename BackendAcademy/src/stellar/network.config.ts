import { Networks } from '@stellar/stellar-sdk';

export type StellarNetwork = 'testnet' | 'mainnet';

export interface StellarNetworkConfig {
  network: StellarNetwork;
  horizonUrl: string;
  passphrase: string;
}

const NETWORKS: Record<StellarNetwork, StellarNetworkConfig> = {
  testnet: {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: Networks.TESTNET,
  },
  mainnet: {
    network: 'mainnet',
    horizonUrl: 'https://horizon.stellar.org',
    passphrase: Networks.PUBLIC,
  },
};

export function resolveStellarNetwork(value?: string): StellarNetworkConfig {
  const network = (value ?? 'testnet').trim().toLowerCase();
  if (network !== 'testnet' && network !== 'mainnet') {
    throw new Error(`Unsupported STELLAR_NETWORK: ${network}`);
  }

  return NETWORKS[network];
}