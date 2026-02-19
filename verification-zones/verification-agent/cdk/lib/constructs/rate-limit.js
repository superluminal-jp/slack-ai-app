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
exports.RateLimit = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const constructs_1 = require("constructs");
/**
 * Rate limiting DynamoDB table construct.
 *
 * Purpose: Store rate-limit state (partition key rate_limit_key) with TTL for automatic cleanup.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with TTL; encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
class RateLimit extends constructs_1.Construct {
    table;
    constructor(scope, id, props) {
        super(scope, id);
        // Create DynamoDB table for rate limiting
        // TTL is used to automatically clean up expired rate limit entries
        const stackName = cdk.Stack.of(this).stackName;
        this.table = new dynamodb.Table(this, "RateLimitTable", {
            tableName: `${stackName}-rate-limit`,
            partitionKey: {
                name: "rate_limit_key",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
            timeToLiveAttribute: "ttl", // Enable TTL for automatic cleanup
        });
    }
}
exports.RateLimit = RateLimit;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF0ZS1saW1pdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInJhdGUtbGltaXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLG1FQUFxRDtBQUNyRCwyQ0FBdUM7QUFFdkM7Ozs7Ozs7Ozs7R0FVRztBQUNILE1BQWEsU0FBVSxTQUFRLHNCQUFTO0lBQ3RCLEtBQUssQ0FBaUI7SUFFdEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLDBDQUEwQztRQUMxQyxtRUFBbUU7UUFDbkUsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQy9DLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUN0RCxTQUFTLEVBQUUsR0FBRyxTQUFTLGFBQWE7WUFDcEMsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxnQkFBZ0I7Z0JBQ3RCLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7WUFDaEQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTyxFQUFFLGtDQUFrQztZQUM1RSxtQkFBbUIsRUFBRSxLQUFLLEVBQUUsbUNBQW1DO1NBQ2hFLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXJCRCw4QkFxQkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiXCI7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tIFwiY29uc3RydWN0c1wiO1xuXG4vKipcbiAqIFJhdGUgbGltaXRpbmcgRHluYW1vREIgdGFibGUgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IFN0b3JlIHJhdGUtbGltaXQgc3RhdGUgKHBhcnRpdGlvbiBrZXkgcmF0ZV9saW1pdF9rZXkpIHdpdGggVFRMIGZvciBhdXRvbWF0aWMgY2xlYW51cC5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBDcmVhdGUgcGF5LXBlci1yZXF1ZXN0IER5bmFtb0RCIHRhYmxlIHdpdGggVFRMOyBlbmNyeXB0aW9uOyBkZXN0cm95IG9uIHN0YWNrIHJlbW92YWwuXG4gKlxuICogSW5wdXRzOiBOb25lIChvcHRpb25hbCBOZXN0ZWRTdGFja1Byb3BzKS5cbiAqXG4gKiBPdXRwdXRzOiB0YWJsZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJhdGVMaW1pdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB0YWJsZTogZHluYW1vZGIuVGFibGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuTmVzdGVkU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgRHluYW1vREIgdGFibGUgZm9yIHJhdGUgbGltaXRpbmdcbiAgICAvLyBUVEwgaXMgdXNlZCB0byBhdXRvbWF0aWNhbGx5IGNsZWFuIHVwIGV4cGlyZWQgcmF0ZSBsaW1pdCBlbnRyaWVzXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcbiAgICB0aGlzLnRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiUmF0ZUxpbWl0VGFibGVcIiwge1xuICAgICAgdGFibGVOYW1lOiBgJHtzdGFja05hbWV9LXJhdGUtbGltaXRgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6IFwicmF0ZV9saW1pdF9rZXlcIixcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksIC8vIERlc3Ryb3kgdGFibGUgb24gc3RhY2sgZGVsZXRpb25cbiAgICAgIHRpbWVUb0xpdmVBdHRyaWJ1dGU6IFwidHRsXCIsIC8vIEVuYWJsZSBUVEwgZm9yIGF1dG9tYXRpYyBjbGVhbnVwXG4gICAgfSk7XG4gIH1cbn1cblxuIl19