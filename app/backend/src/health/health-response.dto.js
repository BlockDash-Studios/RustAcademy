"use strict";
// TypeScript decorator helpers injected by the compiler (tsc) when
// targeting the new ECMAScript decorators proposal. These implement
// decorator application (__esDecorate) and running any field
// initializers produced by decorators (__runInitializers). Not
// hand-written code — regenerated whenever the source .ts file is
// recompiled.
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
// Runs any initializer functions collected from field decorators against
// a given instance, threading the value through each in turn.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadyResponseDto =
  exports.ReadyCheckDto =
  exports.HealthResponseDto =
    void 0;
var swagger_1 = require("@nestjs/swagger");

// ---------------------------------------------------------------------
// HealthResponseDto
// Response shape for a basic liveness/health check endpoint
// (e.g. GET /health), confirming the service process is up.
// Fields: status, version, uptime (each decorated with @ApiProperty
// for Swagger/OpenAPI documentation).
// ---------------------------------------------------------------------
var HealthResponseDto = (function () {
  var _a;
  // Per-field decorator/initializer bookkeeping arrays, populated below
  // and consumed inside the constructor via __runInitializers.
  var _status_decorators;
  var _status_initializers = [];
  var _status_extraInitializers = [];
  var _version_decorators;
  var _version_initializers = [];
  var _version_extraInitializers = [];
  var _uptime_decorators;
  var _uptime_initializers = [];
  var _uptime_extraInitializers = [];
  return (
    (_a = /** @class */ (function () {
      // Constructor runs each field's decorator-produced initializers
      // in declaration order, chaining the "extra initializers" from
      // the previous field before running the next field's own.
      function HealthResponseDto() {
        this.status = __runInitializers(this, _status_initializers, void 0);
        this.version =
          (__runInitializers(this, _status_extraInitializers),
          __runInitializers(this, _version_initializers, void 0));
        this.uptime =
          (__runInitializers(this, _version_extraInitializers),
          __runInitializers(this, _uptime_initializers, void 0));
        __runInitializers(this, _uptime_extraInitializers);
      }
      return HealthResponseDto;
    })()),
    (function () {
      var _metadata =
        typeof Symbol === "function" && Symbol.metadata
          ? Object.create(null)
          : void 0;
      // Equivalent to: @ApiProperty({ example: "ok" }) status: string;
      _status_decorators = [(0, swagger_1.ApiProperty)({ example: "ok" })];
      // Equivalent to: @ApiProperty({ example: "0.1.0" }) version: string;
      _version_decorators = [(0, swagger_1.ApiProperty)({ example: "0.1.0" })];
      // Equivalent to: @ApiProperty({ example: 3600, description: "Uptime in seconds" }) uptime: number;
      _uptime_decorators = [
        (0, swagger_1.ApiProperty)({
          example: 3600,
          description: "Uptime in seconds",
        }),
      ];
      // Wire up each field's decorators via the shared __esDecorate helper.
      __esDecorate(
        null,
        null,
        _status_decorators,
        {
          kind: "field",
          name: "status",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "status" in obj;
            },
            get: function (obj) {
              return obj.status;
            },
            set: function (obj, value) {
              obj.status = value;
            },
          },
          metadata: _metadata,
        },
        _status_initializers,
        _status_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _version_decorators,
        {
          kind: "field",
          name: "version",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "version" in obj;
            },
            get: function (obj) {
              return obj.version;
            },
            set: function (obj, value) {
              obj.version = value;
            },
          },
          metadata: _metadata,
        },
        _version_initializers,
        _version_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _uptime_decorators,
        {
          kind: "field",
          name: "uptime",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "uptime" in obj;
            },
            get: function (obj) {
              return obj.uptime;
            },
            set: function (obj, value) {
              obj.uptime = value;
            },
          },
          metadata: _metadata,
        },
        _uptime_initializers,
        _uptime_extraInitializers,
      );
      if (_metadata)
        Object.defineProperty(_a, Symbol.metadata, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: _metadata,
        });
    })(),
    _a
  );
})();
exports.HealthResponseDto = HealthResponseDto;

// ---------------------------------------------------------------------
// ReadyCheckDto
// Represents the result of a single dependency check (e.g. database,
// cache, message queue) performed as part of an overall readiness check.
// Fields: name, status, latency, details, lastSuccess, error, lagSeconds.
// ---------------------------------------------------------------------
var ReadyCheckDto = (function () {
  var _a;
  var _name_decorators;
  var _name_initializers = [];
  var _name_extraInitializers = [];
  var _status_decorators;
  var _status_initializers = [];
  var _status_extraInitializers = [];
  var _latency_decorators;
  var _latency_initializers = [];
  var _latency_extraInitializers = [];
  var _details_decorators;
  var _details_initializers = [];
  var _details_extraInitializers = [];
  var _lastSuccess_decorators;
  var _lastSuccess_initializers = [];
  var _lastSuccess_extraInitializers = [];
  var _error_decorators;
  var _error_initializers = [];
  var _error_extraInitializers = [];
  var _lagSeconds_decorators;
  var _lagSeconds_initializers = [];
  var _lagSeconds_extraInitializers = [];
  return (
    (_a = /** @class */ (function () {
      function ReadyCheckDto() {
        this.name = __runInitializers(this, _name_initializers, void 0);
        this.status =
          (__runInitializers(this, _name_extraInitializers),
          __runInitializers(this, _status_initializers, void 0));
        this.latency =
          (__runInitializers(this, _status_extraInitializers),
          __runInitializers(this, _latency_initializers, void 0));
        this.details =
          (__runInitializers(this, _latency_extraInitializers),
          __runInitializers(this, _details_initializers, void 0));
        this.lastSuccess =
          (__runInitializers(this, _details_extraInitializers),
          __runInitializers(this, _lastSuccess_initializers, void 0));
        this.error =
          (__runInitializers(this, _lastSuccess_extraInitializers),
          __runInitializers(this, _error_initializers, void 0));
        this.lagSeconds =
          (__runInitializers(this, _error_extraInitializers),
          __runInitializers(this, _lagSeconds_initializers, void 0));
        __runInitializers(this, _lagSeconds_extraInitializers);
      }
      return ReadyCheckDto;
    })()),
    (function () {
      var _metadata =
        typeof Symbol === "function" && Symbol.metadata
          ? Object.create(null)
          : void 0;
      // Name of the dependency being checked (e.g. "supabase").
      _name_decorators = [(0, swagger_1.ApiProperty)({ example: "supabase" })];
      // Whether this specific dependency is currently reachable/healthy.
      _status_decorators = [
        (0, swagger_1.ApiProperty)({ enum: ["up", "down"] }),
      ];
      // Optional round-trip latency observed for this check, as a display string.
      _latency_decorators = [
        (0, swagger_1.ApiProperty)({ example: "125ms", required: false }),
      ];
      // Optional extra human-readable notes about this check.
      _details_decorators = [
        (0, swagger_1.ApiProperty)({
          example: ["All critical env variables loaded"],
          required: false,
          type: [String],
        }),
      ];
      // Optional timestamp of the last time this check succeeded.
      _lastSuccess_decorators = [
        (0, swagger_1.ApiProperty)({
          example: "2024-01-01T00:00:00.000Z",
          required: false,
        }),
      ];
      // Optional error message describing why the check failed, if it did.
      _error_decorators = [
        (0, swagger_1.ApiProperty)({
          example: "Connection timeout",
          required: false,
        }),
      ];
      // Optional lag in seconds, relevant for data ingestion/replication checks.
      _lagSeconds_decorators = [
        (0, swagger_1.ApiProperty)({
          example: 5,
          required: false,
          description: "Lag in seconds for ingestion checks",
        }),
      ];
      __esDecorate(
        null,
        null,
        _name_decorators,
        {
          kind: "field",
          name: "name",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "name" in obj;
            },
            get: function (obj) {
              return obj.name;
            },
            set: function (obj, value) {
              obj.name = value;
            },
          },
          metadata: _metadata,
        },
        _name_initializers,
        _name_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _status_decorators,
        {
          kind: "field",
          name: "status",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "status" in obj;
            },
            get: function (obj) {
              return obj.status;
            },
            set: function (obj, value) {
              obj.status = value;
            },
          },
          metadata: _metadata,
        },
        _status_initializers,
        _status_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _latency_decorators,
        {
          kind: "field",
          name: "latency",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "latency" in obj;
            },
            get: function (obj) {
              return obj.latency;
            },
            set: function (obj, value) {
              obj.latency = value;
            },
          },
          metadata: _metadata,
        },
        _latency_initializers,
        _latency_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _details_decorators,
        {
          kind: "field",
          name: "details",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "details" in obj;
            },
            get: function (obj) {
              return obj.details;
            },
            set: function (obj, value) {
              obj.details = value;
            },
          },
          metadata: _metadata,
        },
        _details_initializers,
        _details_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _lastSuccess_decorators,
        {
          kind: "field",
          name: "lastSuccess",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "lastSuccess" in obj;
            },
            get: function (obj) {
              return obj.lastSuccess;
            },
            set: function (obj, value) {
              obj.lastSuccess = value;
            },
          },
          metadata: _metadata,
        },
        _lastSuccess_initializers,
        _lastSuccess_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _error_decorators,
        {
          kind: "field",
          name: "error",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "error" in obj;
            },
            get: function (obj) {
              return obj.error;
            },
            set: function (obj, value) {
              obj.error = value;
            },
          },
          metadata: _metadata,
        },
        _error_initializers,
        _error_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _lagSeconds_decorators,
        {
          kind: "field",
          name: "lagSeconds",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "lagSeconds" in obj;
            },
            get: function (obj) {
              return obj.lagSeconds;
            },
            set: function (obj, value) {
              obj.lagSeconds = value;
            },
          },
          metadata: _metadata,
        },
        _lagSeconds_initializers,
        _lagSeconds_extraInitializers,
      );
      if (_metadata)
        Object.defineProperty(_a, Symbol.metadata, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: _metadata,
        });
    })(),
    _a
  );
})();
exports.ReadyCheckDto = ReadyCheckDto;

// ---------------------------------------------------------------------
// ReadyResponseDto
// Response shape for a readiness check endpoint (e.g. GET /ready), used
// by orchestrators (e.g. Kubernetes) to decide whether the service should
// receive traffic. Aggregates the results of all individual checks.
// Fields: ready, timestamp, checks (an array of ReadyCheckDto).
// ---------------------------------------------------------------------
var ReadyResponseDto = (function () {
  var _a;
  var _ready_decorators;
  var _ready_initializers = [];
  var _ready_extraInitializers = [];
  var _timestamp_decorators;
  var _timestamp_initializers = [];
  var _timestamp_extraInitializers = [];
  var _checks_decorators;
  var _checks_initializers = [];
  var _checks_extraInitializers = [];
  return (
    (_a = /** @class */ (function () {
      function ReadyResponseDto() {
        this.ready = __runInitializers(this, _ready_initializers, void 0);
        this.timestamp =
          (__runInitializers(this, _ready_extraInitializers),
          __runInitializers(this, _timestamp_initializers, void 0));
        this.checks =
          (__runInitializers(this, _timestamp_extraInitializers),
          __runInitializers(this, _checks_initializers, void 0));
        __runInitializers(this, _checks_extraInitializers);
      }
      return ReadyResponseDto;
    })()),
    (function () {
      var _metadata =
        typeof Symbol === "function" && Symbol.metadata
          ? Object.create(null)
          : void 0;
      // Overall readiness: true only if all checks pass (implementation-dependent).
      _ready_decorators = [(0, swagger_1.ApiProperty)({ example: true })];
      // When this readiness check was performed.
      _timestamp_decorators = [
        (0, swagger_1.ApiProperty)({
          example: "2024-01-01T00:00:00.000Z",
          description: "Timestamp of the readiness check",
        }),
      ];
      // Breakdown of each individual dependency check contributing to `ready`.
      _checks_decorators = [
        (0, swagger_1.ApiProperty)({ type: [ReadyCheckDto] }),
      ];
      __esDecorate(
        null,
        null,
        _ready_decorators,
        {
          kind: "field",
          name: "ready",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "ready" in obj;
            },
            get: function (obj) {
              return obj.ready;
            },
            set: function (obj, value) {
              obj.ready = value;
            },
          },
          metadata: _metadata,
        },
        _ready_initializers,
        _ready_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _timestamp_decorators,
        {
          kind: "field",
          name: "timestamp",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "timestamp" in obj;
            },
            get: function (obj) {
              return obj.timestamp;
            },
            set: function (obj, value) {
              obj.timestamp = value;
            },
          },
          metadata: _metadata,
        },
        _timestamp_initializers,
        _timestamp_extraInitializers,
      );
      __esDecorate(
        null,
        null,
        _checks_decorators,
        {
          kind: "field",
          name: "checks",
          static: false,
          private: false,
          access: {
            has: function (obj) {
              return "checks" in obj;
            },
            get: function (obj) {
              return obj.checks;
            },
            set: function (obj, value) {
              obj.checks = value;
            },
          },
          metadata: _metadata,
        },
        _checks_initializers,
        _checks_extraInitializers,
      );
      if (_metadata)
        Object.defineProperty(_a, Symbol.metadata, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: _metadata,
        });
    })(),
    _a
  );
})();
exports.ReadyResponseDto = ReadyResponseDto;
