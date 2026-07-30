import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CorrelationLoggerService } from '../logging/logger.service';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
    const userId = (req as any).user?.id;

    req.headers['x-correlation-id'] = correlationId;
    _res.setHeader('x-correlation-id', correlationId);

    CorrelationLoggerService.run(
      { correlationId, userId, requestId: correlationId },
      () => next(),
    );
  }
}