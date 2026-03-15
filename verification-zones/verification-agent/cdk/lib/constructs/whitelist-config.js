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
exports.WhitelistConfig = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const constructs_1 = require("constructs");
/**
 * Whitelist configuration DynamoDB table construct.
 *
 * Purpose: Store allowed team_id, user_id, and channel_id for access control.
 * Partition key entity_type, sort key entity_id.
 *
 * Responsibilities: Create pay-per-request DynamoDB table with encryption; destroy on stack removal.
 *
 * Inputs: None (optional NestedStackProps).
 *
 * Outputs: table.
 */
class WhitelistConfig extends constructs_1.Construct {
    table;
    constructor(scope, id, props) {
        super(scope, id);
        // Create DynamoDB table for whitelist configuration
        // Stores team_id, user_id, and channel_id entries separately
        // Partition key: entity_type (team_id, user_id, channel_id)
        // Sort key: entity_id (actual ID value)
        const stackName = cdk.Stack.of(this).stackName;
        this.table = new dynamodb.Table(this, "WhitelistConfigTable", {
            tableName: `${stackName}-whitelist-config`,
            partitionKey: {
                name: "entity_type",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "entity_id",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy table on stack deletion
        });
    }
}
exports.WhitelistConfig = WhitelistConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2hpdGVsaXN0LWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIndoaXRlbGlzdC1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLG1FQUFxRDtBQUNyRCwyQ0FBdUM7QUFFdkM7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFhLGVBQWdCLFNBQVEsc0JBQVM7SUFDNUIsS0FBSyxDQUFpQjtJQUV0QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTRCO1FBQ3BFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsb0RBQW9EO1FBQ3BELDZEQUE2RDtRQUM3RCw0REFBNEQ7UUFDNUQsd0NBQXdDO1FBQ3hDLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUMvQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsc0JBQXNCLEVBQUU7WUFDNUQsU0FBUyxFQUFFLEdBQUcsU0FBUyxtQkFBbUI7WUFDMUMsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxhQUFhO2dCQUNuQixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO2FBQ3BDO1lBQ0QsT0FBTyxFQUFFO2dCQUNQLElBQUksRUFBRSxXQUFXO2dCQUNqQixJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNO2FBQ3BDO1lBQ0QsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtZQUNqRCxVQUFVLEVBQUUsUUFBUSxDQUFDLGVBQWUsQ0FBQyxXQUFXO1lBQ2hELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxrQ0FBa0M7U0FDN0UsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBMUJELDBDQTBCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbi8qKlxuICogV2hpdGVsaXN0IGNvbmZpZ3VyYXRpb24gRHluYW1vREIgdGFibGUgY29uc3RydWN0LlxuICpcbiAqIFB1cnBvc2U6IFN0b3JlIGFsbG93ZWQgdGVhbV9pZCwgdXNlcl9pZCwgYW5kIGNoYW5uZWxfaWQgZm9yIGFjY2VzcyBjb250cm9sLlxuICogUGFydGl0aW9uIGtleSBlbnRpdHlfdHlwZSwgc29ydCBrZXkgZW50aXR5X2lkLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IENyZWF0ZSBwYXktcGVyLXJlcXVlc3QgRHluYW1vREIgdGFibGUgd2l0aCBlbmNyeXB0aW9uOyBkZXN0cm95IG9uIHN0YWNrIHJlbW92YWwuXG4gKlxuICogSW5wdXRzOiBOb25lIChvcHRpb25hbCBOZXN0ZWRTdGFja1Byb3BzKS5cbiAqXG4gKiBPdXRwdXRzOiB0YWJsZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFdoaXRlbGlzdENvbmZpZyBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSB0YWJsZTogZHluYW1vZGIuVGFibGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuTmVzdGVkU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBDcmVhdGUgRHluYW1vREIgdGFibGUgZm9yIHdoaXRlbGlzdCBjb25maWd1cmF0aW9uXG4gICAgLy8gU3RvcmVzIHRlYW1faWQsIHVzZXJfaWQsIGFuZCBjaGFubmVsX2lkIGVudHJpZXMgc2VwYXJhdGVseVxuICAgIC8vIFBhcnRpdGlvbiBrZXk6IGVudGl0eV90eXBlICh0ZWFtX2lkLCB1c2VyX2lkLCBjaGFubmVsX2lkKVxuICAgIC8vIFNvcnQga2V5OiBlbnRpdHlfaWQgKGFjdHVhbCBJRCB2YWx1ZSlcbiAgICBjb25zdCBzdGFja05hbWUgPSBjZGsuU3RhY2sub2YodGhpcykuc3RhY2tOYW1lO1xuICAgIHRoaXMudGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJXaGl0ZWxpc3RDb25maWdUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IGAke3N0YWNrTmFtZX0td2hpdGVsaXN0LWNvbmZpZ2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogXCJlbnRpdHlfdHlwZVwiLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6IFwiZW50aXR5X2lkXCIsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICBlbmNyeXB0aW9uOiBkeW5hbW9kYi5UYWJsZUVuY3J5cHRpb24uQVdTX01BTkFHRUQsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLCAvLyBEZXN0cm95IHRhYmxlIG9uIHN0YWNrIGRlbGV0aW9uXG4gICAgfSk7XG4gIH1cbn1cblxuIl19