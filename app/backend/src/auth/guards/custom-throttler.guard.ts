import { ExecutionContext, Injectable, Inject } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerRequest,
} from "@nestjs/throttler";
import {
  RATE_LIMIT_GROUP_METADATA_KEY,
  RateLimitGroup,
  RateLimitKeyType,
  SENSITIVE_IP_SEGMENT,
  THROTTLER_BURST_NAME,
  throttlerConfig,
} from "../../config/rate-limit.config";
import { MetricsService } from "../../metrics/metrics.service";
import { AuditService } from "../../audit/audit.service";

type RequestWithRateLimitContext = Record<string, unknown> & {
  headers?: Record<string, string | string[] | undefined>;
  user?: { id?: string };
  apiKey?: { id?: string };
  ip?: string;
  route?: { path?: string };
  baseUrl?: string;
  path?: string;
  originalUrl?: string;
  method?: string;
  rateLimitContext?: {
    group: RateLimitGroup;
    keyType: RateLimitKeyType;
    /** True while the always-IP-keyed "sensitive" check is in progress. */
    forcedIp?: boolean;
  };
};

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  @Inject(MetricsService)
  private readonly metricsService: MetricsService;

  @Inject(AuditService)
  private readonly auditService: AuditService;

  protected readonly reflector = new Reflector();

  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, throttler } = requestProps;
    const req = context
      .switchToHttp()
      .getRequest<RequestWithRateLimitContext>();

    const group = this.resolveGroup(context, req);

    if (!throttler.name.startsWith(`${group}_`)) {
      return true;
    }

    // For "sensitive", two independent throttler profiles are registered
    // per window (see buildThrottlerProfiles): one keyed by the resolved
    // identity (`sensitive_burst`/`sensitive_sustained`) and one always
    // keyed by IP (`sensitive_ip_burst`/`sensitive_ip_sustained`). Both must
    // pass — this is what gives sensitive mutations *both* a per-user and a
    // per-IP cap, per Issue #551, instead of just whichever identity
    // resolves first.
    const forcedIp = throttler.name.includes(`_${SENSITIVE_IP_SEGMENT}_`);
    const window = throttler.name.endsWith(`_${THROTTLER_BURST_NAME}`)
      ? "burst"
      : "sustained";
    const windowConfig = forcedIp
      ? throttlerConfig.sensitiveIpLimits[window]
      : throttlerConfig.groups[group][window];

    req.rateLimitContext = {
      group,
      keyType: forcedIp ? "ip" : this.resolveIdentity(req).keyType,
      forcedIp,
    };

    try {
      return await super.handleRequest({
        ...requestProps,
        limit: windowConfig.limit,
        ttl: windowConfig.ttlMs,
        throttler: {
          ...throttler,
          limit: windowConfig.limit,
          ttl: windowConfig.ttlMs,
        },
      });
    } catch (error) {
      if (error instanceof ThrottlerException) {
        const retryAfterSeconds = Math.ceil(windowConfig.ttlMs / 1000);
        const response = context
          .switchToHttp()
          .getResponse<Record<string, unknown>>();

        if (typeof response?.setHeader === "function") {
          response.setHeader("Retry-After", retryAfterSeconds.toString());
        }

        const method = req.method ?? "unknown";
        const routePath = req.route?.path ?? req.path ?? req.originalUrl ?? "unknown";

        this.metricsService.recordRateLimitedRequest(
          method,
          routePath,
          group,
          req.rateLimitContext.keyType,
        );

        // Explicit anomaly handling (Issue #551): a tripped "sensitive"
        // limit is itself a security-relevant event, not just a metric —
        // record who/what/where in the immutable audit trail. Fire-and-
        // forget: AuditService.log() never throws (it degrades to an
        // in-memory fallback internally), and auditing must never be able
        // to block or fail the throttling decision itself.
        if (group === "sensitive") {
          const identity = this.resolveIdentity(req);
          const requestIdHeader = req.headers?.["x-request-id"];
          const requestId =
            typeof requestIdHeader === "string" ? requestIdHeader : undefined;

          void this.auditService.log(
            `${identity.keyType}:${identity.value}`,
            "rate_limit.sensitive_exceeded",
            routePath,
            {
              method,
              window,
              forcedIp,
              ip: this.getIp(req),
              limit: windowConfig.limit,
              ttlMs: windowConfig.ttlMs,
            },
            requestId,
          );
        }
      }

      throw error;
    }
  }

  protected async getTracker(
    req: RequestWithRateLimitContext,
  ): Promise<string> {
    if (req.rateLimitContext?.forcedIp) {
      return `ip:${this.getIp(req)}`;
    }

    const identity = this.resolveIdentity(req);
    return `${identity.keyType}:${identity.value}`;
  }

  private resolveGroup(
    context: ExecutionContext,
    req: RequestWithRateLimitContext,
  ): RateLimitGroup {
    const metadataGroup = this.reflector.getAllAndOverride<RateLimitGroup>(
      RATE_LIMIT_GROUP_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (metadataGroup) {
      return metadataGroup;
    }

    const path =
      `${req.baseUrl ?? ""}${req.route?.path ?? req.path ?? req.originalUrl ?? ""}`.toLowerCase();
    if (path.startsWith("/webhooks") || path.includes("/webhooks/")) {
      return "webhooks";
    }

    if (this.getUserId(req) || this.getApiKeyValue(req)) {
      return "authenticated";
    }

    return "public";
  }

  private resolveIdentity(req: RequestWithRateLimitContext): {
    keyType: RateLimitKeyType;
    value: string;
  } {
    const ip = this.getIp(req);

    for (const keyType of throttlerConfig.keyOrder) {
      if (keyType === "user_id") {
        const userId = this.getUserId(req);
        if (userId) return { keyType, value: userId };
      }

      if (keyType === "api_key") {
        const apiKey = this.getApiKeyValue(req);
        if (apiKey) return { keyType, value: apiKey };
      }

      if (keyType === "ip" && ip) {
        return { keyType, value: ip };
      }
    }

    return { keyType: "ip", value: ip || "unknown" };
  }

  private getUserId(req: RequestWithRateLimitContext): string | undefined {
    const user = req.user;
    if (user?.id && typeof user.id === "string") return user.id;

    const userId = req["userId"];
    if (typeof userId === "string" && userId.length > 0) return userId;

    const header = req.headers?.["x-user-id"];
    if (typeof header === "string" && header.length > 0) return header;

    return undefined;
  }

  private getApiKeyValue(req: RequestWithRateLimitContext): string | undefined {
    const apiKeyId = req.apiKey?.id;
    if (apiKeyId && typeof apiKeyId === "string") return apiKeyId;

    const header = req.headers?.["x-api-key"];
    if (typeof header === "string" && header.length > 0) return header;

    return undefined;
  }

  private getIp(req: RequestWithRateLimitContext): string {
    const forwardedFor = req.headers?.["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
      return forwardedFor.split(",")[0].trim();
    }

    return req.ip ?? "unknown";
  }
}
