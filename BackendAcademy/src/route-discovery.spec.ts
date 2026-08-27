import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  configureApiPolicy,
  API_GLOBAL_PREFIX,
  DEFAULT_API_VERSION,
  API_VERSION_PREFIX,
  FULL_API_V1_PREFIX,
  EXCLUDED_GLOBAL_PREFIX_ROUTES,
} from './config/api.config';

interface DiscoveredRoute {
  path: string;
  method: string;
}

describe('Route Discovery & Single API Versioning Policy (Issue #574 / BA-006)', () => {
  let app: any;
  let discoveredRoutes: DiscoveredRoute[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
    configureApiPolicy(app);
    await app.init();

    // Extract all registered route endpoints from express router
    const server = app.getHttpServer();
    const router = server._events.request._router;

    discoveredRoutes = [];
    if (router && router.stack) {
      for (const layer of router.stack) {
        if (layer.route && layer.route.path) {
          const methods = Object.keys(layer.route.methods || {});
          for (const method of methods) {
            discoveredRoutes.push({
              path: layer.route.path,
              method: method.toUpperCase(),
            });
          }
        }
      }
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('API Configuration Policy Constants', () => {
    it('defines single source of truth for global prefix and versioning', () => {
      expect(API_GLOBAL_PREFIX).toBe('api');
      expect(DEFAULT_API_VERSION).toBe('1');
      expect(API_VERSION_PREFIX).toBe('v');
      expect(FULL_API_V1_PREFIX).toBe('api/v1');
      expect(EXCLUDED_GLOBAL_PREFIX_ROUTES).toContain('/');
      expect(EXCLUDED_GLOBAL_PREFIX_ROUTES).toContain('health');
      expect(EXCLUDED_GLOBAL_PREFIX_ROUTES).toContain('health/(.*)');
      expect(EXCLUDED_GLOBAL_PREFIX_ROUTES).toContain('metrics');
    });
  });

  describe('Route Namespace Assertions', () => {
    it('ensures all public application routes start with /api/v1/', () => {
      const publicRoutes = discoveredRoutes.filter((r) => {
        const path = r.path;
        return (
          path !== '/' &&
          !path.startsWith('/health') &&
          !path.startsWith('/metrics')
        );
      });

      expect(publicRoutes.length).toBeGreaterThan(0);

      for (const route of publicRoutes) {
        expect(route.path).toMatch(/^\/api\/v1\//);
      }
    });

    it('ensures no route suffers from double-prefixing (/api/v1/api/)', () => {
      for (const route of discoveredRoutes) {
        expect(route.path).not.toMatch(/\/api\/v1\/api\//);
        expect(route.path).not.toMatch(/\/api\/api\//);
      }
    });

    it('ensures infrastructure endpoints remain unversioned at root level', () => {
      const infraPaths = discoveredRoutes
        .map((r) => r.path)
        .filter((p) => p === '/' || p.startsWith('/health') || p.startsWith('/metrics'));

      expect(infraPaths.length).toBeGreaterThan(0);
      for (const path of infraPaths) {
        expect(path).not.toContain('/api/');
      }
    });
  });

  describe('Published Route Paths Verification', () => {
    const expectedPaths = [
      '/api/v1/info',
      '/api/v1/jobs/schedules',
      '/api/v1/migrations/history',
      '/api/v1/auth/session/login',
      '/api/v1/users',
      '/api/v1/courses',
      '/api/v1/lessons',
      '/api/v1/challenges',
      '/api/v1/submissions',
      '/api/v1/rewards',
      '/api/v1/chat',
      '/api/v1/ai/chat',
      '/api/v1/social/posts',
      '/api/v1/notifications',
      '/api/v1/payments/history',
      '/api/v1/assets',
      '/api/v1/audit',
      '/api/v1/reports',
      '/api/v1/contracts',
      '/health',
      '/metrics',
    ];

    it.each(expectedPaths)('should have published route: %s', (expectedPath) => {
      const exists = discoveredRoutes.some(
        (r) => r.path === expectedPath || r.path.startsWith(`${expectedPath}/`) || r.path.startsWith(expectedPath),
      );
      expect(exists).toBe(true);
    });
  });
});
