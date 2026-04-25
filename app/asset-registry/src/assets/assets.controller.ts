import { Controller, Get, Post, Param, Query, Body, Headers, Res, HttpStatus } from '@nestjs/common';
import { AssetsService } from './assets.service';
import { Response } from 'express';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  async findAll(@Headers('if-none-match') ifNoneMatch: string, @Res() res: Response) {
    const etag = await this.assetsService.getETag();
    
    if (ifNoneMatch === etag) {
      return res.status(HttpStatus.NOT_MODIFIED).send();
    }

    const assets = await this.assetsService.findAll();
    res.setHeader('ETag', etag);
    return res.status(HttpStatus.OK).json(assets);
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.assetsService.search(query);
  }

  @Post('admin/verify/:id')
  async verify(@Param('id') id: string, @Body('verified') verified: boolean) {
    return this.assetsService.verify(id, verified);
  }

  @Post('admin/cache/invalidate')
  async invalidate() {
    await this.assetsService.invalidateCache();
    return { message: 'Cache invalidated' };
  }
}
