import { Module } from "@nestjs/common";
import { HorizonService } from "../transactions/horizon.service";
import { PaymentsController } from "./payments.controller";
import { StealthAddressService } from "./stealth-address.service";
import { EncryptedMetadataService } from "../common/utils/encrypted-metadata.service";

@Module({
  imports: [],
  controllers: [PaymentsController],
  providers: [HorizonService, StealthAddressService, EncryptedMetadataService],
  exports: [StealthAddressService, EncryptedMetadataService],
})
export class PaymentsModule {}
