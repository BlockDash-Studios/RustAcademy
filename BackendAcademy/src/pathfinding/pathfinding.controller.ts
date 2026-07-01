import { Body, Controller, Post } from '@nestjs/common';
import { PathfindingService } from './pathfinding.service';
import { PathfindingQuoteDto } from './dto/pathfinding-quote.dto';
import { PathQuote } from './interfaces/pathfinding.interface';

@Controller('pathfinding')
export class PathfindingController {
  constructor(private readonly pathfindingService: PathfindingService) {}

  /**
   * POST /pathfinding/quote
   * Returns a deterministic stub quote for a Stellar path payment.
   *
   * MVP: returns a stub quote derived from `sourceAmount` * (1 - 0.5%).
   * Real implementation should call Horizon's `/paths/strict-send` or
   * `/paths/strict-receive` endpoints via `@stellar/stellar-sdk`.
   */
  @Post('quote')
  quotePathPayment(@Body() dto: PathfindingQuoteDto): PathQuote {
    return this.pathfindingService.quotePathPayment(dto);
  }
}
