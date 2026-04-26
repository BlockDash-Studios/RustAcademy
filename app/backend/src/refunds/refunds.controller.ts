import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { RefundsService } from './refunds.service';
import { InitiateRefundDto } from './dto/initiate-refund.dto';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { RefundAttemptRecord } from './refunds.types';

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
  @ApiOperation({ summary: 'Initiate a refund (idempotent)' })
  @ApiResponse({ status: 200, description: 'Refund attempt created or existing attempt returned' })
  @ApiResponse({ status: 409, description: 'Entity is not in a refundable state' })
  async initiate(
    @Body() dto: InitiateRefundDto,
    @Request() req: ExpressRequest,
  ): Promise<RefundAttemptRecord> {
    const actorId = req['apiKey']?.id || 'system';
    const requestId = req['correlationId'];
    return this.refundsService.initiateRefund(dto, actorId, requestId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a pending refund' })
  @ApiResponse({ status: 200, description: 'Refund approved' })
  @ApiResponse({ status: 409, description: 'Refund is not in pending state' })
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: ExpressRequest,
  ): Promise<RefundAttemptRecord> {
    const actorId = req['apiKey']?.id || 'system';
    const requestId = req['correlationId'];
    return this.refundsService.approveRefund(id, actorId, requestId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending refund' })
  @ApiResponse({ status: 200, description: 'Refund rejected' })
  @ApiResponse({ status: 409, description: 'Refund is not in pending state' })
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('notes') notes: string,
    @Request() req: ExpressRequest,
  ): Promise<RefundAttemptRecord> {
    const actorId = req['apiKey']?.id || 'system';
    const requestId = req['correlationId'];
    return this.refundsService.rejectRefund(id, actorId, notes, requestId);
  }

  @Get()
  @ApiOperation({ summary: 'List all refund attempts' })
  @ApiResponse({ status: 200, description: 'List of refund attempts' })
  async list() {
    return this.refundsService.listRefunds();
  }
}
