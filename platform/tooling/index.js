"use strict";
/**
 * @slack-ai-app/cdk-tooling
 *
 * Shared CDK utilities for all slack-ai-app zones.
 * Import from this package instead of local copies.
 *
 * @example
 * import { logInfo, CdkError, applyCostAllocationTags, LogRetentionAspect } from "@slack-ai-app/cdk-tooling";
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./src/utils/cdk-logger"), exports);
__exportStar(require("./src/utils/cdk-error"), exports);
__exportStar(require("./src/utils/cost-allocation-tags"), exports);
__exportStar(require("./src/utils/config-loader"), exports);
__exportStar(require("./src/aspects/log-retention-aspect"), exports);
__exportStar(require("./src/nag/nag-packs"), exports);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7Ozs7O0dBUUc7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCx5REFBdUM7QUFDdkMsd0RBQXNDO0FBQ3RDLG1FQUFpRDtBQUNqRCw0REFBMEM7QUFDMUMscUVBQW1EO0FBQ25ELHNEQUFvQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1xuICpcbiAqIFNoYXJlZCBDREsgdXRpbGl0aWVzIGZvciBhbGwgc2xhY2stYWktYXBwIHpvbmVzLlxuICogSW1wb3J0IGZyb20gdGhpcyBwYWNrYWdlIGluc3RlYWQgb2YgbG9jYWwgY29waWVzLlxuICpcbiAqIEBleGFtcGxlXG4gKiBpbXBvcnQgeyBsb2dJbmZvLCBDZGtFcnJvciwgYXBwbHlDb3N0QWxsb2NhdGlvblRhZ3MsIExvZ1JldGVudGlvbkFzcGVjdCB9IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG4gKi9cblxuZXhwb3J0ICogZnJvbSBcIi4vc3JjL3V0aWxzL2Nkay1sb2dnZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3NyYy91dGlscy9jZGstZXJyb3JcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3NyYy91dGlscy9jb3N0LWFsbG9jYXRpb24tdGFnc1wiO1xuZXhwb3J0ICogZnJvbSBcIi4vc3JjL3V0aWxzL2NvbmZpZy1sb2FkZXJcIjtcbmV4cG9ydCAqIGZyb20gXCIuL3NyYy9hc3BlY3RzL2xvZy1yZXRlbnRpb24tYXNwZWN0XCI7XG5leHBvcnQgKiBmcm9tIFwiLi9zcmMvbmFnL25hZy1wYWNrc1wiO1xuIl19