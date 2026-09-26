import { resolveStellarNetwork } from './network.config';

describe('resolveStellarNetwork', () => {
  it('defaults to testnet', () => {
    expect(resolveStellarNetwork().horizonUrl).toBe('https://horizon-testnet.stellar.org');
  });

  it('selects mainnet case-insensitively', () => {
    expect(resolveStellarNetwork('MAINNET').horizonUrl).toBe('https://horizon.stellar.org');
  });

  it('rejects unsupported networks', () => {
    expect(() => resolveStellarNetwork('local')).toThrow(/Unsupported STELLAR_NETWORK/);
  });
});