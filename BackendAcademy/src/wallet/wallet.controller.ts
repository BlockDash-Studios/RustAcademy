import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { RegisterWalletDto, VerifyTransactionDto } from './dto/verify-transaction.dto';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post('register')
  async registerWallet(@Body() dto: RegisterWalletDto) {
    return this.walletService.registerWallet(dto);
  }

  @Post('verify')
  async verifyTransaction(@Body() dto: VerifyTransactionDto) {
    return this.walletService.verifyTransaction(dto);
  }

  @Get('verification/:transactionId')
  async getVerificationStatus(@Param('transactionId') transactionId: string) {
    return this.walletService.getVerificationStatus(transactionId);
  }

  @Get(':address')
  async getWallet(@Param('address') address: string) {
    return this.walletService.getWallet(address);
  }

  @Get(':address/balance')
  async getWalletBalance(@Param('address') address: string) {
    return this.walletService.getWalletBalance(address);
  }

  @Get(':address/transactions')
  async getTransactionHistory(@Param('address') address: string) {
    return this.walletService.getTransactionHistory(address);
  }

  @Get()
  async getAllWallets() {
    return this.walletService.getAllWallets();
  }
}
