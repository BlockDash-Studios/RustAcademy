import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

@Injectable()
export class AssetsService {
  private prisma = new PrismaClient();
  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  async findAll() {
    const cached = await this.redis.get('assets:all');
    if (cached) return JSON.parse(cached);

    const assets = await this.prisma.asset.findMany();
    await this.redis.set('assets:all', JSON.stringify(assets), 'EX', 3600);
    return assets;
  }

  async search(query: string) {
    return this.prisma.asset.findMany({
      where: {
        OR: [
          { code: { contains: query } },
          { issuer: { contains: query } },
        ],
      },
    });
  }

  async verify(id: string, verified: boolean) {
    const asset = await this.prisma.asset.update({
      where: { id },
      data: { verified },
    });
    await this.invalidateCache();
    return asset;
  }

  async invalidateCache() {
    await this.redis.del('assets:all');
  }

  async getETag() {
    const lastUpdate = await this.prisma.asset.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    });
    return lastUpdate ? `W/"${lastUpdate.updatedAt.getTime()}"` : `W/"0"`;
  }
}
