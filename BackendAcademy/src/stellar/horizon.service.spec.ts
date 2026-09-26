import { Keypair } from '@stellar/stellar-sdk';
import { HorizonService } from './horizon.service';
import { StellarService } from './stellar.service';

describe('HorizonService', () => {
  it('normalizes paginated operations and clamps the page size', async () => {
    const publicKey = Keypair.random().publicKey();
    const record = {
      id: 'operation-id',
      paging_token: 'next-page-token',
      type: 'payment',
      created_at: '2026-01-01T00:00:00Z',
      source_account: publicKey,
      transaction_hash: 'transaction-hash',
      amount: '1.5000000',
      asset_type: 'native',
      to: 'GDESTINATION',
    };
    const call = jest.fn().mockResolvedValue({ records: [record] });
    const cursor = jest.fn().mockReturnValue({ call });
    const limit = jest.fn().mockReturnValue({ cursor, call });
    const order = jest.fn().mockReturnValue({ limit });
    const forAccount = jest.fn().mockReturnValue({ order });
    const operations = jest.fn().mockReturnValue({ forAccount });
    const service = new HorizonService({ server: { operations } } as unknown as StellarService);

    const result = await service.getHistory(publicKey, 500, 'previous-token');

    expect(limit).toHaveBeenCalledWith(100);
    expect(cursor).toHaveBeenCalledWith('previous-token');
    expect(result.operations[0]).toMatchObject({
      id: 'operation-id',
      type: 'payment',
      amount: '1.5000000',
      assetCode: 'XLM',
      transactionHash: 'transaction-hash',
    });
    expect(result.nextCursor).toBe('next-page-token');
  });
});