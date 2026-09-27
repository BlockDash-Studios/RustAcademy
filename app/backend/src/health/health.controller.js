"use strict";
// Runs any initializer functions collected from field/method decorators
// against a given instance, threading the value through each in turn.
var __runInitializers =
  (this && this.__runInitializers) ||
  function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
      value = useValue
        ? initializers[i].call(thisArg, value)
        : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
  };
// TypeScript decorator helper injected by the compiler (tsc) when
// targeting the new ECMAScript decorators proposal. Applies class,
// method, and field decorators (e.g. @Controller, @Get, @ApiOperation)
// and wires up their initializers. Not hand-written — regenerated
// whenever the source .ts file is recompiled.
var __esDecorate =
  (this && this.__esDecorate) ||
  function (
    ctor,
    descriptorIn,
    decorators,
    contextIn,
    initializers,
    extraInitializers,
  ) {
    function accept(f) {
      if (f !== void 0 && typeof f !== "function")
        throw new TypeError("Function expected");
      return f;
    }
    var kind = contextIn.kind,
      key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target =
      !descriptorIn && ctor
        ? contextIn["static"]
          ? ctor
          : ctor.prototype
        : null;
    var descriptor =
      descriptorIn ||
      (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _,
      done = false;
    // Apply decorators in reverse order (closest to the declaration runs last),
    // matching standard decorator evaluation semantics.
    for (var i = decorators.length - 1; i >= 0; i--) {
      var context = {};
      for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
      for (var p in contextIn.access) context.access[p] = contextIn.access[p];
      context.addInitializer = function (f) {
        if (done)
          throw new TypeError(
            "Cannot add initializers after decoration has completed",
          );
        extraInitializers.push(accept(f || null));
      };
      var result = (0, decorators[i])(
        kind === "accessor"
          ? { get: descriptor.get, set: descriptor.set }
          : descriptor[key],
        context,
      );
      if (kind === "accessor") {
        if (result === void 0) continue;
        if (result === null || typeof result !== "object")
          throw new TypeError("Object expected");
        if ((_ = accept(result.get))) descriptor.get = _;
        if ((_ = accept(result.set))) descriptor.set = _;
        if ((_ = accept(result.init))) initializers.unshift(_);
      } else if ((_ = accept(result))) {
        if (kind === "field") initializers.unshift(_);
        else descriptor[key] = _;
      }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
  };
// Standard tslib helper that turns a generator-based async function
// (produced by compiling `async`/`await` down to ES5) into a real Promise,
// driving the generator with .next()/.throw() as it resolves/rejects.
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
// Standard tslib helper implementing the state machine that backs each
// compiled async method body (the `switch (_a.label)` blocks below are
// this state machine's cases — one per `await` point).
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create(
        (typeof Iterator === "function" ? Iterator : Object).prototype,
      );
    return (
      (g.next = verb(0)),
      (g["throw"] = verb(1)),
      (g["return"] = verb(2)),
      typeof Symbol === "function" &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError("Generator is already executing.");
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y["return"]
                  : op[0]
                    ? y["throw"] || ((t = y["return"]) && t.call(y), 0)
                    : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
// Sets a function's display `.name` (used for stack traces/debugging)
// since class expressions produced by the decorator transform would
// otherwise lose their original name.
var __setFunctionName =
  (this && this.__setFunctionName) ||
  function (f, name, prefix) {
    if (typeof name === "symbol")
      name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", {
      configurable: true,
      value: prefix ? "".concat(prefix, " ", name) : name,
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
var common_1 = require("@nestjs/common");
var swagger_1 = require("@nestjs/swagger");
var throttler_1 = require("@nestjs/throttler");
var crypto_1 = require("crypto");
var health_response_dto_1 = require("./health-response.dto");
var public_status_dto_1 = require("./public-status.dto");

// ---------------------------------------------------------------------
// HealthController
// Exposes three endpoints for monitoring/orchestration tooling:
//   GET /health  - shallow liveness check
//   GET /ready   - readiness check including dependency checks
//   GET /status  - public, cacheable, rate-limited status page
// Equivalent to something like:
//   @ApiTags('health')
//   @Controller()
//   export class HealthController {
//     constructor(private healthService: HealthService) {}
//     @Get('health') ...
//     @Get('ready') ...
//     @Get('status') ...
//   }
// ---------------------------------------------------------------------
var HealthController = (function () {
  // Class-level decorators: tags this controller as "health" in Swagger
  // docs and registers it as a NestJS controller with no route prefix.
  var _classDecorators = [
    (0, swagger_1.ApiTags)("health"),
    (0, common_1.Controller)(),
  ];
  var _classDescriptor;
  var _classExtraInitializers = [];
  var _classThis;
  var _instanceExtraInitializers = [];
  var _getHealth_decorators;
  var _getReadiness_decorators;
  var _getPublicStatus_decorators;
  var HealthController = (_classThis = /** @class */ (function () {
    // Constructor-injected HealthService, which does the actual work of
    // computing health/readiness/status results.
    function HealthController_1(healthService) {
      this.healthService =
        (__runInitializers(this, _instanceExtraInitializers), healthService);
    }

    // GET /health
    // Simple liveness check: fetches health status from the service and
    // always responds 200 with the result (no failure branch here —
    // this endpoint just reports "the process is up").
    HealthController_1.prototype.getHealth = function (res) {
      return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, this.healthService.getHealthStatus()];
            case 1:
              result = _a.sent();
              return [2 /*return*/, res.status(200).json(result)];
          }
        });
      });
    };

    // GET /ready
    // Readiness check: fetches readiness status (which includes
    // individual dependency check results). Responds 503 if the
    // service reports itself as not ready, otherwise 200 — this lets
    // orchestrators (e.g. Kubernetes) hold back traffic until ready.
    HealthController_1.prototype.getReadiness = function (res) {
      return __awaiter(this, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, this.healthService.getReadinessStatus()];
            case 1:
              result = _a.sent();
              if (!result.ready) {
                return [2 /*return*/, res.status(503).json(result)];
              }
              return [2 /*return*/, res.status(200).json(result)];
          }
        });
      });
    };

    // GET /status
    // Public status page endpoint: rate-limited (5 requests/60s per the
    // @Throttle decorator below) and cacheable via ETag/Cache-Control,
    // since it may be hit by external uptime monitors or a public
    // status page rather than internal tooling.
    HealthController_1.prototype.getPublicStatus = function (res, ifNoneMatch) {
      return __awaiter(this, void 0, void 0, function () {
        var result, etag;
        return __generator(this, function (_a) {
          switch (_a.label) {
            case 0:
              return [4 /*yield*/, this.healthService.getPublicStatus()];
            case 1:
              result = _a.sent();
              // Derive a short ETag from a hash of the response body so
              // unchanged results can be served as a cheap 304.
              etag = (0, crypto_1.createHash)("md5")
                .update(JSON.stringify(result))
                .digest("hex")
                .substring(0, 16);
              // Check if client has cached version
              if (ifNoneMatch && ifNoneMatch.includes(etag)) {
                return [2 /*return*/, res.status(304).send()];
              }
              // Set caching headers
              res.set("Cache-Control", "public, max-age=30, s-maxage=60"); // Cache for 30s client-side, 60s CDN
              res.set("ETag", '"'.concat(etag, '"'));
              return [2 /*return*/, res.status(200).json(result)];
          }
        });
      });
    };
    return HealthController_1;
  })());
  __setFunctionName(_classThis, "HealthController");
  (function () {
    var _metadata =
      typeof Symbol === "function" && Symbol.metadata
        ? Object.create(null)
        : void 0;

    // Equivalent to:
    //   @Get('health')
    //   @ApiOperation({ summary: 'Health check', description: '...' })
    //   @ApiResponse({ status: 200, type: HealthResponseDto })
    _getHealth_decorators = [
      (0, common_1.Get)("health"),
      (0, swagger_1.ApiOperation)({
        summary: "Health check",
        description:
          "Returns application health status (shallow). Used for liveness probes.",
      }),
      (0, swagger_1.ApiResponse)({
        status: 200,
        type: health_response_dto_1.HealthResponseDto,
      }),
    ];

    // Equivalent to:
    //   @Get('ready')
    //   @ApiOperation({ summary: 'Readiness check', description: '...' })
    //   @ApiResponse({ status: 200, type: ReadyResponseDto })
    //   @ApiResponse({ status: 503, type: ReadyResponseDto, description: 'Service not ready' })
    _getReadiness_decorators = [
      (0, common_1.Get)("ready"),
      (0, swagger_1.ApiOperation)({
        summary: "Readiness check",
        description:
          "Returns application readiness status including dependency checks (Supabase, environment). Used for readiness probes.",
      }),
      (0, swagger_1.ApiResponse)({
        status: 200,
        type: health_response_dto_1.ReadyResponseDto,
      }),
      (0, swagger_1.ApiResponse)({
        status: 503,
        type: health_response_dto_1.ReadyResponseDto,
        description: "Service not ready",
      }),
    ];

    // Equivalent to:
    //   @Get('status')
    //   @Throttle({ default: { limit: 5, ttl: 60000 } })
    //   @ApiOperation({ summary: 'Public status page', description: '...' })
    //   @ApiResponse({ status: 200, type: PublicStatusResponseDto })
    // The Throttle decorator caps this endpoint to 5 requests per 60
    // seconds per client, since it's public-facing and cheap to abuse.
    _getPublicStatus_decorators = [
      (0, common_1.Get)("status"),
      (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60000 } }),
      (0, swagger_1.ApiOperation)({
        summary: "Public status page",
        description:
          "Returns a minimal, cacheable status suitable for a public status page. No sensitive details exposed.",
      }),
      (0, swagger_1.ApiResponse)({
        status: 200,
        type: public_status_dto_1.PublicStatusResponseDto,
      }),
    ];

    // Wire up each method's decorators, then the class-level decorators,
    // via the shared __esDecorate helper.
    __esDecorate(
      _classThis,
      null,
      _getHealth_decorators,
      {
        kind: "method",
        name: "getHealth",
        static: false,
        private: false,
        access: {
          has: function (obj) {
            return "getHealth" in obj;
          },
          get: function (obj) {
            return obj.getHealth;
          },
        },
        metadata: _metadata,
      },
      null,
      _instanceExtraInitializers,
    );
    __esDecorate(
      _classThis,
      null,
      _getReadiness_decorators,
      {
        kind: "method",
        name: "getReadiness",
        static: false,
        private: false,
        access: {
          has: function (obj) {
            return "getReadiness" in obj;
          },
          get: function (obj) {
            return obj.getReadiness;
          },
        },
        metadata: _metadata,
      },
      null,
      _instanceExtraInitializers,
    );
    __esDecorate(
      _classThis,
      null,
      _getPublicStatus_decorators,
      {
        kind: "method",
        name: "getPublicStatus",
        static: false,
        private: false,
        access: {
          has: function (obj) {
            return "getPublicStatus" in obj;
          },
          get: function (obj) {
            return obj.getPublicStatus;
          },
        },
        metadata: _metadata,
      },
      null,
      _instanceExtraInitializers,
    );
    __esDecorate(
      null,
      (_classDescriptor = { value: _classThis }),
      _classDecorators,
      { kind: "class", name: _classThis.name, metadata: _metadata },
      null,
      _classExtraInitializers,
    );
    HealthController = _classThis = _classDescriptor.value;
    if (_metadata)
      Object.defineProperty(_classThis, Symbol.metadata, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: _metadata,
      });
    __runInitializers(_classThis, _classExtraInitializers);
  })();
  return (HealthController = _classThis);
})();
exports.HealthController = HealthController;
