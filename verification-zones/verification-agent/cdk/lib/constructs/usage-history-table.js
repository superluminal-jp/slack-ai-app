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
exports.UsageHistoryTable = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const constructs_1 = require("constructs");
/**
 * Usage history DynamoDB table construct.
 *
 * Purpose: Store metadata and indexes for every Verification Agent request.
 * Input/output text stored in S3 (confidentiality separation); this table holds
 * metadata, pipeline results, and the s3_content_prefix pointer only.
 *
 * Responsibilities: PK=channel_id/SK=request_id table with TTL, GSI for
 * correlation_id lookup, PAY_PER_REQUEST, AWS_MANAGED encryption.
 *
 * Outputs: table.
 */
class UsageHistoryTable extends constructs_1.Construct {
    table;
    constructor(scope, id) {
        super(scope, id);
        const stackName = cdk.Stack.of(this).stackName;
        this.table = new dynamodb.Table(this, "Table", {
            tableName: `${stackName}-usage-history`,
            partitionKey: { name: "channel_id", type: dynamodb.AttributeType.STRING },
            sortKey: { name: "request_id", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: "ttl",
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
        });
        this.table.addGlobalSecondaryIndex({
            indexName: "correlation_id-index",
            partitionKey: {
                name: "correlation_id",
                type: dynamodb.AttributeType.STRING,
            },
            projectionType: dynamodb.ProjectionType.ALL,
        });
    }
}
exports.UsageHistoryTable = UsageHistoryTable;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS10YWJsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktdGFibGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLG1FQUFxRDtBQUNyRCwyQ0FBdUM7QUFFdkM7Ozs7Ozs7Ozs7O0dBV0c7QUFDSCxNQUFhLGlCQUFrQixTQUFRLHNCQUFTO0lBQzlCLEtBQUssQ0FBaUI7SUFFdEMsWUFBWSxLQUFnQixFQUFFLEVBQVU7UUFDdEMsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVqQixNQUFNLFNBQVMsR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFFL0MsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRTtZQUM3QyxTQUFTLEVBQUUsR0FBRyxTQUFTLGdCQUFnQjtZQUN2QyxZQUFZLEVBQUUsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUN6RSxPQUFPLEVBQUUsRUFBRSxJQUFJLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRTtZQUNwRSxXQUFXLEVBQUUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxlQUFlO1lBQ2pELFVBQVUsRUFBRSxRQUFRLENBQUMsZUFBZSxDQUFDLFdBQVc7WUFDaEQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxtQkFBbUIsRUFBRSxLQUFLO1lBQzFCLGdDQUFnQyxFQUFFLEVBQUUsMEJBQTBCLEVBQUUsSUFBSSxFQUFFO1NBQ3ZFLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUM7WUFDakMsU0FBUyxFQUFFLHNCQUFzQjtZQUNqQyxZQUFZLEVBQUU7Z0JBQ1osSUFBSSxFQUFFLGdCQUFnQjtnQkFDdEIsSUFBSSxFQUFFLFFBQVEsQ0FBQyxhQUFhLENBQUMsTUFBTTthQUNwQztZQUNELGNBQWMsRUFBRSxRQUFRLENBQUMsY0FBYyxDQUFDLEdBQUc7U0FDNUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNUJELDhDQTRCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5cbi8qKlxuICogVXNhZ2UgaGlzdG9yeSBEeW5hbW9EQiB0YWJsZSBjb25zdHJ1Y3QuXG4gKlxuICogUHVycG9zZTogU3RvcmUgbWV0YWRhdGEgYW5kIGluZGV4ZXMgZm9yIGV2ZXJ5IFZlcmlmaWNhdGlvbiBBZ2VudCByZXF1ZXN0LlxuICogSW5wdXQvb3V0cHV0IHRleHQgc3RvcmVkIGluIFMzIChjb25maWRlbnRpYWxpdHkgc2VwYXJhdGlvbik7IHRoaXMgdGFibGUgaG9sZHNcbiAqIG1ldGFkYXRhLCBwaXBlbGluZSByZXN1bHRzLCBhbmQgdGhlIHMzX2NvbnRlbnRfcHJlZml4IHBvaW50ZXIgb25seS5cbiAqXG4gKiBSZXNwb25zaWJpbGl0aWVzOiBQSz1jaGFubmVsX2lkL1NLPXJlcXVlc3RfaWQgdGFibGUgd2l0aCBUVEwsIEdTSSBmb3JcbiAqIGNvcnJlbGF0aW9uX2lkIGxvb2t1cCwgUEFZX1BFUl9SRVFVRVNULCBBV1NfTUFOQUdFRCBlbmNyeXB0aW9uLlxuICpcbiAqIE91dHB1dHM6IHRhYmxlLlxuICovXG5leHBvcnQgY2xhc3MgVXNhZ2VIaXN0b3J5VGFibGUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgdGFibGU6IGR5bmFtb2RiLlRhYmxlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgY29uc3Qgc3RhY2tOYW1lID0gY2RrLlN0YWNrLm9mKHRoaXMpLnN0YWNrTmFtZTtcblxuICAgIHRoaXMudGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJUYWJsZVwiLCB7XG4gICAgICB0YWJsZU5hbWU6IGAke3N0YWNrTmFtZX0tdXNhZ2UtaGlzdG9yeWAsXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJjaGFubmVsX2lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXG4gICAgICBzb3J0S2V5OiB7IG5hbWU6IFwicmVxdWVzdF9pZFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIGVuY3J5cHRpb246IGR5bmFtb2RiLlRhYmxlRW5jcnlwdGlvbi5BV1NfTUFOQUdFRCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICB0aW1lVG9MaXZlQXR0cmlidXRlOiBcInR0bFwiLFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHsgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUgfSxcbiAgICB9KTtcblxuICAgIHRoaXMudGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xuICAgICAgaW5kZXhOYW1lOiBcImNvcnJlbGF0aW9uX2lkLWluZGV4XCIsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogXCJjb3JyZWxhdGlvbl9pZFwiLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBwcm9qZWN0aW9uVHlwZTogZHluYW1vZGIuUHJvamVjdGlvblR5cGUuQUxMLFxuICAgIH0pO1xuICB9XG59XG4iXX0=