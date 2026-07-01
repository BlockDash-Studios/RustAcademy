import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class VerifyTransactionDto {
  @IsString()
  @MinLength(1)
  transactionId: string;

  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'sourceAccount must be a valid Stellar public key',
  })
  sourceAccount: string;

  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'destinationAccount must be a valid Stellar public key',
  })
  destinationAccount: string;

  @IsString()
  amount: string;

  @IsString()
  assetCode: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class RegisterWalletDto {
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'address must be a valid Stellar public key',
  })
  address: string;

  @IsString()
  assetCode: string;
}
