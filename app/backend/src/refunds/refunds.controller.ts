import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RefundsService } from './refunds.service';
import { InitiateRefundDto } from './dto/initiate-refund.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { NetworkSafetyGuard } from '../feature-flags/network-safety.guard';
import { RequiresFlag } from '../feature-flags/requires-flag.decorator';
import { decodeCursor, clampLimit } from '../common/pagination/cursor.util';

interface ApiKeyRequest extends Request {
  apiKey?: Request['apiKey'];
}

@ApiTags('admin/refunds')
@ApiHeader({
  name: 'X-API-Key',
  description: 'Admin API key with refunds:write scope',
  required: true,
})
@UseGuards(ApiKeyGuard)
@RequireScopes('refunds:write')
@Controller('admin/refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(NetworkSafetyGuard)
  @RequiresFlag('mainnet.refunds')
  @ApiOperation({ summary: 'Initiate a refund (idempotent)' })
  @ApiResponse({ status: 200, description: 'Refund attempt created or existing attempt returned' })
  @ApiResponse({ status: 409, description: 'Entity is not in a refundable state' })
  @ApiResponse({ status: 503, description: 'Blocked by mainnet safety gate' })
  async initiate(
    @Body() dto: InitiateRefundDto,
    @Req() req: ApiKeyRequest,
  ) {
    const actorId = req.apiKey?.id ?? 'api';
    return this.refundsService.initiateRefund(dto, actorId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(NetworkSafetyGuard)
  @RequiresFlag('mainnet.refunds')
  @ApiOperation({ summary: 'Approve a pending refund and submit to on-chain' })
  @ApiResponse({ status: 200, description: 'Refund submitted for processing' })
  @ApiResponse({ status: 409, description: 'Refund is not in pending state' })
  @ApiResponse({ status: 503, description: 'Blocked by mainnet safety gate' })
  async approve(
    @Param('id') id: string,
    @Req() req: ApiKeyRequest,
  ) {
    const actorId = req.apiKey?.id ?? 'api';
    return this.refundsService.approveRefund(id, actorId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(NetworkSafetyGuard)
  @RequiresFlag('mainnet.refunds')
  @ApiOperation({ summary: 'Reject a pending refund' })
  @ApiResponse({ status: 200, description: 'Refund rejected' })
  @ApiResponse({ status: 409, description: 'Refund is not in pending state' })
  @ApiResponse({ status: 503, description: 'Blocked by mainnet safety gate' })
  async reject(
    @Param('id') id: string,
    @Body() body: { notes?: string },
    @Req() req: ApiKeyRequest,
  ) {
    const actorId = req.apiKey?.id ?? 'api';
    return this.refundsService.rejectRefund(id, actorId, body.notes);
  }

  @Get()
  @ApiOperation({ summary: 'List all refund attempts' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Opaque pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (1-100)' })
  @ApiResponse({ status: 200, description: 'List of refund attempts' })
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    let parsedCursor = null;
    if (cursor) {
      parsedCursor = decodeCursor(cursor);
      if (!parsedCursor) {
        throw new BadRequestException('Invalid cursor format provided.');
      }
    }
    const safeLimit = clampLimit(limit);
    return this.refundsService.listRefunds(parsedCursor, safeLimit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get refund details by ID' })
  @ApiResponse({ status: 200, description: 'Refund attempt details including transaction hash and retryability' })
  @ApiResponse({ status: 404, description: 'Refund not found' })
  async getById(@Param('id') id: string) {
    return this.refundsService.getRefundByIdentity(id);
  }
}
