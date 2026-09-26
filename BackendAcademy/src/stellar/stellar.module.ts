import { Module } from '@nestjs/common';
import { HorizonService } from './horizon.service';
import { StellarController } from './stellar.controller';
import { StellarService } from './stellar.service';

@Module({
  controllers: [StellarController],
  providers: [StellarService, HorizonService],
  exports: [StellarService, HorizonService],
})
export class StellarModule {}