"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SorobanEventParser = exports.MAX_SUPPORTED_SCHEMA_VERSION = void 0;
var common_1 = require("@nestjs/common");
var stellar_sdk_1 = require("@stellar/stellar-sdk");
var event_schema_1 = require("./event-schema");
/** Maximum schema version this indexer understands. */
exports.MAX_SUPPORTED_SCHEMA_VERSION = 2;
/**
 * Parses raw Horizon Soroban contract event records into typed domain events.
 *
 * Canonical topic layout:
 *  Topic[0] = stable  RustAcademy testnet namespace (for example TOPIC_ESCROW)
 *  Topic[1] = event name symbol
 *  Topic[2+] = indexed fields (commitment, owner, admin, etc.)
 *
 * Data = struct with remaining fields encoded as XDR ScVal.
 *
 * Legacy events used Topic[0] = event name. The parser keeps a compatibility
 * path for those events and marks them with schemaVersion=1.
 */
var SorobanEventParser = /** @class */ (function () {
    function SorobanEventParser(onUnknownSchemaVersion) {
        this.onUnknownSchemaVersion = onUnknownSchemaVersion;
        this.logger = new common_1.Logger(SorobanEventParser.name);
    }
    /**
     * Attempt to parse a raw Horizon contract event.
     * Returns null when the event is unrecognised, malformed, or carries an
     * unsupported schema version.
     */
    SorobanEventParser.prototype.parse = function (raw) {
        var _a;
        try {
            var topics = raw.topic.map(function (t) { return stellar_sdk_1.xdr.ScVal.fromXDR(t, "base64"); });
            var dataVal = stellar_sdk_1.xdr.ScVal.fromXDR(raw.value.xdr, "base64");
            if (topics.length === 0)
                return null;
            var layout = this.resolveTopicLayout(topics);
            if (!layout)
                return null;
            var schemaVersion = this.extractSchemaVersionFromData(dataVal);
            if (schemaVersion > exports.MAX_SUPPORTED_SCHEMA_VERSION) {
                this.logger.warn("Skipping event ".concat(layout.eventName, " paging_token=").concat(raw.paging_token, ": ") +
                    "schema_version=".concat(schemaVersion, " exceeds max supported (").concat(exports.MAX_SUPPORTED_SCHEMA_VERSION, ")"));
                (_a = this.onUnknownSchemaVersion) === null || _a === void 0 ? void 0 : _a.call(this, layout.eventName, schemaVersion, raw.paging_token);
                return null;
            }
            if (!this.isCompatibleSchemaVersion(layout.eventName, schemaVersion)) {
                this.logger.warn("Unsupported ".concat(layout.eventName, " schema version ").concat(schemaVersion));
                return null;
            }
            var contractLedgerSequence = this.extractLedgerSequenceFromData(dataVal);
            if (contractLedgerSequence !== undefined && contractLedgerSequence !== raw.ledger) {
                this.logger.warn("Replay metadata mismatch for ".concat(layout.eventName, " paging_token=").concat(raw.paging_token, ": ") +
                    "contract_ledger_sequence=".concat(contractLedgerSequence, " but Horizon ledger=").concat(raw.ledger, ". ") +
                    "Event will still be parsed; investigate potential replay tampering.");
            }
            var base = {
                schemaVersion: schemaVersion,
                topicNamespace: layout.topicNamespace,
                txHash: raw.transaction_hash,
                ledgerSequence: raw.ledger,
                pagingToken: raw.paging_token,
                contractTimestamp: this.extractTimestampFromData(dataVal),
                contractLedgerSequence: contractLedgerSequence,
            };
            switch (layout.eventName) {
                case "EscrowDeposited":
                    return this.parseEscrowDeposited(topics, dataVal, base, layout.indexedOffset);
                case "EscrowWithdrawn":
                    return this.parseEscrowWithdrawn(topics, dataVal, base, layout.indexedOffset);
                case "EscrowRefunded":
                    return this.parseEscrowRefunded(topics, dataVal, base, layout.indexedOffset);
                case "PrivacyToggled":
                    return this.parsePrivacyToggled(topics, dataVal, base, layout.indexedOffset);
                case "ContractPaused":
                    return this.parseContractPaused(topics, dataVal, base, layout.indexedOffset);
                case "AdminChanged":
                    return this.parseAdminChanged(topics, dataVal, base, layout.indexedOffset);
                case "ContractUpgraded":
                    return this.parseContractUpgraded(topics, dataVal, base, layout.indexedOffset);
                case "EphemeralKeyRegistered":
                    return this.parseEphemeralKeyRegistered(topics, dataVal, base, layout.indexedOffset);
                case "StealthWithdrawn":
                    return this.parseStealthWithdrawn(topics, dataVal, base, layout.indexedOffset);
                default:
                    this.logger.debug("Unrecognised event name: ".concat(layout.eventName));
                    return null;
            }
        }
        catch (err) {
            this.logger.warn("Failed to parse contract event ".concat(raw.paging_token, ": ").concat(err.message));
            return null;
        }
    };
    // ---------------------------------------------------------------------------
    // Escrow event parsers
    // ---------------------------------------------------------------------------
    SorobanEventParser.prototype.parseEscrowDeposited = function (topics, data, base, indexedOffset) {
        var _a, _b;
        var commitment = this.decodeBytes32Hex(topics[indexedOffset]);
        var owner = this.decodeAddress(topics[indexedOffset + 1]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "EscrowDeposited" }, base), { commitment: commitment, owner: owner, token: this.decodeAddress(map["token"]), amount: BigInt((0, stellar_sdk_1.scValToNative)((_a = map["amount_due"]) !== null && _a !== void 0 ? _a : map["amount"])), amountPaid: BigInt((0, stellar_sdk_1.scValToNative)((_b = map["amount_paid"]) !== null && _b !== void 0 ? _b : map["amount"])), expiresAt: BigInt((0, stellar_sdk_1.scValToNative)(map["expires_at"])) });
    };
    SorobanEventParser.prototype.parseEscrowWithdrawn = function (topics, data, base, indexedOffset) {
        var commitment = this.decodeBytes32Hex(topics[indexedOffset]);
        var owner = this.decodeAddress(topics[indexedOffset + 1]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "EscrowWithdrawn" }, base), { commitment: commitment, owner: owner, token: this.decodeAddress(map["token"]), amount: BigInt((0, stellar_sdk_1.scValToNative)(map["amount"])) });
    };
    SorobanEventParser.prototype.parseEscrowRefunded = function (topics, data, base, indexedOffset) {
        var commitment = this.decodeBytes32Hex(topics[indexedOffset]);
        var owner = this.decodeAddress(topics[indexedOffset + 1]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "EscrowRefunded" }, base), { commitment: commitment, owner: owner, token: this.decodeAddress(map["token"]), amount: BigInt((0, stellar_sdk_1.scValToNative)(map["amount"])) });
    };
    // ---------------------------------------------------------------------------
    // Admin / Privacy event parsers
    // ---------------------------------------------------------------------------
    SorobanEventParser.prototype.parsePrivacyToggled = function (topics, data, base, indexedOffset) {
        var owner = this.decodeAddress(topics[indexedOffset]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "PrivacyToggled" }, base), { owner: owner, enabled: Boolean((0, stellar_sdk_1.scValToNative)(map["enabled"])) });
    };
    SorobanEventParser.prototype.parseContractPaused = function (topics, data, base, indexedOffset) {
        var admin = this.decodeAddress(topics[indexedOffset]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "ContractPaused" }, base), { admin: admin, paused: Boolean((0, stellar_sdk_1.scValToNative)(map["paused"])) });
    };
    SorobanEventParser.prototype.parseAdminChanged = function (topics, data, base, indexedOffset) {
        var oldAdmin = this.decodeAddress(topics[indexedOffset]);
        var newAdmin = this.decodeAddress(topics[indexedOffset + 1]);
        return __assign(__assign({ eventType: "AdminChanged" }, base), { oldAdmin: oldAdmin, newAdmin: newAdmin });
    };
    SorobanEventParser.prototype.parseContractUpgraded = function (topics, data, base, indexedOffset) {
        var newWasmHash = this.decodeBytes32Hex(topics[indexedOffset]);
        var admin = this.decodeAddress(topics[indexedOffset + 1]);
        return __assign(__assign({ eventType: "ContractUpgraded" }, base), { newWasmHash: newWasmHash, admin: admin });
    };
    // ---------------------------------------------------------------------------
    // Stealth address event parsers (Privacy v2 – Issue #157)
    // ---------------------------------------------------------------------------
    SorobanEventParser.prototype.parseEphemeralKeyRegistered = function (topics, data, base, indexedOffset) {
        var _a;
        var stealthAddress = this.decodeBytes32Hex(topics[indexedOffset]);
        var ephPub = this.decodeBytes32Hex(topics[indexedOffset + 1]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "EphemeralKeyRegistered" }, base), { stealthAddress: stealthAddress, ephPub: ephPub, token: this.decodeAddress(map["token"]), amount: BigInt((0, stellar_sdk_1.scValToNative)((_a = map["amount_due"]) !== null && _a !== void 0 ? _a : map["amount"])), expiresAt: BigInt((0, stellar_sdk_1.scValToNative)(map["expires_at"])) });
    };
    SorobanEventParser.prototype.parseStealthWithdrawn = function (topics, data, base, indexedOffset) {
        var stealthAddress = this.decodeBytes32Hex(topics[indexedOffset]);
        var recipient = this.decodeAddress(topics[indexedOffset + 1]);
        var map = this.dataToMap(data);
        return __assign(__assign({ eventType: "StealthWithdrawn" }, base), { stealthAddress: stealthAddress, recipient: recipient, token: this.decodeAddress(map["token"]), amount: BigInt((0, stellar_sdk_1.scValToNative)(map["amount"])) });
    };
    // ---------------------------------------------------------------------------
    // XDR decode helpers
    // ---------------------------------------------------------------------------
    SorobanEventParser.prototype.decodeSymbol = function (val) {
        try {
            return val.sym().toString();
        }
        catch (_a) {
            return null;
        }
    };
    SorobanEventParser.prototype.resolveTopicLayout = function (topics) {
        var first = this.decodeSymbol(topics[0]);
        if (!first)
            return null;
        var canonicalTopics = new Set(Object.values(event_schema_1.RustAcademy_EVENT_TOPICS));
        if (canonicalTopics.has(first)) {
            var second = topics[1] ? this.decodeSymbol(topics[1]) : null;
            if (!second || !(second in event_schema_1.RustAcademy_EVENT_SCHEMA_CONTRACTS))
                return null;
            var contract = event_schema_1.RustAcademy_EVENT_SCHEMA_CONTRACTS[second];
            if (contract.topic !== first)
                return null;
            return {
                eventName: second,
                topicNamespace: first,
                indexedOffset: 2,
            };
        }
        if (first in event_schema_1.RustAcademy_EVENT_SCHEMA_CONTRACTS) {
            return {
                eventName: first,
                topicNamespace: "LEGACY",
                indexedOffset: 1,
            };
        }
        return null;
    };
    SorobanEventParser.prototype.isCompatibleSchemaVersion = function (eventName, schemaVersion) {
        var contract = event_schema_1.RustAcademy_EVENT_SCHEMA_CONTRACTS[eventName];
        return contract.compatibleVersions.includes(schemaVersion);
    };
    SorobanEventParser.prototype.decodeAddress = function (val) {
        var native = (0, stellar_sdk_1.scValToNative)(val);
        if (typeof native === "string")
            return native;
        // It may already be an Address object
        return stellar_sdk_1.Address.fromScVal(val).toString();
    };
    SorobanEventParser.prototype.decodeBytes32Hex = function (val) {
        var bytes = (0, stellar_sdk_1.scValToNative)(val);
        return bytes.toString("hex");
    };
    /**
     * Converts a Soroban map ScVal into a plain JS Record keyed by field name.
     */
    SorobanEventParser.prototype.dataToMap = function (data) {
        var result = {};
        var mapEntries = data.map();
        for (var _i = 0, mapEntries_1 = mapEntries; _i < mapEntries_1.length; _i++) {
            var entry = mapEntries_1[_i];
            var key = entry.key().sym().toString();
            result[key] = entry.val();
        }
        return result;
    };
    SorobanEventParser.prototype.extractSchemaVersionFromData = function (data) {
        try {
            var map = this.dataToMap(data);
            if (map["schema_version"]) {
                return Number((0, stellar_sdk_1.scValToNative)(map["schema_version"]));
            }
        }
        catch (_a) {
            // Legacy events did not include schema_version.
        }
        return 1;
    };
    SorobanEventParser.prototype.extractTimestampFromData = function (data) {
        try {
            var map = this.dataToMap(data);
            if (map["timestamp"]) {
                return BigInt((0, stellar_sdk_1.scValToNative)(map["timestamp"]));
            }
        }
        catch (_a) {
            // ignore
        }
        return 0n;
    };
    SorobanEventParser.prototype.extractLedgerSequenceFromData = function (data) {
        try {
            var map = this.dataToMap(data);
            if (map["ledger_sequence"]) {
                return Number((0, stellar_sdk_1.scValToNative)(map["ledger_sequence"]));
            }
        }
        catch (_a) {
            // Optional field — absent in legacy v1 events
        }
        return undefined;
    };
    return SorobanEventParser;
}());
exports.SorobanEventParser = SorobanEventParser;
