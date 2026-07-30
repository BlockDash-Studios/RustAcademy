import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
  } from '@nestjs/common';
  import { Request, Response } from 'express';
import { MonitoringService } from '../monitoring/monitoring.service';
import { ErrorCode, ERROR_CODE_MESSAGES } from '../common/error-codes.constants';
  
  @Catch()
  export class HttpExceptionFilter implements ExceptionFilter {
    constructor(private readonly monitoring: MonitoringService) {}
  
    catch(exception: unknown, host: ArgumentsHost): void {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const request = ctx.getRequest<Request>();
  
      const isHttpException = exception instanceof HttpException;
      const statusCode = isHttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
  
      const rawBody = isHttpException ? exception.getResponse() : null;
  
      const { errorCode, message } = this.normalize(rawBody, exception);
      this.monitoring.recordError(
        request.route?.path ?? request.url,
        errorCode,
      );
  
      response.status(statusCode).json({
        error: errorCode,
        message,
        statusCode,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }
  
    private normalize(
      rawBody: unknown,
      exception: unknown,
    ): { errorCode: string; message: string } {
      if (
        rawBody &&
        typeof rawBody === 'object' &&
        'error' in rawBody &&
        'message' in rawBody
      ) {
        return {
          errorCode: String((rawBody as any).error),
          message: String((rawBody as any).message),
        };
      }
  
      if (typeof rawBody === 'string') {
        return { errorCode: ErrorCode.HTTP_EXCEPTION, message: rawBody };
      }
  
      return {
        errorCode: ErrorCode.INTERNAL_ERROR,
        message:
          exception instanceof Error
            ? ERROR_CODE_MESSAGES[ErrorCode.INTERNAL_ERROR]
            : ERROR_CODE_MESSAGES[ErrorCode.INTERNAL_ERROR],
      };
    }
  }