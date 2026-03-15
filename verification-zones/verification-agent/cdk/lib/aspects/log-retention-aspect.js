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
exports.LogRetentionAspect = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
/**
 * Aspect that validates Log Groups have explicit retention set.
 *
 * Purpose: Encourages log lifecycle management by surfacing a synthesis-time warning
 * when a CloudFormation Log Group does not set retentionInDays (default is "never expire").
 * Use Annotations so operators see the warning in `cdk synth` output and can fix the construct.
 *
 * Apply to the app or a stack: Aspects.of(app).add(new LogRetentionAspect())
 * For stricter policy, switch addWarning to addError to block synthesis until retention is set.
 */
class LogRetentionAspect {
    visit(node) {
        if (node instanceof logs.CfnLogGroup) {
            if (node.retentionInDays === undefined) {
                aws_cdk_lib_1.Annotations.of(node).addWarning("Log group has no retention set; logs will be retained indefinitely. " +
                    "Set retentionInDays (e.g. via LogGroupProps.retention) for lifecycle management.");
            }
        }
    }
}
exports.LogRetentionAspect = LogRetentionAspect;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9nLXJldGVudGlvbi1hc3BlY3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJsb2ctcmV0ZW50aW9uLWFzcGVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFDQSw2Q0FBbUQ7QUFDbkQsMkRBQTZDO0FBRTdDOzs7Ozs7Ozs7R0FTRztBQUNILE1BQWEsa0JBQWtCO0lBQzdCLEtBQUssQ0FBQyxJQUFnQjtRQUNwQixJQUFJLElBQUksWUFBWSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDckMsSUFBSSxJQUFJLENBQUMsZUFBZSxLQUFLLFNBQVMsRUFBRSxDQUFDO2dCQUN2Qyx5QkFBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxVQUFVLENBQzdCLHNFQUFzRTtvQkFDcEUsa0ZBQWtGLENBQ3JGLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQztJQUNILENBQUM7Q0FDRjtBQVhELGdEQVdDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSUNvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgeyBJQXNwZWN0LCBBbm5vdGF0aW9ucyB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxvZ3NcIjtcblxuLyoqXG4gKiBBc3BlY3QgdGhhdCB2YWxpZGF0ZXMgTG9nIEdyb3VwcyBoYXZlIGV4cGxpY2l0IHJldGVudGlvbiBzZXQuXG4gKlxuICogUHVycG9zZTogRW5jb3VyYWdlcyBsb2cgbGlmZWN5Y2xlIG1hbmFnZW1lbnQgYnkgc3VyZmFjaW5nIGEgc3ludGhlc2lzLXRpbWUgd2FybmluZ1xuICogd2hlbiBhIENsb3VkRm9ybWF0aW9uIExvZyBHcm91cCBkb2VzIG5vdCBzZXQgcmV0ZW50aW9uSW5EYXlzIChkZWZhdWx0IGlzIFwibmV2ZXIgZXhwaXJlXCIpLlxuICogVXNlIEFubm90YXRpb25zIHNvIG9wZXJhdG9ycyBzZWUgdGhlIHdhcm5pbmcgaW4gYGNkayBzeW50aGAgb3V0cHV0IGFuZCBjYW4gZml4IHRoZSBjb25zdHJ1Y3QuXG4gKlxuICogQXBwbHkgdG8gdGhlIGFwcCBvciBhIHN0YWNrOiBBc3BlY3RzLm9mKGFwcCkuYWRkKG5ldyBMb2dSZXRlbnRpb25Bc3BlY3QoKSlcbiAqIEZvciBzdHJpY3RlciBwb2xpY3ksIHN3aXRjaCBhZGRXYXJuaW5nIHRvIGFkZEVycm9yIHRvIGJsb2NrIHN5bnRoZXNpcyB1bnRpbCByZXRlbnRpb24gaXMgc2V0LlxuICovXG5leHBvcnQgY2xhc3MgTG9nUmV0ZW50aW9uQXNwZWN0IGltcGxlbWVudHMgSUFzcGVjdCB7XG4gIHZpc2l0KG5vZGU6IElDb25zdHJ1Y3QpOiB2b2lkIHtcbiAgICBpZiAobm9kZSBpbnN0YW5jZW9mIGxvZ3MuQ2ZuTG9nR3JvdXApIHtcbiAgICAgIGlmIChub2RlLnJldGVudGlvbkluRGF5cyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIEFubm90YXRpb25zLm9mKG5vZGUpLmFkZFdhcm5pbmcoXG4gICAgICAgICAgXCJMb2cgZ3JvdXAgaGFzIG5vIHJldGVudGlvbiBzZXQ7IGxvZ3Mgd2lsbCBiZSByZXRhaW5lZCBpbmRlZmluaXRlbHkuIFwiICtcbiAgICAgICAgICAgIFwiU2V0IHJldGVudGlvbkluRGF5cyAoZS5nLiB2aWEgTG9nR3JvdXBQcm9wcy5yZXRlbnRpb24pIGZvciBsaWZlY3ljbGUgbWFuYWdlbWVudC5cIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIl19