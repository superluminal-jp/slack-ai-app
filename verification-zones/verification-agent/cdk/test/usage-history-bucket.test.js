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
const usage_history_bucket_1 = require("../lib/constructs/usage-history-bucket");
describe("UsageHistoryBucket", () => {
    let template;
    beforeAll(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, "TestStack");
        new usage_history_bucket_1.UsageHistoryBucket(stack, "UsageHistoryBucket");
        template = assertions_1.Template.fromStack(stack);
    });
    it("should create S3 bucket with name pattern {stackName.toLowerCase()}-usage-history", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            BucketName: "teststack-usage-history",
        });
    });
    it("should have SSE-S3 encryption (AES256)", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            BucketEncryption: {
                ServerSideEncryptionConfiguration: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" },
                    }),
                ]),
            },
        });
    });
    it("should have BlockPublicAccess BLOCK_ALL", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
        });
    });
    it("should enforce SSL", () => {
        template.hasResourceProperties("AWS::S3::BucketPolicy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Deny",
                        Condition: { Bool: { "aws:SecureTransport": "false" } },
                    }),
                ]),
            },
        });
    });
    it("should have lifecycle rule for content/ prefix with 90-day expiration", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            LifecycleConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Prefix: "content/",
                        ExpirationInDays: 90,
                        Status: "Enabled",
                    }),
                ]),
            },
        });
    });
    it("should have lifecycle rule for attachments/ prefix with 90-day expiration", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            LifecycleConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Prefix: "attachments/",
                        ExpirationInDays: 90,
                        Status: "Enabled",
                    }),
                ]),
            },
        });
    });
    it("should have lifecycle rule for dynamodb-exports/ prefix with 90-day expiration", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            LifecycleConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Prefix: "dynamodb-exports/",
                        ExpirationInDays: 90,
                        Status: "Enabled",
                    }),
                ]),
            },
        });
    });
    it("should have versioning enabled", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            VersioningConfiguration: { Status: "Enabled" },
        });
    });
    it("should have noncurrent version expiration lifecycle rule (7 days)", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            LifecycleConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        NoncurrentVersionExpiration: { NoncurrentDays: 7 },
                        Status: "Enabled",
                    }),
                ]),
            },
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1idWNrZXQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVzYWdlLWhpc3RvcnktYnVja2V0LnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELGlGQUE0RTtBQUU1RSxRQUFRLENBQUMsb0JBQW9CLEVBQUUsR0FBRyxFQUFFO0lBQ2xDLElBQUksUUFBa0IsQ0FBQztJQUV2QixTQUFTLENBQUMsR0FBRyxFQUFFO1FBQ2IsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDMUIsTUFBTSxLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLENBQUMsQ0FBQztRQUM5QyxJQUFJLHlDQUFrQixDQUFDLEtBQUssRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3BELFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxtRkFBbUYsRUFBRSxHQUFHLEVBQUU7UUFDM0YsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1lBQ2hELFVBQVUsRUFBRSx5QkFBeUI7U0FDdEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsd0NBQXdDLEVBQUUsR0FBRyxFQUFFO1FBQ2hELFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtZQUNoRCxnQkFBZ0IsRUFBRTtnQkFDaEIsaUNBQWlDLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ2pELGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNmLDZCQUE2QixFQUFFLEVBQUUsWUFBWSxFQUFFLFFBQVEsRUFBRTtxQkFDMUQsQ0FBQztpQkFDSCxDQUFD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LENBQUMsRUFBRTt3QkFDbEQsTUFBTSxFQUFFLFNBQVM7cUJBQ2xCLENBQUM7aUJBQ0gsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCI7XG5pbXBvcnQgeyBVc2FnZUhpc3RvcnlCdWNrZXQgfSBmcm9tIFwiLi4vbGliL2NvbnN0cnVjdHMvdXNhZ2UtaGlzdG9yeS1idWNrZXRcIjtcblxuZGVzY3JpYmUoXCJVc2FnZUhpc3RvcnlCdWNrZXRcIiwgKCkgPT4ge1xuICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgY29uc3QgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBzdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCBcIlRlc3RTdGFja1wiKTtcbiAgICBuZXcgVXNhZ2VIaXN0b3J5QnVja2V0KHN0YWNrLCBcIlVzYWdlSGlzdG9yeUJ1Y2tldFwiKTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGNyZWF0ZSBTMyBidWNrZXQgd2l0aCBuYW1lIHBhdHRlcm4ge3N0YWNrTmFtZS50b0xvd2VyQ2FzZSgpfS11c2FnZS1oaXN0b3J5XCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgQnVja2V0TmFtZTogXCJ0ZXN0c3RhY2stdXNhZ2UtaGlzdG9yeVwiLFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIFNTRS1TMyBlbmNyeXB0aW9uIChBRVMyNTYpXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgQnVja2V0RW5jcnlwdGlvbjoge1xuICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDogeyBTU0VBbGdvcml0aG06IFwiQUVTMjU2XCIgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIEJsb2NrUHVibGljQWNjZXNzIEJMT0NLX0FMTFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICBJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBlbmZvcmNlIFNTTFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0UG9saWN5XCIsIHtcbiAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEVmZmVjdDogXCJEZW55XCIsXG4gICAgICAgICAgICBDb25kaXRpb246IHsgQm9vbDogeyBcImF3czpTZWN1cmVUcmFuc3BvcnRcIjogXCJmYWxzZVwiIH0gfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBjb250ZW50LyBwcmVmaXggd2l0aCA5MC1kYXkgZXhwaXJhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBQcmVmaXg6IFwiY29udGVudC9cIixcbiAgICAgICAgICAgIEV4cGlyYXRpb25JbkRheXM6IDkwLFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBhdHRhY2htZW50cy8gcHJlZml4IHdpdGggOTAtZGF5IGV4cGlyYXRpb25cIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBMaWZlY3ljbGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgUHJlZml4OiBcImF0dGFjaG1lbnRzL1wiLFxuICAgICAgICAgICAgRXhwaXJhdGlvbkluRGF5czogOTAsXG4gICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgbGlmZWN5Y2xlIHJ1bGUgZm9yIGR5bmFtb2RiLWV4cG9ydHMvIHByZWZpeCB3aXRoIDkwLWRheSBleHBpcmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgTGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFByZWZpeDogXCJkeW5hbW9kYi1leHBvcnRzL1wiLFxuICAgICAgICAgICAgRXhwaXJhdGlvbkluRGF5czogOTAsXG4gICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgdmVyc2lvbmluZyBlbmFibGVkXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgVmVyc2lvbmluZ0NvbmZpZ3VyYXRpb246IHsgU3RhdHVzOiBcIkVuYWJsZWRcIiB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIG5vbmN1cnJlbnQgdmVyc2lvbiBleHBpcmF0aW9uIGxpZmVjeWNsZSBydWxlICg3IGRheXMpXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgTGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogeyBOb25jdXJyZW50RGF5czogNyB9LFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19