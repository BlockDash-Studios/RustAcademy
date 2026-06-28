"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AntiCheatController = exports.AntiCheatService = exports.SecurityModule = void 0;
var security_module_1 = require("./security.module");
Object.defineProperty(exports, "SecurityModule", { enumerable: true, get: function () { return security_module_1.SecurityModule; } });
var anti_cheat_service_1 = require("./anti-cheat.service");
Object.defineProperty(exports, "AntiCheatService", { enumerable: true, get: function () { return anti_cheat_service_1.AntiCheatService; } });
var anti_cheat_controller_1 = require("./anti-cheat.controller");
Object.defineProperty(exports, "AntiCheatController", { enumerable: true, get: function () { return anti_cheat_controller_1.AntiCheatController; } });
__exportStar(require("./interfaces/anti-cheat.interface"), exports);
__exportStar(require("./dto/check-submission.dto"), exports);
//# sourceMappingURL=index.js.map