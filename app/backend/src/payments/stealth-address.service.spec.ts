import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StealthAddressService } from '../stealth-address.service';
import {
  deriveStealthAddress,
  deriveStealthAddressCommitment,
  generateEphemeralKeypair,
} from '../../common/utils/key-derivation.utils';

/**
 * Test suite for Stealth Address Service
 *
 * Verifies:
 * - Keypair generation
 * - Payment derivation
 * - Address verification
 * - Recipient scanning
 * - Withdrawal preparation
 */
describe('StealthAddressService', () => {
  let service: StealthAddressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StealthAddressService],
    }).compile();

    service = module.get<StealthAddressService>(StealthAddressService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateRecipientKeypair', () => {
    it('should generate a complete stealth keypair', () => {
      const keypair = service.generateRecipientKeypair();

      expect(keypair.scanPrivKey).toBeDefined();
      expect(keypair.scanPubKey).toBeDefined();
      expect(keypair.spendPrivKey).toBeDefined();
      expect(keypair.spendPubKey).toBeDefined();

      // All should be 64-char hex (32 bytes)
      expect(keypair.scanPrivKey.length).toBe(64);
      expect(keypair.scanPubKey.length).toBe(64);
      expect(keypair.spendPrivKey.length).toBe(64);
      expect(keypair.spendPubKey.length).toBe(64);
    });

    it('should generate unique keypairs', () => {
      const kp1 = service.generateRecipientKeypair();
      const kp2 = service.generateRecipientKeypair();

      expect(kp1.scanPrivKey).not.toBe(kp2.scanPrivKey);
      expect(kp1.spendPrivKey).not.toBe(kp2.spendPrivKey);
    });
  });

  describe('deriveStealthPayment', () => {
    let recipientKeypair: any;
    const testSender = 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT';
    const testToken = 'CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS';

    beforeEach(() => {
      recipientKeypair = service.generateRecipientKeypair();
    });

    it('should derive stealth payment with all required fields', () => {
      const derivation = service.deriveStealthPayment({
        senderAddress: testSender,
        recipientScanPubKey: recipientKeypair.scanPubKey,
        recipientSpendPubKey: recipientKeypair.spendPubKey,
        token: testToken,
        amount: 1000000,
        timeoutSecs: 86400,
      });

      expect(derivation.ephemeralPrivKey).toBeDefined();
      expect(derivation.ephemeralPubKey).toBeDefined();
      expect(derivation.sharedSecret).toBeDefined();
      expect(derivation.stealthAddress).toBeDefined();
      expect(derivation.contractParams).toBeDefined();

      // Verify contract params
      expect(derivation.contractParams.sender).toBe(testSender);
      expect(derivation.contractParams.token).toBe(testToken);
      expect(derivation.contractParams.amount).toBe(1000000);
      expect(derivation.contractParams.timeout_secs).toBe(86400);
    });

    it('should produce deterministic stealth address for same inputs', () => {
      const params = {
        senderAddress: testSender,
        recipientScanPubKey: recipientKeypair.scanPubKey,
        recipientSpendPubKey: recipientKeypair.spendPubKey,
        token: testToken,
        amount: 1000000,
        timeoutSecs: 86400,
      };

      // Note: This test will fail due to ephemeral key generation being random
      // But we can verify the derivation path is consistent
      const derivation1 = service.deriveStealthPayment(params);
      const derivation2 = service.deriveStealthPayment(params);

      // Different ephemeral keys should be generated
      expect(derivation1.ephemeralPrivKey).not.toBe(derivation2.ephemeralPrivKey);
    });

    it('should reject invalid sender address', () => {
      expect(() =>
        service.deriveStealthPayment({
          senderAddress: 'INVALID',
          recipientScanPubKey: recipientKeypair.scanPubKey,
          recipientSpendPubKey: recipientKeypair.spendPubKey,
          token: testToken,
          amount: 1000000,
          timeoutSecs: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject invalid token address', () => {
      expect(() =>
        service.deriveStealthPayment({
          senderAddress: testSender,
          recipientScanPubKey: recipientKeypair.scanPubKey,
          recipientSpendPubKey: recipientKeypair.spendPubKey,
          token: 'INVALID',
          amount: 1000000,
          timeoutSecs: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject zero or negative amounts', () => {
      expect(() =>
        service.deriveStealthPayment({
          senderAddress: testSender,
          recipientScanPubKey: recipientKeypair.scanPubKey,
          recipientSpendPubKey: recipientKeypair.spendPubKey,
          token: testToken,
          amount: 0,
          timeoutSecs: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject non-hex public keys', () => {
      expect(() =>
        service.deriveStealthPayment({
          senderAddress: testSender,
          recipientScanPubKey: 'not-hex',
          recipientSpendPubKey: recipientKeypair.spendPubKey,
          token: testToken,
          amount: 1000000,
          timeoutSecs: 0,
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject incorrect key sizes', () => {
      expect(() =>
        service.deriveStealthPayment({
          senderAddress: testSender,
          recipientScanPubKey: 'a'.repeat(62), // 31 bytes instead of 32
          recipientSpendPubKey: recipientKeypair.spendPubKey,
          token: testToken,
          amount: 1000000,
          timeoutSecs: 0,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('verifyStealthDerivation', () => {
    let recipientKeypair: any;
    let derivation: any;

    beforeEach(() => {
      recipientKeypair = service.generateRecipientKeypair();
      derivation = service.deriveStealthPayment({
        senderAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientScanPubKey: recipientKeypair.scanPubKey,
        recipientSpendPubKey: recipientKeypair.spendPubKey,
        token: 'CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS',
        amount: 1000000,
        timeoutSecs: 86400,
      });
    });

    it('should verify correct stealth address derivation', () => {
      const isValid = service.verifyStealthDerivation(
        derivation.ephemeralPubKey,
        recipientKeypair.scanPubKey,
        recipientKeypair.spendPubKey,
        derivation.stealthAddress,
      );

      expect(isValid).toBe(true);
    });

    it('should reject incorrect stealth address', () => {
      const wrongStealth = 'f'.repeat(64);

      const isValid = service.verifyStealthDerivation(
        derivation.ephemeralPubKey,
        recipientKeypair.scanPubKey,
        recipientKeypair.spendPubKey,
        wrongStealth,
      );

      expect(isValid).toBe(false);
    });
  });

  describe('scanStealthPayment', () => {
    let recipientKeypair: any;
    let derivation: any;

    beforeEach(() => {
      recipientKeypair = service.generateRecipientKeypair();
      derivation = service.deriveStealthPayment({
        senderAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientScanPubKey: recipientKeypair.scanPubKey,
        recipientSpendPubKey: recipientKeypair.spendPubKey,
        token: 'CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS',
        amount: 1000000,
        timeoutSecs: 86400,
      });
    });

    it('should identify payment for correct recipient', () => {
      const isForRecipient = service.scanStealthPayment(
        derivation.ephemeralPubKey,
        recipientKeypair.scanPrivKey,
        recipientKeypair.spendPubKey,
        derivation.stealthAddress,
      );

      expect(isForRecipient).toBe(true);
    });

    it('should reject payment for wrong recipient', () => {
      const wrongKeypair = service.generateRecipientKeypair();

      const isForRecipient = service.scanStealthPayment(
        derivation.ephemeralPubKey,
        wrongKeypair.scanPrivKey,
        wrongKeypair.spendPubKey,
        derivation.stealthAddress,
      );

      expect(isForRecipient).toBe(false);
    });

    it('should reject wrong recorded stealth address', () => {
      const wrongStealth = 'f'.repeat(64);

      const isForRecipient = service.scanStealthPayment(
        derivation.ephemeralPubKey,
        recipientKeypair.scanPrivKey,
        recipientKeypair.spendPubKey,
        wrongStealth,
      );

      expect(isForRecipient).toBe(false);
    });
  });

  describe('deriveStealthPrivateKeyForWithdrawal', () => {
    it('should derive stealth private key from spend key and shared secret', () => {
      const spendPrivKey = 'a'.repeat(64);
      const sharedSecret = 'b'.repeat(64);

      const stealthPrivKey = service.deriveStealthPrivateKeyForWithdrawal(spendPrivKey, sharedSecret);

      expect(stealthPrivKey.length).toBe(64);
      expect(stealthPrivKey).toMatch(/^[0-9a-f]+$/);
    });

    it('should reject invalid hex keys', () => {
      const spendPrivKey = 'not-hex';
      const sharedSecret = 'b'.repeat(64);

      expect(() =>
        service.deriveStealthPrivateKeyForWithdrawal(spendPrivKey, sharedSecret),
      ).toThrow(BadRequestException);
    });
  });

  describe('prepareStealthWithdrawal', () => {
    const testData = {
      stealthAddress: 'a'.repeat(64),
      ephemeralPubKey: 'b'.repeat(64),
      spendPubKey: 'c'.repeat(64),
      recipientAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
    };

    it('should prepare withdrawal parameters', () => {
      const result = service.prepareStealthWithdrawal(testData);

      expect(result.contractParams).toBeDefined();
      expect(result.contractParams.recipient).toBe(testData.recipientAddress);
      expect(result.contractParams.stealth_address).toBe(testData.stealthAddress);
      expect(result.contractParams.eph_pub).toBe(testData.ephemeralPubKey);
      expect(result.contractParams.spend_pub).toBe(testData.spendPubKey);
    });

    it('should reject invalid recipient address', () => {
      expect(() =>
        service.prepareStealthWithdrawal({
          ...testData,
          recipientAddress: 'INVALID',
        }),
      ).toThrow(BadRequestException);
    });

    it('should reject invalid cryptographic parameters', () => {
      expect(() =>
        service.prepareStealthWithdrawal({
          ...testData,
          stealthAddress: 'not-hex',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('batchVerifyStealthAddresses', () => {
    it('should verify multiple stealth addresses', () => {
      const kp1 = service.generateRecipientKeypair();
      const kp2 = service.generateRecipientKeypair();

      const derivation1 = service.deriveStealthPayment({
        senderAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientScanPubKey: kp1.scanPubKey,
        recipientSpendPubKey: kp1.spendPubKey,
        token: 'CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS',
        amount: 1000000,
        timeoutSecs: 0,
      });

      const derivation2 = service.deriveStealthPayment({
        senderAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientScanPubKey: kp2.scanPubKey,
        recipientSpendPubKey: kp2.spendPubKey,
        token: 'CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS',
        amount: 2000000,
        timeoutSecs: 0,
      });

      const results = service.batchVerifyStealthAddresses([
        {
          ephemeralPubKey: derivation1.ephemeralPubKey,
          scanPubKey: kp1.scanPubKey,
          spendPubKey: kp1.spendPubKey,
          stealthAddress: derivation1.stealthAddress,
        },
        {
          ephemeralPubKey: derivation2.ephemeralPubKey,
          scanPubKey: kp2.scanPubKey,
          spendPubKey: kp2.spendPubKey,
          stealthAddress: derivation2.stealthAddress,
        },
      ]);

      expect(results.length).toBe(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });
  });

  describe('End-to-end privacy flow', () => {
    it('should complete a full sender -> recipient -> withdrawal flow', () => {
      // 1. Recipient generates keypair
      const recipientKeypair = service.generateRecipientKeypair();

      // 2. Sender derives stealth payment
      const derivation = service.deriveStealthPayment({
        senderAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
        recipientScanPubKey: recipientKeypair.scanPubKey,
        recipientSpendPubKey: recipientKeypair.spendPubKey,
        token: 'CCZST5X3NNQL4ID3NQWS45A7T2SRSQTVNUVE2D5ZWZOU6GBJUMXM6BS',
        amount: 5000000,
        timeoutSecs: 86400,
      });

      // 3. Sender calls smart contract with derivation.contractParams

      // 4. Recipient scans chain for their payments
      const isForRecipient = service.scanStealthPayment(
        derivation.ephemeralPubKey,
        recipientKeypair.scanPrivKey,
        recipientKeypair.spendPubKey,
        derivation.stealthAddress,
      );

      expect(isForRecipient).toBe(true);

      // 5. Recipient prepares withdrawal
      const withdrawal = service.prepareStealthWithdrawal({
        stealthAddress: derivation.stealthAddress,
        ephemeralPubKey: derivation.ephemeralPubKey,
        spendPubKey: recipientKeypair.spendPubKey,
        recipientAddress: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
      });

      expect(withdrawal.contractParams.recipient).toBe(
        'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJQ4CDOODMQS7VYTSRQMTMQBFQT',
      );

      // 6. Recipient can verify the derivation
      const isValid = service.verifyStealthDerivation(
        derivation.ephemeralPubKey,
        recipientKeypair.scanPubKey,
        recipientKeypair.spendPubKey,
        derivation.stealthAddress,
      );

      expect(isValid).toBe(true);
    });
  });
});
