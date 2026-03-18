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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const usage_history_table_1 = require("../lib/constructs/usage-history-table");
describe("UsageHistoryTable", () => {
    let template;
    beforeAll(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, "TestStack");
        new usage_history_table_1.UsageHistoryTable(stack, "UsageHistoryTable");
        template = assertions_1.Template.fromStack(stack);
    });
    it("should create a DynamoDB table with PK=channel_id and SK=request_id", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            KeySchema: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({ AttributeName: "channel_id", KeyType: "HASH" }),
                assertions_1.Match.objectLike({ AttributeName: "request_id", KeyType: "RANGE" }),
            ]),
        });
    });
    it("should have PAY_PER_REQUEST billing mode", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            BillingMode: "PAY_PER_REQUEST",
        });
    });
    it("should have AWS_MANAGED encryption (SSE enabled)", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            SSESpecification: { SSEEnabled: true },
        });
    });
    it("should have TTL attribute named ttl with TTL enabled", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            TimeToLiveSpecification: {
                AttributeName: "ttl",
                Enabled: true,
            },
        });
    });
    it("should have GSI named correlation_id-index with PK=correlation_id and projection ALL", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            GlobalSecondaryIndexes: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    IndexName: "correlation_id-index",
                    KeySchema: assertions_1.Match.arrayWith([
                        assertions_1.Match.objectLike({
                            AttributeName: "correlation_id",
                            KeyType: "HASH",
                        }),
                    ]),
                    Projection: { ProjectionType: "ALL" },
                }),
            ]),
        });
    });
    it("should have table name matching {stackName}-usage-history", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            TableName: "TestStack-usage-history",
        });
    });
    it("should have DeletionPolicy DESTROY", () => {
        const tables = template.findResources("AWS::DynamoDB::Table");
        const table = Object.values(tables)[0];
        expect(table.DeletionPolicy).toBe("Delete");
    });
    it("should have PITR (Point-in-Time Recovery) enabled", () => {
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true,
            },
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS10YWJsZS50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXNhZ2UtaGlzdG9yeS10YWJsZS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCwrRUFBMEU7QUFFMUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtJQUNqQyxJQUFJLFFBQWtCLENBQUM7SUFFdkIsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNiLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDOUMsSUFBSSx1Q0FBaUIsQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUNsRCxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMscUVBQXFFLEVBQUUsR0FBRyxFQUFFO1FBQzdFLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxzQkFBc0IsRUFBRTtZQUNyRCxTQUFTLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7Z0JBQ3pCLGtCQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsTUFBTSxFQUFFLENBQUM7Z0JBQ2xFLGtCQUFLLENBQUMsVUFBVSxDQUFDLEVBQUUsYUFBYSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLENBQUM7YUFDcEUsQ0FBQztTQUNILENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLEdBQUcsRUFBRTtRQUNsRCxRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7WUFDckQsV0FBVyxFQUFFLGlCQUFpQjtTQUMvQixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxrREFBa0QsRUFBRSxHQUFHLEVBQUU7UUFDMUQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHNCQUFzQixFQUFFO1lBQ3JELGdCQUFnQixFQUFFLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRTtTQUN2QyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxzREFBc0QsRUFBRSxHQUFHLEVBQUU7UUFDOUQsUUFBUSxDQUFDLHFCQUFxQixDQUFDLHNCQUFzQixFQUFFO1lBQ3JELHVCQUF1QixFQUFFO2dCQUN2QixhQUFhLEVBQUUsS0FBSztnQkFDcEIsT0FBTyxFQUFFLElBQUk7YUFDZDtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHNGQUFzRixFQUFFLEdBQUcsRUFBRTtRQUM5RixRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7WUFDckQsc0JBQXNCLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7Z0JBQ3RDLGtCQUFLLENBQUMsVUFBVSxDQUFDO29CQUNmLFNBQVMsRUFBRSxzQkFBc0I7b0JBQ2pDLFNBQVMsRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQzt3QkFDekIsa0JBQUssQ0FBQyxVQUFVLENBQUM7NEJBQ2YsYUFBYSxFQUFFLGdCQUFnQjs0QkFDL0IsT0FBTyxFQUFFLE1BQU07eUJBQ2hCLENBQUM7cUJBQ0gsQ0FBQztvQkFDRixVQUFVLEVBQUUsRUFBRSxjQUFjLEVBQUUsS0FBSyxFQUFFO2lCQUN0QyxDQUFDO2FBQ0gsQ0FBQztTQUNILENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDJEQUEyRCxFQUFFLEdBQUcsRUFBRTtRQUNuRSxRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7WUFDckQsU0FBUyxFQUFFLHlCQUF5QjtTQUNyQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDNUMsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQzlELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFnQyxDQUFDO1FBQ3RFLE1BQU0sQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzlDLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLG1EQUFtRCxFQUFFLEdBQUcsRUFBRTtRQUMzRCxRQUFRLENBQUMscUJBQXFCLENBQUMsc0JBQXNCLEVBQUU7WUFDckQsZ0NBQWdDLEVBQUU7Z0JBQ2hDLDBCQUEwQixFQUFFLElBQUk7YUFDakM7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSBcImF3cy1jZGstbGliL2Fzc2VydGlvbnNcIjtcbmltcG9ydCB7IFVzYWdlSGlzdG9yeVRhYmxlIH0gZnJvbSBcIi4uL2xpYi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktdGFibGVcIjtcblxuZGVzY3JpYmUoXCJVc2FnZUhpc3RvcnlUYWJsZVwiLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlQWxsKCgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIGNvbnN0IHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsIFwiVGVzdFN0YWNrXCIpO1xuICAgIG5ldyBVc2FnZUhpc3RvcnlUYWJsZShzdGFjaywgXCJVc2FnZUhpc3RvcnlUYWJsZVwiKTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGNyZWF0ZSBhIER5bmFtb0RCIHRhYmxlIHdpdGggUEs9Y2hhbm5lbF9pZCBhbmQgU0s9cmVxdWVzdF9pZFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgS2V5U2NoZW1hOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHsgQXR0cmlidXRlTmFtZTogXCJjaGFubmVsX2lkXCIsIEtleVR5cGU6IFwiSEFTSFwiIH0pLFxuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHsgQXR0cmlidXRlTmFtZTogXCJyZXF1ZXN0X2lkXCIsIEtleVR5cGU6IFwiUkFOR0VcIiB9KSxcbiAgICAgIF0pLFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIFBBWV9QRVJfUkVRVUVTVCBiaWxsaW5nIG1vZGVcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgIEJpbGxpbmdNb2RlOiBcIlBBWV9QRVJfUkVRVUVTVFwiLFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIEFXU19NQU5BR0VEIGVuY3J5cHRpb24gKFNTRSBlbmFibGVkKVwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgU1NFU3BlY2lmaWNhdGlvbjogeyBTU0VFbmFibGVkOiB0cnVlIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgVFRMIGF0dHJpYnV0ZSBuYW1lZCB0dGwgd2l0aCBUVEwgZW5hYmxlZFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpEeW5hbW9EQjo6VGFibGVcIiwge1xuICAgICAgVGltZVRvTGl2ZVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgQXR0cmlidXRlTmFtZTogXCJ0dGxcIixcbiAgICAgICAgRW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgR1NJIG5hbWVkIGNvcnJlbGF0aW9uX2lkLWluZGV4IHdpdGggUEs9Y29ycmVsYXRpb25faWQgYW5kIHByb2plY3Rpb24gQUxMXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiLCB7XG4gICAgICBHbG9iYWxTZWNvbmRhcnlJbmRleGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICBJbmRleE5hbWU6IFwiY29ycmVsYXRpb25faWQtaW5kZXhcIixcbiAgICAgICAgICBLZXlTY2hlbWE6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogXCJjb3JyZWxhdGlvbl9pZFwiLFxuICAgICAgICAgICAgICBLZXlUeXBlOiBcIkhBU0hcIixcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0pLFxuICAgICAgICAgIFByb2plY3Rpb246IHsgUHJvamVjdGlvblR5cGU6IFwiQUxMXCIgfSxcbiAgICAgICAgfSksXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgaGF2ZSB0YWJsZSBuYW1lIG1hdGNoaW5nIHtzdGFja05hbWV9LXVzYWdlLWhpc3RvcnlcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgIFRhYmxlTmFtZTogXCJUZXN0U3RhY2stdXNhZ2UtaGlzdG9yeVwiLFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIERlbGV0aW9uUG9saWN5IERFU1RST1lcIiwgKCkgPT4ge1xuICAgIGNvbnN0IHRhYmxlcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OkR5bmFtb0RCOjpUYWJsZVwiKTtcbiAgICBjb25zdCB0YWJsZSA9IE9iamVjdC52YWx1ZXModGFibGVzKVswXSBhcyB7IERlbGV0aW9uUG9saWN5Pzogc3RyaW5nIH07XG4gICAgZXhwZWN0KHRhYmxlLkRlbGV0aW9uUG9saWN5KS50b0JlKFwiRGVsZXRlXCIpO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIFBJVFIgKFBvaW50LWluLVRpbWUgUmVjb3ZlcnkpIGVuYWJsZWRcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6RHluYW1vREI6OlRhYmxlXCIsIHtcbiAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==