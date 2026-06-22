"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanEventIndexerService = void 0;
var common_1 = require("@nestjs/common");
var stellar_config_1 = require("../config/stellar.config");
var soroban_event_parser_1 = require("./soroban-event.parser");
/** Number of events fetched per Horizon page. */
var PAGE_LIMIT = 200;
/**
 * Polls Soroban contract events by ledger range from Horizon's REST API.
 *
 * Responsibilities:
 *  - Fetch events page-by-page for a given [fromLedger, toLedger] range.
 *  - Parse each event with schema-version awareness.
 *  - Persist all event domains idempotently (escrow, privacy, admin, stealth).
 *  - Advance the durable checkpoint after each page so a crash is recoverable.
 *  - Emit domain events for downstream consumers.
 *
 * Reconciliation / reindex: calling `indexLedgerRange` with `force=true` skips
 * the checkpoint read and re-processes the full range. Idempotent upserts ensure
 * no duplicates are created.
 */
var SorobanEventIndexerService = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var SorobanEventIndexerService = _classThis = /** @class */ (function () {
        function SorobanEventIndexerService_1(config, checkpointRepo, escrowRepo, privacyRepo, adminRepo, stealthRepo, metrics, eventEmitter) {
            var _this = this;
            this.config = config;
            this.checkpointRepo = checkpointRepo;
            this.escrowRepo = escrowRepo;
            this.privacyRepo = privacyRepo;
            this.adminRepo = adminRepo;
            this.stealthRepo = stealthRepo;
            this.metrics = metrics;
            this.eventEmitter = eventEmitter;
            this.logger = new common_1.Logger(SorobanEventIndexerService.name);
            this.horizonUrl = stellar_config_1.HORIZON_BASE_URLS[this.config.network];
            // Wire the parser's unknown-schema-version callback to metrics.
            this.parser = new soroban_event_parser_1.SorobanEventParser(function (eventName, version, pagingToken) {
                _this.logger.warn("Unknown schema_version=".concat(version, " for event ").concat(eventName, " paging_token=").concat(pagingToken));
                _this.metrics.recordUnknownSchemaVersion(eventName, version);
            });
        }
        // ---------------------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------------------
        /**
         * Index all contract events in [fromLedger, toLedger] with dual-read support.
         *
         * @param contractId      Soroban contract address (current).
         * @param fromLedger      Inclusive start ledger.
         * @param toLedger        Inclusive end ledger.
         * @param dualReadConfig  Optional dual-read configuration for transition windows.
         * @param force           When true, ignore the stored checkpoint and reindex the
         *                        full range (reconciliation mode). Idempotency prevents
         *                        duplicate records.
         */
        SorobanEventIndexerService_1.prototype.indexLedgerRange = async function (contractId, fromLedger, toLedger, dualReadConfig, force) {
            if (force === void 0) { force = false; }
            var network = this.config.network;
            var processed = 0;
            var persisted = 0;
            var skippedUnknownSchema = 0;
            var inDualReadWindow = this.isInDualReadWindow(fromLedger, dualReadConfig);
            if (inDualReadWindow && (dualReadConfig === null || dualReadConfig === void 0 ? void 0 : dualReadConfig.previousContractId)) {
                var _a;
                var prevResult = await this.runIndexingEngine(
                    dualReadConfig.previousContractId,
                    fromLedger,
                    (_a = dualReadConfig.effectiveLedger) !== null && _a !== void 0 ? _a : toLedger,
                    network,
                    "dual-read-previous",
                    force
                );
                processed += prevResult.processed;
                persisted += prevResult.persisted;
                skippedUnknownSchema += prevResult.skippedUnknownSchema;
            }
            var currentMode = inDualReadWindow ? "dual-read-current" : "normal";
            var currentResult = await this.runIndexingEngine(contractId, fromLedger, toLedger, network, currentMode, force);
            processed += currentResult.processed;
            persisted += currentResult.persisted;
            skippedUnknownSchema += currentResult.skippedUnknownSchema;
            return { fromLedger: fromLedger, toLedger: toLedger, processed: processed, persisted: persisted, skippedUnknownSchema: skippedUnknownSchema };
        };
        SorobanEventIndexerService_1.prototype.runIndexingEngine = async function (contractId, fromLedger, toLedger, network, mode, force) {
            var currentCursor = null;
            var startLedgerValue = fromLedger;
            if (!force) {
                var checkpoint = await this.checkpointRepo.getCheckpoint(contractId, network, mode);
                if (checkpoint) {
                    if (checkpoint.lastLedger >= toLedger && !checkpoint.pagingToken) {
                        this.logger.log("Range [".concat(fromLedger, ", ").concat(toLedger, "] already fully indexed for stream ").concat(mode, "."));
                        return { processed: 0, persisted: 0, skippedUnknownSchema: 0 };
                    }
                    startLedgerValue = checkpoint.lastLedger;
                    currentCursor = checkpoint.pagingToken;
                }
            }
            return this.indexContractWithCursor(contractId, startLedgerValue, toLedger, network, mode, currentCursor);
        };
        SorobanEventIndexerService_1.prototype.indexContractWithCursor = async function (contractId, fromLedger, toLedger, network, mode, cursor) {
            var processed = 0;
            var persisted = 0;
            var skippedUnknownSchema = 0;
            var nextCursor = cursor || undefined;
            while (true) {
                var _a = await this.fetchPage(contractId, fromLedger, toLedger, nextCursor);
                var records = _a.records;
                var returnedCursor = _a.nextCursor;
                if (records.length === 0) {
                    await this.checkpointRepo.saveCheckpoint({
                        contractId: contractId,
                        network: network,
                        mode: mode,
                        lastLedger: toLedger,
                        pagingToken: null,
                    });
                    break;
                }
                for (var _i = 0; _i < records.length; _i++) {
                    var raw = records[_i];
                    processed++;
                    var event_1 = this.parser.parse(raw);
                    if (!event_1) {
                        skippedUnknownSchema++;
                        continue;
                    }
                    await this.persistEvent(event_1);
                    persisted++;
                    this.eventEmitter.emit("stellar.".concat(event_1.eventType), event_1);
                }
                var lastRecord = records[records.length - 1];
                if (lastRecord) {
                    nextCursor = returnedCursor;
                    await this.checkpointRepo.saveCheckpoint({
                        contractId: contractId,
                        network: network,
                        mode: mode,
                        lastLedger: lastRecord.ledger,
                        pagingToken: nextCursor || null,
                    });
                }
                if (!returnedCursor || records.length < PAGE_LIMIT) break;
                nextCursor = returnedCursor;
            }
            return { processed: processed, persisted: persisted, skippedUnknownSchema: skippedUnknownSchema };
        };
        SorobanEventIndexerService_1.prototype.isInDualReadWindow = function (currentLedger, config) {
            if (!(config === null || config === void 0 ? void 0 : config.previousContractId) || !(config === null || config === void 0 ? void 0 : config.effectiveLedger)) {
                return false;
            }
            return currentLedger < config.effectiveLedger;
        };
        /**
         * Fetches one page of contract events from Horizon for the given ledger range.
         * Uses the `start_ledger` + `end_ledger` query params (Horizon v2 API).
         */
        SorobanEventIndexerService_1.prototype.fetchPage = function (contractId, fromLedger, toLedger, cursor) {
            return __awaiter(this, void 0, void 0, function () {
                var url, res, body, records, nextHref, nextCursor;
                var _a, _b, _c, _d, _e;
                return __generator(this, function (_f) {
                    switch (_f.label) {
                        case 0:
                            url = new URL("".concat(this.horizonUrl, "/contract_events"));
                            url.searchParams.set("contract_id", contractId);
                            url.searchParams.set("start_ledger", String(fromLedger));
                            url.searchParams.set("end_ledger", String(toLedger));
                            url.searchParams.set("limit", String(PAGE_LIMIT));
                            url.searchParams.set("order", "asc");
                            if (cursor)
                                url.searchParams.set("cursor", cursor);
                            return [4 /*yield*/, fetch(url.toString(), {
                                    headers: { Accept: "application/json" },
                                })];
                        case 1:
                            res = _f.sent();
                            if (!res.ok) {
                                throw new Error("Horizon returned ".concat(res.status, " for ").concat(url.toString()));
                            }
                            return [4 /*yield*/, res.json()];
                        case 2:
                            body = (_f.sent());
                            records = (_b = (_a = body._embedded) === null || _a === void 0 ? void 0 : _a.records) !== null && _b !== void 0 ? _b : [];
                            nextHref = (_d = (_c = body._links) === null || _c === void 0 ? void 0 : _c.next) === null || _d === void 0 ? void 0 : _d.href;
                            nextCursor = nextHref
                                ? ((_e = new URL(nextHref).searchParams.get("cursor")) !== null && _e !== void 0 ? _e : undefined)
                                : undefined;
                            return [2 /*return*/, { records: records, nextCursor: nextCursor }];
                    }
                });
            });
        };
        SorobanEventIndexerService_1.prototype.persistEvent = function (event) {
            return __awaiter(this, void 0, void 0, function () {
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _a = event.eventType;
                            switch (_a) {
                                case "EscrowDeposited": return [3 /*break*/, 1];
                                case "EscrowWithdrawn": return [3 /*break*/, 1];
                                case "EscrowRefunded": return [3 /*break*/, 1];
                                case "PrivacyToggled": return [3 /*break*/, 3];
                                case "ContractPaused": return [3 /*break*/, 5];
                                case "AdminChanged": return [3 /*break*/, 5];
                                case "ContractUpgraded": return [3 /*break*/, 5];
                                case "EphemeralKeyRegistered": return [3 /*break*/, 7];
                                case "StealthWithdrawn": return [3 /*break*/, 7];
                            }
                            return [3 /*break*/, 9];
                        case 1: return [4 /*yield*/, this.escrowRepo.upsertEvent(event)];
                        case 2:
                            _b.sent();
                            return [3 /*break*/, 10];
                        case 3: return [4 /*yield*/, this.privacyRepo.upsertEvent(event)];
                        case 4:
                            _b.sent();
                            return [3 /*break*/, 10];
                        case 5: return [4 /*yield*/, this.adminRepo.upsertEvent(event)];
                        case 6:
                            _b.sent();
                            return [3 /*break*/, 10];
                        case 7: return [4 /*yield*/, this.stealthRepo.upsertEvent(event)];
                        case 8:
                            _b.sent();
                            return [3 /*break*/, 10];
                        case 9:
                            this.logger.debug("Event ".concat(event.eventType, " not persisted."));
                            _b.label = 10;
                        case 10: return [2 /*return*/];
                    }
                });
            });
        };
        return SorobanEventIndexerService_1;
    }());
    __setFunctionName(_classThis, "SorobanEventIndexerService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SorobanEventIndexerService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SorobanEventIndexerService = _classThis;
}();
exports.SorobanEventIndexerService = SorobanEventIndexerService;
