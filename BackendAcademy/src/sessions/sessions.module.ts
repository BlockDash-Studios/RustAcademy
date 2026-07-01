import { Module } from '@nestjs/common';
import { OfficeHoursController } from './office-hours.controller';
import { OfficeHoursService } from './office-hours.service';

@Module({
  controllers: [OfficeHoursController],
  providers: [OfficeHoursService],
  exports: [OfficeHoursService],
})
export class SessionsModule {}
