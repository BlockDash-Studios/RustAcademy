import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AppConfigService } from "../../config";
import { MetricsService } from "../../metrics/metrics.service";
import { SorobanDomainException } from "../exceptions/soroban-domain.exception";
import { sanitizeErrorMessage } from "../utils/redaction.util";
import {
  type ErrorEnvelope,
  type ValidationErrorField,
  ErrorCode,
} from "../errors";

/** Re-export for downstream consumers that import from this module */
export { type ErrorEnvelope, type ValidationErrorField, ErrorCode } from "../errors";

type ValidationExceptionPayload = {
  code: ErrorCode.VALIDATION_ERROR;
  message?: string;
  fields: ValidationErrorField[];
};

type BusinessExceptionPayload = {
  message?: string | string[];
  code?: string;
  field?: string;
};

type HttpExceptionResponse =
  | string
  | ValidationExceptionPayload
  | BusinessExceptionPayload;

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly metricsService?: MetricsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const isProduction = this.config.isProduction;

    // Extract correlation ID for traceability
    const correlationId = request.correlationId;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message: string | string[] = "An unexpected error occurred";
    let details: unknown = undefined;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = ErrorCode.RATE_LIMIT_EXCEEDED;
      const retryAfterSeconds = this.getRetryAfterSeconds(response);

      message =
        retryAfterSeconds > 0
          ? `Too many requests. Retry after ${retryAfterSeconds} seconds.`
          : "Too many requests. Please try again later.";

      details = {
        retryAfterSeconds,
      };

      const rateLimitContext = request.rateLimitContext ?? {};

      const route = this.resolveRoute(request);

      this.metricsService?.recordRateLimitedRequest(
        request.method,
        route,
        rateLimitContext.group ?? "public",
        rateLimitContext.keyType ?? "ip",
      );
    } else if (exception instanceof SorobanDomainException) {
      // Typed domain exception: code and message are already safe; technicalError is logged only.
      status = exception.getStatus();
      const body = exception.getResponse() as { code: string; message: string; details?: unknown };
      this.logger.warn(
        `[SorobanDomainException] ${body.code}: ${exception.technicalError}`,
      );
      response.status(status).json({
        success: false,
        error: {
          code: body.code,
          message: body.message,
          ...(correlationId ? { request_id: correlationId, correlationId } : {}),
          ...(body.details && !isProduction ? { details: body.details } : {}),
        },
      });
      return;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as HttpExceptionResponse;

      if (typeof res === "string") {
        message = res;
      } else if (typeof res === "object" && res !== null) {
        // ✅ VALIDATION ERRORS
        if ("fields" in res) {
          const validation = res as ValidationExceptionPayload;

          response.status(status).json({
            success: false,
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: validation.message ?? "Validation failed",
              fields: validation.fields ?? [],
              ...(correlationId ? { request_id: correlationId, correlationId } : {}),
            },
          } satisfies ErrorEnvelope);
          return;
        }

        // ✅ BUSINESS ERRORS
        const business = res as BusinessExceptionPayload;

        code = business.code ?? exception.name;
        message = business.message ?? exception.message;

        if (business.field) {
          details = { field: business.field };
        }
      }
    } else if (exception instanceof Error) {
      // Log full error server-side; sanitize before sending to client.
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
      message = isProduction
        ? "Internal server error"
        : sanitizeErrorMessage(exception.message);
    }

    const body: ErrorEnvelope = {
      success: false,
      error: {
        code,
        message,
        ...(correlationId ? { request_id: correlationId, correlationId } : {}),
        ...(details && !isProduction ? { details } : {}),
      },
    };

    response.status(status).json(body);
  }

  private getRetryAfterSeconds(response: Response): number {
    const retryAfter = response.getHeader("Retry-After");
    if (typeof retryAfter === "string") {
      const parsed = Number(retryAfter);
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }

    return 0;
  }

  private resolveRoute(request: Request): string {
    const routePath = request.route?.path;
    const baseUrl = request.baseUrl ?? "";

    if (typeof routePath === "string" && routePath.length > 0) {
      return `${baseUrl}${routePath}`;
    }

    return request.path ?? request.url;
  }
}
