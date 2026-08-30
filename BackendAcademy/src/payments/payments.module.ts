import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SecurityModule } from '../security/security.module';
import { MonitoringModule } from '../monitoring/monitoring.module';

@Module({
  imports: [SecurityModule, MonitoringModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
