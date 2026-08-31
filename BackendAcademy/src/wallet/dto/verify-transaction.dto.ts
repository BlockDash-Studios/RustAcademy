import { IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * Stellar public key (ed25519) is a base32 "G"-prefixed 56-char string.
 */
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/**
 * Asset code per SEP-0011: 1-12 characters, uppercase A-Z, digits, and the
 * allowed special characters. We keep it strict (alphanumeric only) for the
 * backend allow-list.
 */
const ASSET_CODE = /^[A-Z0-9]{1,12}$/;

export class VerifyTransactionDto {
  @IsString()
  @MinLength(1)
  transactionId: string;

  @IsString()
  @Matches(STELLAR_ADDRESS, {
    message: 'sourceAccount must be a valid Stellar public key',
  })
  sourceAccount: string;

  @IsString()
  @Matches(STELLAR_ADDRESS, {
    message: 'destinationAccount must be a valid Stellar public key',
  })
  destinationAccount: string;

  @IsString()
  @MinLength(1)
  amount: string;

  @IsString()
  @Matches(ASSET_CODE, {
    message: 'assetCode must be a valid Stellar asset code (1-12 alphanumeric)',
  })
  assetCode: string;

  /**
   * Issuer G-address for a non-native asset. Omit (or set to `native`) when
   * transferring native XLM. When provided it must be a valid Stellar
   * public key and must be in the configured allow-list.
   */
  @IsOptional()
  @Matches(STELLAR_ADDRESS, {
    message: 'assetIssuer must be a valid Stellar public key',
  })
  assetIssuer?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class RegisterWalletDto {
  @IsString()
  @Matches(STELLAR_ADDRESS, {
    message: 'address must be a valid Stellar public key',
  })
  address: string;

  @IsString()
  @Matches(ASSET_CODE, {
    message: 'assetCode must be a valid Stellar asset code (1-12 alphanumeric)',
  })
  assetCode: string;

  /**
   * Issuer G-address for a non-native asset. Defaults to `native` for XLM.
   */
  @IsOptional()
  @Matches(STELLAR_ADDRESS, {
    message: 'assetIssuer must be a valid Stellar public key',
  })
  assetIssuer?: string;
}