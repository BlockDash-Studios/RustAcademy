import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_OPTIONS',
      useFactory: (config: ConfigService) => ({
        host: config.get<string>('REDIS_HOST', 'localhost'),
        port: config.get<number>('REDIS_PORT', 6379),
        password: config.get<string>('REDIS_PASSWORD'),
      }),
      inject: [ConfigService],
    },
    RedisService,
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
  exports: ['REDIS_OPTIONS', RedisService, 'SessionStore'],
})
export class RedisModule {}
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
      }),
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: ['REDIS_OPTIONS', RedisService],
})
export class RedisModule {}
