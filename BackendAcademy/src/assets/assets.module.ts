import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { SecurityModule } from '../security/security.module';

/**
 * Module exposing asset upload, metadata, download, and delete endpoints
 * to the rest of the BackendAcademy application.
 */
@Module({
  imports: [SecurityModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {
  constructor() {
    AssetsModule.validateAssetEnvironment();
  }

  /**
   * Validates and coerces asset-related environment variables at startup.
   * Throws an Error if any defined value is malformed or out of range.
   */
  private static validateAssetEnvironment(): void {
    const validations: Array<{ name: string; type: 'number' | 'boolean'; min?: number; max?: number }> = [
      { name: 'ASSET_MAX_SIZE', type: 'number', min: 1 },
      { name: 'ASSET_MAX_COUNT', type: 'number', min: 1 },
      { name: 'ASSET_TTL', type: 'number', min: 0 },
      { name: 'ASSET_PUBLIC_ENDPOINT', type: 'boolean' },
    ];

    for (const config of validations) {
      const raw = process.env[config.name];
      if (raw === undefined) continue; // Optional variable; skip if not set.

      if (config.type === 'number') {
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          throw new Error(`Environment variable ${config.name} must be a valid number (received "${raw}")`);
        }
        if (config.min !== undefined && num < config.min) {
          throw new Error(`Environment variable ${config.name} must be >= ${config.min} (received ${num})`);
        }
        if (config.max !== undefined && num > config.max) {
          throw new Error(`Environment variable ${config.name} must be <= ${config.max} (received ${num})`);
        }
      } else if (config.type === 'boolean') {
        const normalized = raw.trim().toLowerCase();
        if (!['true', 'false', '1', '0'].includes(normalized)) {
          throw new Error(`Environment variable ${config.name} must be a boolean (received "${raw}")`);
        }
      }
    }
  }
}