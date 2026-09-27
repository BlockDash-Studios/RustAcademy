// Load .env before any module reads process.env (validation runs at import time).
import "dotenv/config";

import "reflect-metadata";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BadRequestException, Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core"; //installed
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";

import { WinstonModule } from "nest-winston";
import { winstonConfig } from "./common/logging/winston.config";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
// ----------------------------------------

import { buildCorsOptions } from "./config/cors.config";
import { AppConfigService, validateEnv } from "./config";
import { AppModule } from "./app.module";
import {
  NetworkSnapshot,
  resolveNetworkSnapshot,
} from "./config/network.config";
import { GlobalHttpExceptionFilter } from "./common/filters/global-http-exception.filter";
import { mapValidationErrors } from "./common/utils/validation-error.mapper";
import { ErrorCode } from "./common/errors";
import { MetricsService } from "./metrics/metrics.service";
import { CorrelationContextService } from "./common/correlation/correlation-context.service";
import {
  sanitizeErrorMessage,
  createConfigSummary,
} from "./common/utils/redaction.util";

/**
 * Validates the loaded, typed configuration (dependency state) before the
 * HTTP server binds. Fail-fast: any error aborts startup with a sanitized,
 * actionable message; warnings are logged but do not block startup.
 */
function validateStartupDependencies(
  config: AppConfigService,
  logger: Logger,
): void {
  const { errors, warnings } = config.validate();

  for (const warning of warnings) {
    logger.warn(warning);
  }

  if (errors.length > 0) {
    const errorMessage =
      `Startup configuration errors:\n` +
      errors.map((error) => `  - ${error}`).join("\n") +
      `\nFix the listed variables and restart the application.`;
    logger.error(errorMessage);
    throw new Error(sanitizeErrorMessage(errorMessage));
  }

  logger.log("Configuration validated successfully");
}

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  // ── Fail-fast startup validation ──────────────────────────────────────
  // Validate configuration and network setup BEFORE the Nest application is
  // created, so missing/invalid config never leaves the app in a partially
  // initialized state. Each failure logs a sanitized, actionable message and
  // aborts before the HTTP server binds.
  try {
    validateEnv(process.env);
  } catch (error) {
    logger.error(sanitizeErrorMessage((error as Error).message));
    throw error;
  }

  let networkSnapshot: NetworkSnapshot;
  try {
    networkSnapshot = resolveNetworkSnapshot(process.env);
  } catch (error) {
    logger.error(
      `Network configuration invalid: ${sanitizeErrorMessage(
        (error as Error).message,
      )}`,
    );
    throw error;
  }

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  const configService = app.get(AppConfigService);

  // Validate the loaded, typed configuration (dependency state) before the
  // HTTP server binds.
  validateStartupDependencies(configService, logger);

  // Log configuration summary (safe, no secrets — raw key values excluded)
  const envSummary = createConfigSummary({
    SUPABASE_URL: configService.supabaseUrl,
    SUPABASE_ANON_KEY: configService.supabaseAnonKey,
    NETWORK: configService.network,
    HORIZON_URL: configService.horizonUrl,
    SOROBAN_RPC_URL: configService.sorobanRpcUrl,
    STELLAR_EXPLORER_URL: configService.stellarExplorerUrl,
    PAYMENT_SIGNING: configService.isPaymentSigningConfigured ? 'configured' : 'not-configured',
    STELLAR_PUBLIC_KEY: configService.stellarPublicKey,
  });
  logger.log(envSummary);
  logger.log(
    `Active network: ${networkSnapshot.network} (${networkSnapshot.passphrase}); horizon=${networkSnapshot.horizonUrl}; soroban=${networkSnapshot.sorobanRpcUrl}; explorer=${networkSnapshot.explorerUrl}`,
  );

  // Use Helmet for security headers
  app.use(helmet());

  app.enableCors(
    buildCorsOptions({
      nodeEnv: configService.nodeEnv,
      allowedOrigins: configService.corsAllowedOrigins,
      vercelProject: configService.corsVercelProject,
    }),
  );

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const mapped = mapValidationErrors(errors);
        return new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: mapped.message,
          fields: mapped.fields,
        });
      },
    }),
  );

  const correlationContext = app.get(CorrelationContextService);
  app.useGlobalInterceptors(new LoggingInterceptor(correlationContext));

  const metricsService = app.get(MetricsService);
  app.useGlobalFilters(new GlobalHttpExceptionFilter(configService, metricsService));

  // Swagger setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle(" RustAcademy Backend")
    .setDescription(
      " RustAcademy API documentation - A Stellar-based exchange platform. " +
        `Currently connected to: ${configService.network}`,
    )
    .setVersion("v1")
    .addTag("health", "Health check endpoints")
    .addTag("usernames", "Username management endpoints")
    .addTag("links", "Payment link validation and metadata endpoints")
    .addTag("transactions", "Stellar transaction and payment history")
    .addTag("scam-alerts", "Fraud detection and link scanning")
    .addTag(
      "analytics",
      "Dashboard analytics, time-series insights, and report exports",
    )
    .addTag("metrics", "Application performance and health metrics")
    .addTag("stellar", "Verified assets, path preview, Soroban preflight")
    .addTag("contracts", "Contract registry publication and discovery")
    .addTag(
      "developer",
      "Developer self-service: ping, webhook testing, key management, health score",
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = configService.port;
  // Bind to 0.0.0.0 so devices on your LAN can access the dev server.
  await app.listen(port, "0.0.0.0");

  logger.log(`Backend listening on http://0.0.0.0:${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/docs`);
}

void bootstrap();
