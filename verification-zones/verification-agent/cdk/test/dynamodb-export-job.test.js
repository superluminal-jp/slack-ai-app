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
/**
 * DynamoDbExportJob CDK unit tests.
 *
 * Verifies: EventBridge Scheduler, Lambda, and IAM for daily DynamoDB-to-S3 export.
 */
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const dynamodb_export_job_1 = require("../lib/constructs/dynamodb-export-job");
function policyHasAction(policies, action) {
    return Object.values(policies).some((res) => {
        const doc = res.Properties?.PolicyDocument;
        const stmts = (doc?.Statement ?? []);
        return stmts.some((s) => {
            const a = s.Action;
            return Array.isArray(a) ? a.includes(action) : a === action;
        });
    });
}
describe("DynamoDbExportJob", () => {
    let template;
    beforeAll(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, "TestStack", {
            env: { account: "123456789012", region: "ap-northeast-1" },
        });
        const table = new dynamodb.Table(stack, "Table", {
            partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
            tableName: "TestStack-usage-history",
        });
        const bucket = new s3.Bucket(stack, "Bucket", {
            bucketName: "teststack-usage-history",
        });
        new dynamodb_export_job_1.DynamoDbExportJob(stack, "DynamoDbExportJob", { table, bucket });
        template = assertions_1.Template.fromStack(stack);
    });
    describe("EventBridge Scheduler", () => {
        it("should create a Schedule with cron(0 15 * * ? *) — JST 00:00 daily", () => {
            template.hasResourceProperties("AWS::Scheduler::Schedule", {
                ScheduleExpression: "cron(0 15 * * ? *)",
                State: "ENABLED",
            });
        });
    });
    describe("Lambda function", () => {
        it("should create a Lambda function with Python 3.11 runtime", () => {
            template.hasResourceProperties("AWS::Lambda::Function", {
                Runtime: "python3.11",
            });
        });
        it("should have TABLE_ARN and EXPORT_BUCKET_NAME env vars", () => {
            template.hasResourceProperties("AWS::Lambda::Function", {
                Environment: {
                    Variables: assertions_1.Match.objectLike({
                        TABLE_ARN: assertions_1.Match.anyValue(),
                        EXPORT_BUCKET_NAME: assertions_1.Match.anyValue(),
                    }),
                },
            });
        });
    });
    describe("IAM permissions", () => {
        it("should have dynamodb:ExportTableToPointInTime in policy", () => {
            const policies = template.findResources("AWS::IAM::Policy");
            expect(policyHasAction(policies, "dynamodb:ExportTableToPointInTime")).toBe(true);
        });
        it("should have s3:PutObject on dynamodb-exports/* in policy", () => {
            const policies = template.findResources("AWS::IAM::Policy");
            expect(policyHasAction(policies, "s3:PutObject")).toBe(true);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGItZXhwb3J0LWpvYi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZHluYW1vZGItZXhwb3J0LWpvYi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7Ozs7R0FJRztBQUNILGlEQUFtQztBQUNuQyx1REFBeUQ7QUFDekQsbUVBQXFEO0FBQ3JELHVEQUF5QztBQUN6QywrRUFBMEU7QUFVMUUsU0FBUyxlQUFlLENBQ3RCLFFBQWlDLEVBQ2pDLE1BQWM7SUFFZCxPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUU7UUFDMUMsTUFBTSxHQUFHLEdBQUksR0FBeUIsQ0FBQyxVQUFVLEVBQUUsY0FBYyxDQUFDO1FBQ2xFLE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBRyxFQUFFLFNBQVMsSUFBSSxFQUFFLENBQW1CLENBQUM7UUFDdkQsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDdEIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQztZQUNuQixPQUFPLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxNQUFNLENBQUM7UUFDOUQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFFRCxRQUFRLENBQUMsbUJBQW1CLEVBQUUsR0FBRyxFQUFFO0lBQ2pDLElBQUksUUFBa0IsQ0FBQztJQUV2QixTQUFTLENBQUMsR0FBRyxFQUFFO1FBQ2IsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7WUFDNUMsR0FBRyxFQUFFLEVBQUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsZ0JBQWdCLEVBQUU7U0FDM0QsQ0FBQyxDQUFDO1FBRUgsTUFBTSxLQUFLLEdBQUcsSUFBSSxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxPQUFPLEVBQUU7WUFDL0MsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDakUsU0FBUyxFQUFFLHlCQUF5QjtTQUNyQyxDQUFDLENBQUM7UUFFSCxNQUFNLE1BQU0sR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRTtZQUM1QyxVQUFVLEVBQUUseUJBQXlCO1NBQ3RDLENBQUMsQ0FBQztRQUVILElBQUksdUNBQWlCLENBQUMsS0FBSyxFQUFFLG1CQUFtQixFQUFFLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDckUsUUFBUSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3ZDLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLHVCQUF1QixFQUFFLEdBQUcsRUFBRTtRQUNyQyxFQUFFLENBQUMsb0VBQW9FLEVBQUUsR0FBRyxFQUFFO1lBQzVFLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQywwQkFBMEIsRUFBRTtnQkFDekQsa0JBQWtCLEVBQUUsb0JBQW9CO2dCQUN4QyxLQUFLLEVBQUUsU0FBUzthQUNqQixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsUUFBUSxDQUFDLGlCQUFpQixFQUFFLEdBQUcsRUFBRTtRQUMvQixFQUFFLENBQUMsMERBQTBELEVBQUUsR0FBRyxFQUFFO1lBQ2xFLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDdEQsT0FBTyxFQUFFLFlBQVk7YUFDdEIsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsdURBQXVELEVBQUUsR0FBRyxFQUFFO1lBQy9ELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtnQkFDdEQsV0FBVyxFQUFFO29CQUNYLFNBQVMsRUFBRSxrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDMUIsU0FBUyxFQUFFLGtCQUFLLENBQUMsUUFBUSxFQUFFO3dCQUMzQixrQkFBa0IsRUFBRSxrQkFBSyxDQUFDLFFBQVEsRUFBRTtxQkFDckMsQ0FBQztpQkFDSDthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsaUJBQWlCLEVBQUUsR0FBRyxFQUFFO1FBQy9CLEVBQUUsQ0FBQyx5REFBeUQsRUFBRSxHQUFHLEVBQUU7WUFDakUsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FDSixlQUFlLENBQUMsUUFBUSxFQUFFLG1DQUFtQyxDQUFDLENBQy9ELENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2YsQ0FBQyxDQUFDLENBQUM7UUFFSCxFQUFFLENBQUMsMERBQTBELEVBQUUsR0FBRyxFQUFFO1lBQ2xFLE1BQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUMvRCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIER5bmFtb0RiRXhwb3J0Sm9iIENESyB1bml0IHRlc3RzLlxuICpcbiAqIFZlcmlmaWVzOiBFdmVudEJyaWRnZSBTY2hlZHVsZXIsIExhbWJkYSwgYW5kIElBTSBmb3IgZGFpbHkgRHluYW1vREItdG8tUzMgZXhwb3J0LlxuICovXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgczMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1zM1wiO1xuaW1wb3J0IHsgRHluYW1vRGJFeHBvcnRKb2IgfSBmcm9tIFwiLi4vbGliL2NvbnN0cnVjdHMvZHluYW1vZGItZXhwb3J0LWpvYlwiO1xuXG4vKiogSUFNIHBvbGljeSByZXNvdXJjZSB3aXRoIFN0YXRlbWVudCBhcnJheSAqL1xudHlwZSBJQU1Qb2xpY3lSZXNvdXJjZSA9IHtcbiAgUHJvcGVydGllcz86IHsgUG9saWN5RG9jdW1lbnQ/OiB7IFN0YXRlbWVudD86IHVua25vd25bXSB9IH07XG59O1xuXG4vKiogSUFNIHN0YXRlbWVudCB3aXRoIEFjdGlvbiAoc3RyaW5nIG9yIHN0cmluZ1tdKSAqL1xudHlwZSBJQU1TdGF0ZW1lbnQgPSB7IEFjdGlvbj86IHN0cmluZyB8IHN0cmluZ1tdOyBFZmZlY3Q/OiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gcG9saWN5SGFzQWN0aW9uKFxuICBwb2xpY2llczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG4gIGFjdGlvbjogc3RyaW5nXG4pOiBib29sZWFuIHtcbiAgcmV0dXJuIE9iamVjdC52YWx1ZXMocG9saWNpZXMpLnNvbWUoKHJlcykgPT4ge1xuICAgIGNvbnN0IGRvYyA9IChyZXMgYXMgSUFNUG9saWN5UmVzb3VyY2UpLlByb3BlcnRpZXM/LlBvbGljeURvY3VtZW50O1xuICAgIGNvbnN0IHN0bXRzID0gKGRvYz8uU3RhdGVtZW50ID8/IFtdKSBhcyBJQU1TdGF0ZW1lbnRbXTtcbiAgICByZXR1cm4gc3RtdHMuc29tZSgocykgPT4ge1xuICAgICAgY29uc3QgYSA9IHMuQWN0aW9uO1xuICAgICAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYSkgPyBhLmluY2x1ZGVzKGFjdGlvbikgOiBhID09PSBhY3Rpb247XG4gICAgfSk7XG4gIH0pO1xufVxuXG5kZXNjcmliZShcIkR5bmFtb0RiRXhwb3J0Sm9iXCIsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIiwge1xuICAgICAgZW52OiB7IGFjY291bnQ6IFwiMTIzNDU2Nzg5MDEyXCIsIHJlZ2lvbjogXCJhcC1ub3J0aGVhc3QtMVwiIH0sXG4gICAgfSk7XG5cbiAgICBjb25zdCB0YWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZShzdGFjaywgXCJUYWJsZVwiLCB7XG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJwa1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgdGFibGVOYW1lOiBcIlRlc3RTdGFjay11c2FnZS1oaXN0b3J5XCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBidWNrZXQgPSBuZXcgczMuQnVja2V0KHN0YWNrLCBcIkJ1Y2tldFwiLCB7XG4gICAgICBidWNrZXROYW1lOiBcInRlc3RzdGFjay11c2FnZS1oaXN0b3J5XCIsXG4gICAgfSk7XG5cbiAgICBuZXcgRHluYW1vRGJFeHBvcnRKb2Ioc3RhY2ssIFwiRHluYW1vRGJFeHBvcnRKb2JcIiwgeyB0YWJsZSwgYnVja2V0IH0pO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJFdmVudEJyaWRnZSBTY2hlZHVsZXJcIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBhIFNjaGVkdWxlIHdpdGggY3JvbigwIDE1ICogKiA/ICopIOKAlCBKU1QgMDA6MDAgZGFpbHlcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTY2hlZHVsZXI6OlNjaGVkdWxlXCIsIHtcbiAgICAgICAgU2NoZWR1bGVFeHByZXNzaW9uOiBcImNyb24oMCAxNSAqICogPyAqKVwiLFxuICAgICAgICBTdGF0ZTogXCJFTkFCTEVEXCIsXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoXCJMYW1iZGEgZnVuY3Rpb25cIiwgKCkgPT4ge1xuICAgIGl0KFwic2hvdWxkIGNyZWF0ZSBhIExhbWJkYSBmdW5jdGlvbiB3aXRoIFB5dGhvbiAzLjExIHJ1bnRpbWVcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgUnVudGltZTogXCJweXRob24zLjExXCIsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGl0KFwic2hvdWxkIGhhdmUgVEFCTEVfQVJOIGFuZCBFWFBPUlRfQlVDS0VUX05BTUUgZW52IHZhcnNcIiwgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpMYW1iZGE6OkZ1bmN0aW9uXCIsIHtcbiAgICAgICAgRW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICBWYXJpYWJsZXM6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgVEFCTEVfQVJOOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgRVhQT1JUX0JVQ0tFVF9OQU1FOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKFwiSUFNIHBlcm1pc3Npb25zXCIsICgpID0+IHtcbiAgICBpdChcInNob3VsZCBoYXZlIGR5bmFtb2RiOkV4cG9ydFRhYmxlVG9Qb2ludEluVGltZSBpbiBwb2xpY3lcIiwgKCkgPT4ge1xuICAgICAgY29uc3QgcG9saWNpZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpJQU06OlBvbGljeVwiKTtcbiAgICAgIGV4cGVjdChcbiAgICAgICAgcG9saWN5SGFzQWN0aW9uKHBvbGljaWVzLCBcImR5bmFtb2RiOkV4cG9ydFRhYmxlVG9Qb2ludEluVGltZVwiKVxuICAgICAgKS50b0JlKHRydWUpO1xuICAgIH0pO1xuXG4gICAgaXQoXCJzaG91bGQgaGF2ZSBzMzpQdXRPYmplY3Qgb24gZHluYW1vZGItZXhwb3J0cy8qIGluIHBvbGljeVwiLCAoKSA9PiB7XG4gICAgICBjb25zdCBwb2xpY2llcyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoXCJBV1M6OklBTTo6UG9saWN5XCIpO1xuICAgICAgZXhwZWN0KHBvbGljeUhhc0FjdGlvbihwb2xpY2llcywgXCJzMzpQdXRPYmplY3RcIikpLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=