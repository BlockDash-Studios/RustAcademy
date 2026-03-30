import { Controller, Get, Post, Body, Query, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

import { HorizonService } from "../transactions/horizon.service";
import { StealthAddressService } from "./stealth-address.service";
import { EncryptedMetadataService } from "../common/utils/encrypted-metadata.service";
import {
  DeriveStealthPaymentDto,
  StealthPaymentDerivationResponseDto,
  VerifyStealthAddressDto,
  VerifyStealthAddressResponseDto,
  RecipientStealthPublicKeysDto,
  EncryptRecipientMetadataDto,
  EncryptedMetadataDto,
  ScanStealthPaymentDto,
  ScanStealthPaymentResponseDto,
  PrepareStealthWithdrawalDto,
  PrepareStealthWithdrawalResponseDto,
} from "../dto/stealth-payment.dto";

type RecentPaymentsQuery = {
  address: string;
  since?: string; // ISO timestamp or epoch ms
  limit?: number;
};

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly horizonService: HorizonService,
    private readonly stealthService: StealthAddressService,
    private readonly encryptedMetadataService: EncryptedMetadataService,
  ) {}

  @Get("recent")
  @ApiOperation({
    summary: "Fetch recent payments for an address (since timestamp)",
  })
  @ApiResponse({ status: 200, description: "List of recent payments" })
  async recent(@Query() query: RecentPaymentsQuery) {
    const { address, since, limit = 20 } = query;

    if (!address) {
      return { items: [] };
    }

    // HorizonService.getPayments returns items sorted desc by created_at
    const resp = await this.horizonService.getPayments(
      address,
      undefined,
      Number(limit),
    );

    const sinceTs = since ? parseSince(since) : undefined;

    const filtered = sinceTs
      ? resp.items.filter((it) => new Date(it.timestamp).getTime() > sinceTs)
      : resp.items;

    return { items: filtered };
  }

  // ============================================================================
  // Privacy/Stealth Payment Endpoints
  // ============================================================================

  @Post("stealth/derive")
  @ApiOperation({
    summary: "Derive a stealth payment (sender-side)",
    description:
      "Generates an ephemeral keypair and derives a one-time stealth address for privacy-enhanced payment. " +
      "Returns contract parameters for calling register_ephemeral_key.",
  })
  @ApiResponse({
    status: 200,
    description: "Stealth payment derivation result",
    type: StealthPaymentDerivationResponseDto,
  })
  deriveStealthPayment(
    @Body() dto: DeriveStealthPaymentDto,
  ): StealthPaymentDerivationResponseDto {
    const derivation = this.stealthService.deriveStealthPayment({
      senderAddress: dto.senderAddress,
      recipientScanPubKey: dto.recipientScanPubKey,
      recipientSpendPubKey: dto.recipientSpendPubKey,
      token: dto.token,
      amount: dto.amount,
      timeoutSecs: dto.timeoutSecs || 0,
    });

    return {
      ephemeralPubKey: derivation.ephemeralPubKey,
      stealthAddress: derivation.stealthAddress,
      sharedSecret: derivation.sharedSecret,
      contractParams: derivation.contractParams,
      // DO NOT return ephemeralPrivKey in production (only for testing)
      // ephemeralPrivKey: derivation.ephemeralPrivKey,
    };
  }

  @Post("stealth/verify")
  @ApiOperation({
    summary: "Verify stealth address derivation",
    description: "Validates that a stealth address was correctly derived (for auditing).",
  })
  @ApiResponse({
    status: 200,
    description: "Verification result",
    type: VerifyStealthAddressResponseDto,
  })
  verifyStealthAddress(
    @Body() dto: VerifyStealthAddressDto,
  ): VerifyStealthAddressResponseDto {
    const isValid = this.stealthService.verifyStealthDerivation(
      dto.ephemeralPubKey,
      dto.scanPubKey,
      dto.spendPubKey,
      dto.stealthAddress,
    );

    return {
      isValid,
      details: isValid ? "Stealth address derivation is valid" : "Derivation mismatch",
    };
  }

  @Post("stealth/scan")
  @ApiOperation({
    summary: "Scan for stealth payments (recipient-side)",
    description:
      "Recipient checks if a stealth payment on-chain is directed to them using their scan_priv_key. " +
      "This is an off-chain operation.",
  })
  @ApiResponse({
    status: 200,
    description: "Scan result",
    type: ScanStealthPaymentResponseDto,
  })
  scanStealthPayment(
    @Body() dto: ScanStealthPaymentDto,
  ): ScanStealthPaymentResponseDto {
    const isForRecipient = this.stealthService.scanStealthPayment(
      dto.ephemeralPubKey,
      dto.scanPrivKey,
      dto.spendPubKey,
      dto.recordedStealthAddress,
    );

    return {
      isForRecipient,
      details: isForRecipient
        ? {
          stealthAddress: dto.recordedStealthAddress,
          isPending: true,
        }
        : undefined,
    };
  }

  @Post("stealth/prepare-withdrawal")
  @ApiOperation({
    summary: "Prepare stealth withdrawal parameters",
    description: "Prepares contract call parameters for stealth_withdraw.",
  })
  @ApiResponse({
    status: 200,
    description: "Prepared withdrawal parameters",
    type: PrepareStealthWithdrawalResponseDto,
  })
  prepareStealthWithdrawal(
    @Body() dto: PrepareStealthWithdrawalDto,
  ): PrepareStealthWithdrawalResponseDto {
    const contractParams = this.stealthService.prepareStealthWithdrawal({
      stealthAddress: dto.stealthAddress,
      ephemeralPubKey: dto.ephemeralPubKey,
      spendPubKey: dto.spendPubKey,
      recipientAddress: dto.recipientAddress,
    });

    return { contractParams };
  }

  @Post("stealth/encrypt-metadata")
  @ApiOperation({
    summary: "Encrypt recipient metadata",
    description:
      "Encrypts sensitive recipient information using a derived encryption key. " +
      "Uses ChaCha20-Poly1305 authenticated encryption.",
  })
  @ApiResponse({
    status: 200,
    description: "Encrypted metadata",
    type: EncryptedMetadataDto,
  })
  encryptRecipientMetadata(
    @Body() dto: EncryptRecipientMetadataDto,
  ): EncryptedMetadataDto {
    try {
      const encryptionKey = Buffer.from(dto.encryptionKey, "hex");
      const aad = dto.aad ? Buffer.from(dto.aad, "hex") : undefined;

      const encrypted = this.encryptedMetadataService.encryptRecipientMetadata(
        {
          recipientAddress: dto.recipientAddress,
          recipientName: dto.recipientName,
          recipientLedgerAccount: dto.recipientLedgerAccount,
          metadata: dto.metadata,
        },
        encryptionKey,
        aad,
      );

      return encrypted;
    } catch (error) {
      throw new BadRequestException(
        `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  @Post("stealth/decrypt-metadata")
  @ApiOperation({
    summary: "Decrypt recipient metadata",
    description: "Decrypts recipient information using the correct decryption key.",
  })
  @ApiResponse({
    status: 200,
    description: "Decrypted recipient metadata",
  })
  decryptRecipientMetadata(
    @Body() dto: any,
  ) {
    try {
      const encryptionKey = Buffer.from(dto.encryptionKey, "hex");
      const aad = dto.aad ? Buffer.from(dto.aad, "hex") : undefined;

      const decrypted = this.encryptedMetadataService.decryptRecipientMetadata(
        {
          ciphertext: dto.ciphertext,
          nonce: dto.nonce,
          tag: dto.tag,
          salt: dto.salt,
        },
        encryptionKey,
        aad,
      );

      return decrypted;
    } catch (error) {
      throw new BadRequestException(
        `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  @Post("stealth/keypair")
  @ApiOperation({
    summary: "Generate stealth keypair for recipient",
    description:
      "Generates (scan_priv_key, spend_priv_key) and public key pairs. " +
      "Recipients should securely store private keys and publish only public keys.",
  })
  @ApiResponse({
    status: 200,
    description: "Generated stealth keypair",
  })
  generateStealthKeypair() {
    return this.stealthService.generateRecipientKeypair();
  }
}

function parseSince(raw?: string): number | undefined {
  if (!raw) return undefined;
  // accept epoch ms or ISO
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) return n;
  const d = Date.parse(raw);
  return Number.isNaN(d) ? undefined : d;
}
