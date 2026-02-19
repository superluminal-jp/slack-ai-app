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
exports.ExistenceCheckCache = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const constructs_1 = require("constructs");
/**
 * Existence check cache DynamoDB table construct.
 *
 * Purpose: Cache Slack team/user/channel existence check results to reduce Slack API calls.
 * TTL (e.g. 5 minutes) for automatic expiration.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with TTL; encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
class ExistenceCheckCache extends constructs_1.Construct {
    table;
    constructor(scope, id, props) {
        super(scope, id);
        // Create DynamoDB table for Existence Check cache
        // Cache stores verification results for team/user/channel combinations
        // TTL: 5 minutes (300 seconds) to reduce Slack API calls
        const stackName = cdk.Stack.of(this).stackName;
        this.table = new dynamodb.Table(this, "ExistenceCheckCacheTable", {
            tableName: `${stackName}-existence-check-cache`,
            partitionKey: {
                name: "cache_key",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
            timeToLiveAttribute: "ttl", // TTL attribute for automatic expiration
        });
    }
}
exports.ExistenceCheckCache = ExistenceCheckCache;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhpc3RlbmNlLWNoZWNrLWNhY2hlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZXhpc3RlbmNlLWNoZWNrLWNhY2hlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxtRUFBcUQ7QUFDckQsMkNBQXVDO0FBRXZDOzs7Ozs7Ozs7OztHQVdHO0FBQ0gsTUFBYSxtQkFBb0IsU0FBUSxzQkFBUztJQUNoQyxLQUFLLENBQWlCO0lBRXRDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBNEI7UUFDcEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixrREFBa0Q7UUFDbEQsdUVBQXVFO1FBQ3ZFLHlEQUF5RDtRQUN6RCxNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDL0MsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ2hFLFNBQVMsRUFBRSxHQUFHLFNBQVMsd0JBQXdCO1lBQy9DLFlBQVksRUFBRTtnQkFDWixJQUFJLEVBQUUsV0FBVztnQkFDakIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELFdBQVcsRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDLGVBQWU7WUFDakQsVUFBVSxFQUFFLFFBQVEsQ0FBQyxlQUFlLENBQUMsV0FBVztZQUNoRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsa0NBQWtDO1lBQzVFLG1CQUFtQixFQUFFLEtBQUssRUFBRSx5Q0FBeUM7U0FDdEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdEJELGtEQXNCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbi8qKlxuICogRXhpc3RlbmNlIGNoZWNrIGNhY2hlIER5bmFtb0RCIHRhYmxlIGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBDYWNoZSBTbGFjayB0ZWFtL3VzZXIvY2hhbm5lbCBleGlzdGVuY2UgY2hlY2sgcmVzdWx0cyB0byByZWR1Y2UgU2xhY2sgQVBJIGNhbGxzLlxuICogVFRMIChlLmcuIDUgbWludXRlcykgZm9yIGF1dG9tYXRpYyBleHBpcmF0aW9uLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IENyZWF0ZSBwYXktcGVyLXJlcXVlc3QgRHluYW1vREIgdGFibGUgd2l0aCBUVEw7IGVuY3J5cHRpb247IGRlc3Ryb3kgb24gc3RhY2sgcmVtb3ZhbC5cbiAqXG4gKiBJbnB1dHM6IE5vbmUgKG9wdGlvbmFsIE5lc3RlZFN0YWNrUHJvcHMpLlxuICpcbiAqIE91dHB1dHM6IHRhYmxlLlxuICovXG5leHBvcnQgY2xhc3MgRXhpc3RlbmNlQ2hlY2tDYWNoZSBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB0YWJsZTogZHluYW1vZGIuVGFibGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuTmVzdGVkU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgRHluYW1vREIgdGFibGUgZm9yIEV4aXN0ZW5jZSBDaGVjayBjYWNoZVxuICAgIC8vIENhY2hlIHN0b3JlcyB2ZXJpZmljYXRpb24gcmVzdWx0cyBmb3IgdGVhbS91c2VyL2NoYW5uZWwgY29tYmluYXRpb25zXG4gICAgLy8gVFRMOiA1IG1pbnV0ZXMgKDMwMCBzZWNvbmRzKSB0byByZWR1Y2UgU2xhY2sgQVBJIGNhbGxzXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcbiAgICB0aGlzLnRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsIFwiRXhpc3RlbmNlQ2hlY2tDYWNoZVRhYmxlXCIsIHtcbiAgICAgIHRhYmxlTmFtZTogYCR7c3RhY2tOYW1lfS1leGlzdGVuY2UtY2hlY2stY2FjaGVgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6IFwiY2FjaGVfa2V5XCIsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBEZXN0cm95IHRhYmxlIG9uIHN0YWNrIGRlbGV0aW9uXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiBcInR0bFwiLCAvLyBUVEwgYXR0cmlidXRlIGZvciBhdXRvbWF0aWMgZXhwaXJhdGlvblxuICAgIH0pO1xuICB9XG59XG5cbiJdfQ==