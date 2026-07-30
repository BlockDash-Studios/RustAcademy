import { Controller, Get } from '@nestjs/common';
import { LocalizationService } from './i18n/localization.service';

@Controller('api')
export class ApiInfoController {
  constructor(private readonly l10n: LocalizationService) {}

  @Get()
  getApiInfo() {
    return {
      name: this.l10n.t('api.name'),
      version: process.env.npm_package_version || '1.0.0',
      status: this.l10n.t('api.status'),
      locale: this.l10n.getLocale(),
      availableLocales: this.l10n.getAvailableLocales(),
      docs: '/api/docs',
      features: {
        ai: {
          recommendations: true,
          explainability: true,
          modelVersion: 'rustacademy-recommender-v2',
        },
        payments: {
          coupons: true,
          redemptionHistory: true,
        },
      },
    };
  }
}
