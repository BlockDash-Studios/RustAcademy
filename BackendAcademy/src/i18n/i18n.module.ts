import { Global, Module } from '@nestjs/common';
import { LocalizationService } from './localization.service';
import { ApiInfoController } from '../api-info.controller';

@Global()
@Module({
  controllers: [ApiInfoController],
  providers: [LocalizationService],
  exports: [LocalizationService],
})
export class I18nModule {}
