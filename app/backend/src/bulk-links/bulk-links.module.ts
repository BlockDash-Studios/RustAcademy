import { Module } from '@nestjs/common';
import { BulkLinksController } from './bulk-links.controller';
import { BulkLinksService } from './bulk-links.service';

@Module({
  controllers: [BulkLinksController],
  providers: [BulkLinksService],
})
export class BulkLinksModule {}