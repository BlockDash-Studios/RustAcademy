import { INestApplication, VersioningType } from '@nestjs/common';

/**
 * Single API Versioning and Global Prefix Configuration Policy (BA-006 / Issue #574).
 *
 * Governs the standard route hierarchy across the entire backend:
 * - Public endpoints are published under `/api/v1/<controller-route>`.
 * - Infrastructure and system probe endpoints are excluded from the global prefix.
 */

export const API_GLOBAL_PREFIX = 'api';
export const DEFAULT_API_VERSION = '1';
export const API_VERSION_PREFIX = 'v';

/**
 * Full prefix representing the primary public API surface (e.g. `api/v1`).
 */
export const FULL_API_V1_PREFIX = `${API_GLOBAL_PREFIX}/${API_VERSION_PREFIX}${DEFAULT_API_VERSION}`;

/**
 * Routes explicitly excluded from the `/api` global prefix.
 * Includes root hello probe, health check probes, and Prometheus metrics.
 */
export const EXCLUDED_GLOBAL_PREFIX_ROUTES = [
  '/',
  'health',
  'health/(.*)',
  'metrics',
];

/**
 * Applies the standardized global prefix and URI versioning policy to a NestJS application.
 */
export function configureApiPolicy(app: INestApplication): void {
  app.setGlobalPrefix(API_GLOBAL_PREFIX, {
    exclude: EXCLUDED_GLOBAL_PREFIX_ROUTES,
  });

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
    prefix: API_VERSION_PREFIX,
  });
}
