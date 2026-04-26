import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  /**
   * POST /api-keys
   * Creates a new API key. The raw key is returned ONCE in the response.
   */
  @Post()
  create(@Body() dto: CreateApiKeyDto, @Request() req: ExpressRequest) {
    const actor = req['apiKey']?.id || 'system';
    const requestId = req['correlationId'];
    return this.service.create(dto, actor, requestId);
  }

  /**
   * GET /api-keys
   * Lists all active keys (masked). Optionally filter by owner_id.
   */
  @Get()
  list(@Query('owner_id') ownerId?: string) {
    return this.service.list(ownerId);
  }

  /**
   * GET /api-keys/usage
   * Returns aggregated usage/quota stats.
   */
  @Get('usage')
  usage(@Query('owner_id') ownerId?: string) {
    return this.service.getUsage(ownerId);
  }

  /**
   * DELETE /api-keys/:id
   * Revokes (soft-deletes) a key.
   */
  @Delete(':id')
  revoke(@Param('id', ParseUUIDPipe) id: string, @Request() req: ExpressRequest) {
    const actor = req['apiKey']?.id || 'system';
    const requestId = req['correlationId'];
    return this.service.revoke(id, actor, requestId);
  }

  /**
   * POST /api-keys/:id/rotate
   * Invalidates the current key and issues a new one.
   */
  @Post(':id/rotate')
  rotate(@Param('id', ParseUUIDPipe) id: string, @Request() req: ExpressRequest) {
    const actor = req['apiKey']?.id || 'system';
    const requestId = req['correlationId'];
    return this.service.rotate(id, actor, requestId);
  }
}
