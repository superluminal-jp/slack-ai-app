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
exports.AgentRegistryTable = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const constructs_1 = require("constructs");
/**
 * DynamoDB table for the agent registry.
 *
 * Each execution agent's deploy script writes its own entry via PutItem.
 * The verification agent reads all entries at startup via a single Query on PK=env.
 *
 * Partition key: env ("dev" or "prod")
 * Sort key: agent_id ("time", "docs", "fetch-url", "file-creator", "slack-search")
 */
class AgentRegistryTable extends constructs_1.Construct {
    table;
    constructor(scope, id) {
        super(scope, id);
        const stackName = cdk.Stack.of(this).stackName;
        this.table = new dynamodb.Table(this, "AgentRegistryTable", {
            tableName: `${stackName}-agent-registry`,
            partitionKey: {
                name: "env",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: "agent_id",
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
    }
}
exports.AgentRegistryTable = AgentRegistryTable;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnQtcmVnaXN0cnktdGFibGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhZ2VudC1yZWdpc3RyeS10YWJsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsbUVBQXFEO0FBQ3JELDJDQUF1QztBQUV2Qzs7Ozs7Ozs7R0FRRztBQUNILE1BQWEsa0JBQW1CLFNBQVEsc0JBQVM7SUFDL0IsS0FBSyxDQUFpQjtJQUV0QyxZQUFZLEtBQWdCLEVBQUUsRUFBVTtRQUN0QyxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sU0FBUyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLFNBQVMsQ0FBQztRQUMvQyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDMUQsU0FBUyxFQUFFLEdBQUcsU0FBUyxpQkFBaUI7WUFDeEMsWUFBWSxFQUFFO2dCQUNaLElBQUksRUFBRSxLQUFLO2dCQUNYLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxPQUFPLEVBQUU7Z0JBQ1AsSUFBSSxFQUFFLFVBQVU7Z0JBQ2hCLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU07YUFDcEM7WUFDRCxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7WUFDaEQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0QkQsZ0RBc0JDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcblxuLyoqXG4gKiBEeW5hbW9EQiB0YWJsZSBmb3IgdGhlIGFnZW50IHJlZ2lzdHJ5LlxuICpcbiAqIEVhY2ggZXhlY3V0aW9uIGFnZW50J3MgZGVwbG95IHNjcmlwdCB3cml0ZXMgaXRzIG93biBlbnRyeSB2aWEgUHV0SXRlbS5cbiAqIFRoZSB2ZXJpZmljYXRpb24gYWdlbnQgcmVhZHMgYWxsIGVudHJpZXMgYXQgc3RhcnR1cCB2aWEgYSBzaW5nbGUgUXVlcnkgb24gUEs9ZW52LlxuICpcbiAqIFBhcnRpdGlvbiBrZXk6IGVudiAoXCJkZXZcIiBvciBcInByb2RcIilcbiAqIFNvcnQga2V5OiBhZ2VudF9pZCAoXCJ0aW1lXCIsIFwiZG9jc1wiLCBcImZldGNoLXVybFwiLCBcImZpbGUtY3JlYXRvclwiLCBcInNsYWNrLXNlYXJjaFwiKVxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRSZWdpc3RyeVRhYmxlIGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IHRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrTmFtZSA9IGNkay5TdGFjay5vZih0aGlzKS5zdGFja05hbWU7XG4gICAgdGhpcy50YWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkFnZW50UmVnaXN0cnlUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IGAke3N0YWNrTmFtZX0tYWdlbnQtcmVnaXN0cnlgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6IFwiZW52XCIsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogXCJhZ2VudF9pZFwiLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgZW5jcnlwdGlvbjogZHluYW1vZGIuVGFibGVFbmNyeXB0aW9uLkFXU19NQU5BR0VELFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcbiAgfVxufVxuIl19