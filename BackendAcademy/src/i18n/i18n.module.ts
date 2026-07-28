import { Global, Module } from '@nestjs/common';
import { LocalizationService } from './localization.service';

@Global()
@Module({
  providers: [LocalizationService],
  exports: [LocalizationService],
})
export class I18nModule {}
