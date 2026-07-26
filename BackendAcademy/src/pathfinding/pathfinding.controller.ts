import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { PathfindingService } from './pathfinding.service';
import { PathfindingQuoteDto } from './dto/pathfinding-quote.dto';
import { PathQuote } from './interfaces/pathfinding.interface';

@Controller('pathfinding')
export class PathfindingController {
  constructor(private readonly pathfindingService: PathfindingService) {}

  @Post('quote')
  @HttpCode(200)
  quotePathPayment(@Body() dto: PathfindingQuoteDto): PathQuote {
    if (!dto.sourceAmount || !dto.sourceAssetCode || !dto.destinationAssetCode) {
      return {
        sourceAmount: dto.sourceAmount || '0',
        destinationAmount: '0.0000000',
        hops: [],
        estimatedSettleSeconds: 0,
        error: 'Missing required fields: sourceAmount, sourceAssetCode, destinationAssetCode',
      };
    }

    const sourceNum = Number(dto.sourceAmount);
    if (!Number.isFinite(sourceNum) || sourceNum <= 0) {
      return {
        sourceAmount: dto.sourceAmount,
        destinationAmount: '0.0000000',
        hops: [],
        estimatedSettleSeconds: 0,
        error: 'Invalid sourceAmount: must be a positive number',
      };
    }

    if (dto.sourceAmount.length > 50) {
      return {
        sourceAmount: dto.sourceAmount,
        destinationAmount: '0.0000000',
        hops: [],
        estimatedSettleSeconds: 0,
        error: 'sourceAmount exceeds maximum length',
      };
    }

    return this.pathfindingService.quotePathPayment(dto);
  }
}