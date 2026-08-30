import { BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';

/** A syntactically valid Stellar public key (starts with G, 56 chars). */
const ADDR_A = 'G' + 'A'.repeat(55);
const ADDR_B = 'G' + 'B'.repeat(55);

describe('WalletService decimal-safe arithmetic (#657)', () => {
  let service: WalletService;

  beforeEach(async () => {
    service = new WalletService();
    await service.registerWallet({ address: ADDR_A, assetCode: 'XLM' });
    await service.registerWallet({ address: ADDR_B, assetCode: 'XLM' });
    // Fund the source wallet so transfers have a balance to draw from.
    const source = await service.getWallet(ADDR_A);
    source.balance = '2000.00000';
  });

  it('adds amounts without floating-point drift (0.1 + 0.2 = 0.30000)', async () => {
    await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '0.1',
      assetCode: 'XLM',
    });
    await service.verifyTransaction({
      transactionId: 'tx-2',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '0.2',
      assetCode: 'XLM',
    });

    const dest = await service.getWallet(ADDR_B);
    expect(dest.balance).toBe('0.30000');
  });

  it('deducts the amount plus the network fee from the source balance', async () => {
    await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '1.00',
      assetCode: 'XLM',
    });

    // 1.00000 transferred + 0.00001 fee, both taken from the source.
    const source = await service.getWallet(ADDR_A);
    expect(source.balance).toBe('1998.99999');
  });

  it('rejects a transfer when balance cannot cover amount plus fee', async () => {
    // An unfunded wallet (registered with balance 0.00) cannot cover even a
    // minimum transfer of 0.00001 plus the 0.00001 fee.
    const poorWallet = 'G' + 'D'.repeat(55);
    await service.registerWallet({ address: poorWallet, assetCode: 'XLM' });

    const result = await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: poorWallet,
      destinationAccount: ADDR_B,
      amount: '0.00001',
      assetCode: 'XLM',
    });
    expect(result.verified).toBe(false);
    expect(result.status).toBe('rejected');
    // The message surfaces the required total (amount + fee) in exact decimals.
    expect(result.message).toContain('Required: 0.00002');
    expect(result.message).toContain('available: 0.00000');
  });

  it('rounds inputs with more than 5 decimal places half-up', async () => {
    const result = await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '0.123456',
      assetCode: 'XLM',
    });

    const dest = await service.getWallet(ADDR_B);
    // 0.123456 rounds half-up to 0.12346 at the 5th decimal.
    expect(dest.balance).toBe('0.12346');
    expect(result.details?.destinationBalance).toBe('0.12346');
  });

  it('flags transfers above 1000 as pending without moving funds', async () => {
    const result = await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '1000.00001',
      assetCode: 'XLM',
    });

    expect(result.status).toBe('pending');
    expect(result.verified).toBe(true);
    const dest = await service.getWallet(ADDR_B);
    expect(dest.balance).toBe('0.00');
  });

  it('rejects a transfer when the source account is not registered', async () => {
    const stranger = 'G' + 'C'.repeat(55);
    const result = await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: stranger,
      destinationAccount: ADDR_B,
      amount: '1',
      assetCode: 'XLM',
    });
    expect(result.verified).toBe(false);
    expect(result.status).toBe('rejected');
  });

  it('rejects non-numeric, zero, and negative amounts', async () => {
    for (const bad of ['abc', '0', '-1', '1.2.3', '']) {
      await expect(
        service.verifyTransaction({
          transactionId: 'tx-bad',
          sourceAccount: ADDR_A,
          destinationAccount: ADDR_B,
          amount: bad,
          assetCode: 'XLM',
        }),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('rejects transfers between the same account', async () => {
    await expect(
      service.verifyTransaction({
        transactionId: 'tx-1',
        sourceAccount: ADDR_A,
        destinationAccount: ADDR_A,
        amount: '1',
        assetCode: 'XLM',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports reconciliation differences using exact minor-unit math', async () => {
    await service.verifyTransaction({
      transactionId: 'tx-1',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '0.1',
      assetCode: 'XLM',
    });
    await service.verifyTransaction({
      transactionId: 'tx-2',
      sourceAccount: ADDR_A,
      destinationAccount: ADDR_B,
      amount: '0.2',
      assetCode: 'XLM',
    });
    // Destination balance is exactly 0.30000 after the two transfers.
    const dest = await service.getWallet(ADDR_B);
    expect(dest.balance).toBe('0.30000');

    // Simulate an external balance that differs by exactly one minor unit.
    (service as any).fetchExternalBalance = jest.fn(async (address: string) =>
      address === ADDR_B ? '0.29999' : '2000.00000',
    );

    const report = await service.reconcileAllWallets();
    const drift = report.results.find((r) => r.walletAddress === ADDR_B);
    expect(drift?.status).toBe('drift_detected');
    // Difference is expected minus actual, computed in exact minor units.
    expect(drift?.difference).toBe('-0.00001');
  });
});
