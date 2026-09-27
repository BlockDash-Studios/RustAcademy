"use strict";
// TypeScript decorator helper injected by the compiler (tsc) when
// targeting the new ECMAScript decorators proposal. Applies the class
// decorator (@Module) below and wires up any initializers it produces.
// Not hand-written — regenerated whenever the source .ts file is recompiled.
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
// Runs any initializer functions collected from decorators against a
// given instance/class, threading the value through each in turn.
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
// Sets a function's display `.name` (used for stack traces/debugging)
// since the class expression produced by the decorator transform would
// otherwise lose its original name.
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
exports.HealthModule = void 0;
var common_1 = require("@nestjs/common");
var supabase_module_1 = require("../supabase/supabase.module");
var stellar_module_1 = require("../stellar/stellar.module");
var job_queue_module_1 = require("../job-queue/job-queue.module");
var ingestion_module_1 = require("../ingestion/ingestion.module");
var transactions_module_1 = require("../transactions/transactions.module");
var health_controller_1 = require("./health.controller");
var health_service_1 = require("./health.service");

// ---------------------------------------------------------------------
// HealthModule
// NestJS feature module wiring up the health-check functionality:
//   - Registers HealthController (the /health, /ready, /status routes)
//   - Provides HealthService (the logic those routes call into)
//   - Imports the modules whose exported providers HealthService needs
//     in order to check the health of Supabase, Stellar, the job queue,
//     ingestion, and transactions.
// Equivalent to something like:
//   @Module({
//     imports: [SupabaseModule, StellarModule, JobQueueModule, IngestionModule, TransactionsModule],
//     controllers: [HealthController],
//     providers: [HealthService],
//   })
//   export class HealthModule {}
// ---------------------------------------------------------------------
var HealthModule = (function () {
  // Class-level decorator: the @Module() metadata that tells Nest what
  // this module imports, which controllers it registers, and which
  // providers it makes available for dependency injection.
  var _classDecorators = [
    (0, common_1.Module)({
      imports: [
        supabase_module_1.SupabaseModule,
        stellar_module_1.StellarModule,
        job_queue_module_1.JobQueueModule,
        ingestion_module_1.IngestionModule,
        transactions_module_1.TransactionsModule,
      ],
      controllers: [health_controller_1.HealthController],
      providers: [health_service_1.HealthService],
    }),
  ];
  var _classDescriptor;
  var _classExtraInitializers = [];
  var _classThis;
  // The module class itself has no logic of its own — all behavior
  // comes from the imported modules, controller, and service declared
  // in the @Module() metadata above.
  var HealthModule = (_classThis = /** @class */ (function () {
    function HealthModule_1() {}
    return HealthModule_1;
  })());
  __setFunctionName(_classThis, "HealthModule");
  (function () {
    var _metadata =
      typeof Symbol === "function" && Symbol.metadata
        ? Object.create(null)
        : void 0;
    // Apply the @Module() class decorator to finalize the module definition.
    __esDecorate(
      null,
      (_classDescriptor = { value: _classThis }),
      _classDecorators,
      { kind: "class", name: _classThis.name, metadata: _metadata },
      null,
      _classExtraInitializers,
    );
    HealthModule = _classThis = _classDescriptor.value;
    if (_metadata)
      Object.defineProperty(_classThis, Symbol.metadata, {
        enumerable: true,
        configurable: true,
        writable: true,
        value: _metadata,
      });
    __runInitializers(_classThis, _classExtraInitializers);
  })();
  return (HealthModule = _classThis);
})();
exports.HealthModule = HealthModule;
