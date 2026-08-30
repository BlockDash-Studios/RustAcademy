import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HorizonService } from "../transactions/horizon.service";
import { PaymentsController } from "./payments.controller";
import { AuditModule } from "../audit/audit.module";
import { PaymentsService } from "./payments.service";
import { Payout } from "./entities/payout.entity";
import { PayoutRepository } from "./payout.repository";

@Module({
  imports: [AuditModule, TypeOrmModule.forFeature([Payout, PayoutRepository])],
  controllers: [PaymentsController],
  providers: [HorizonService, PaymentsService],
  exports: [],
})
export class PaymentsModule {}
