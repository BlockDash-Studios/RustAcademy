import { resolveNetworkSnapshot } from './network.config';

describe('network config resolver', () => {
  it('defaults to testnet with safe defaults', () => {
    const snapshot = resolveNetworkSnapshot({});

    expect(snapshot.network).toBe('testnet');
    expect(snapshot.horizonUrl).toContain('horizon-testnet');
    expect(snapshot.sorobanRpcUrl).toContain('soroban-testnet');
    expect(snapshot.explorerUrl).toContain('/testnet');
  });

  it('supports mainnet via NETWORK', () => {
    const snapshot = resolveNetworkSnapshot({ NETWORK: 'mainnet' });
    expect(snapshot.network).toBe('mainnet');
    expect(snapshot.passphrase).toBeTruthy();
  });

  it('fails when NETWORK and STELLAR_NETWORK conflict', () => {
    expect(() =>
      resolveNetworkSnapshot({
        NETWORK: 'testnet',
        STELLAR_NETWORK: 'mainnet',
      }),
    ).toThrow('conflict');
  });

  it('fails on malformed endpoint override', () => {
    expect(() =>
      resolveNetworkSnapshot({
        NETWORK: 'testnet',
        SOROBAN_RPC_URL: 'not-a-url',
      }),
    ).toThrow('Invalid SOROBAN_RPC_URL');
  });

  it('names the variable in the error for an invalid network value', () => {
    expect(() =>
      resolveNetworkSnapshot({ STELLAR_NETWORK: 'invalid' }),
    ).toThrow('STELLAR_NETWORK');
  });

  it('fails on a malformed SOROBAN_RPC_URLS fallback entry', () => {
    expect(() =>
      resolveNetworkSnapshot({
        NETWORK: 'testnet',
        SOROBAN_RPC_URLS: 'https://rpc-a.example.com,not-a-url',
      }),
    ).toThrow('Invalid SOROBAN_RPC_URLS entry');
  });

  it('deduplicates Soroban RPC fallback URLs', () => {
    const snapshot = resolveNetworkSnapshot({
      NETWORK: 'testnet',
      SOROBAN_RPC_URL: 'https://rpc-a.example.com',
      SOROBAN_RPC_URLS: 'https://rpc-b.example.com,https://rpc-b.example.com',
    });

    expect(snapshot.sorobanRpcUrls).toEqual([
      'https://rpc-a.example.com',
      'https://rpc-b.example.com',
    ]);
  });

  it('points to the network default when an override is invalid', () => {
    expect(() =>
      resolveNetworkSnapshot({
        NETWORK: 'testnet',
        HORIZON_URL: 'not-a-url',
      }),
    ).toThrow(/HORIZON_URL.*horizon-testnet/);
  });
});
