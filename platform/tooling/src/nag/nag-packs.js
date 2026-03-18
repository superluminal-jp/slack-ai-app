"use strict";
/**
 * CDK NAG security pack utilities.
 *
 * Centralizes cdk-nag application so all zones call a single function
 * instead of duplicating the import and Aspects pattern across 6 bin/cdk.ts files.
 *
 * @module cdk/tooling/nag/nag-packs
 */
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NagSuppressions = void 0;
exports.applyNagPacks = applyNagPacks;
const cdk = __importStar(require("aws-cdk-lib"));
const cdk_nag_1 = require("cdk-nag");
Object.defineProperty(exports, "NagSuppressions", { enumerable: true, get: function () { return cdk_nag_1.NagSuppressions; } });
/**
 * Apply the AWS Solutions NagPack to the CDK app.
 * Call this AFTER stack creation and BEFORE app.synth().
 * Causes cdk synth to exit non-zero on any unresolved violation.
 *
 * @param app - The CDK App instance
 */
function applyNagPacks(app) {
    cdk.Aspects.of(app).add(new cdk_nag_1.AwsSolutionsChecks({ verbose: true }));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFnLXBhY2tzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsibmFnLXBhY2tzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7OztHQU9HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFjSCxzQ0FFQztBQWRELGlEQUFtQztBQUNuQyxxQ0FBOEQ7QUFFckQsZ0dBRm9CLHlCQUFlLE9BRXBCO0FBRXhCOzs7Ozs7R0FNRztBQUNILFNBQWdCLGFBQWEsQ0FBQyxHQUFZO0lBQ3hDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxJQUFJLDRCQUFrQixDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztBQUNyRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDREsgTkFHIHNlY3VyaXR5IHBhY2sgdXRpbGl0aWVzLlxuICpcbiAqIENlbnRyYWxpemVzIGNkay1uYWcgYXBwbGljYXRpb24gc28gYWxsIHpvbmVzIGNhbGwgYSBzaW5nbGUgZnVuY3Rpb25cbiAqIGluc3RlYWQgb2YgZHVwbGljYXRpbmcgdGhlIGltcG9ydCBhbmQgQXNwZWN0cyBwYXR0ZXJuIGFjcm9zcyA2IGJpbi9jZGsudHMgZmlsZXMuXG4gKlxuICogQG1vZHVsZSBjZGsvdG9vbGluZy9uYWcvbmFnLXBhY2tzXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgQXdzU29sdXRpb25zQ2hlY2tzLCBOYWdTdXBwcmVzc2lvbnMgfSBmcm9tIFwiY2RrLW5hZ1wiO1xuXG5leHBvcnQgeyBOYWdTdXBwcmVzc2lvbnMgfTtcblxuLyoqXG4gKiBBcHBseSB0aGUgQVdTIFNvbHV0aW9ucyBOYWdQYWNrIHRvIHRoZSBDREsgYXBwLlxuICogQ2FsbCB0aGlzIEFGVEVSIHN0YWNrIGNyZWF0aW9uIGFuZCBCRUZPUkUgYXBwLnN5bnRoKCkuXG4gKiBDYXVzZXMgY2RrIHN5bnRoIHRvIGV4aXQgbm9uLXplcm8gb24gYW55IHVucmVzb2x2ZWQgdmlvbGF0aW9uLlxuICpcbiAqIEBwYXJhbSBhcHAgLSBUaGUgQ0RLIEFwcCBpbnN0YW5jZVxuICovXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlOYWdQYWNrcyhhcHA6IGNkay5BcHApOiB2b2lkIHtcbiAgY2RrLkFzcGVjdHMub2YoYXBwKS5hZGQobmV3IEF3c1NvbHV0aW9uc0NoZWNrcyh7IHZlcmJvc2U6IHRydWUgfSkpO1xufVxuIl19