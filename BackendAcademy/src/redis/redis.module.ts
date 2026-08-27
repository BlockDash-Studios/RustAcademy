import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Redis from 'ioredis';
import { RedisService } from './redis.service';

function parsePort(value: string | undefined, defaultValue: number): number {
  const raw = value ?? defaultValue.toString();
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid REDIS_PORT: ${raw}`);
  }
  return port;
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_OPTIONS',
      useFactory: (config: ConfigService) => ({
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: parsePort(config.get<string>('REDIS_PORT'), 6379),
        password: config.get<string>('REDIS_PASSWORD'),
        db: config.get<number>('REDIS_DB', 0),
      }),
      inject: [ConfigService],
    },
    RedisService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (config: ConfigService) =>
        new Redis.default({
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: parsePort(config.get<string>('REDIS_PORT'), 6379),
          password: config.get<string>('REDIS_PASSWORD'),
          db: config.get<number>('REDIS_DB', 0),
          maxRetriesPerRequest: 2,
          lazyConnect: true,
        }),
      inject: [ConfigService],
    },
    {
      provide: 'SessionStore',
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        get: async (sessionId: string) => {
          const raw = await redis.get(`session:${sessionId}`);
          return raw ? JSON.parse(raw) : null;
        },
        set: async (sessionId: string, data: any, ttlSeconds: number) => {
          await redis.set(`session:${sessionId}`, JSON.stringify(data), 'EX', ttlSeconds);
        },
        delete: async (sessionId: string) => {
          await redis.del(`session:${sessionId}`);
        },
      }),
    },
  ],
  exports: ['REDIS_OPTIONS', RedisService, 'REDIS_CLIENT', 'SessionStore'],
})
export class RedisModule {}