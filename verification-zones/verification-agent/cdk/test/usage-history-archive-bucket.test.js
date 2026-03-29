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
const usage_history_archive_bucket_1 = require("../lib/constructs/usage-history-archive-bucket");
describe("UsageHistoryArchiveBucket", () => {
    let template;
    beforeAll(() => {
        const app = new cdk.App();
        const stack = new cdk.Stack(app, "TestStack");
        new usage_history_archive_bucket_1.UsageHistoryArchiveBucket(stack, "UsageHistoryArchiveBucket");
        template = assertions_1.Template.fromStack(stack);
    });
    it("should embed account ID in bucket name for global uniqueness", () => {
        const resources = template.findResources("AWS::S3::Bucket");
        const names = Object.values(resources).map((r) => r.Properties?.BucketName);
        expect(names).toHaveLength(1);
        const serialized = JSON.stringify(names[0]);
        expect(serialized).toContain("AWS::AccountId");
        expect(serialized).toContain("teststack");
        expect(serialized).toContain("usage-history-archive");
    });
    it("should have versioning enabled", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            VersioningConfiguration: { Status: "Enabled" },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxpR0FBMkY7QUFFM0YsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN6QyxJQUFJLFFBQWtCLENBQUM7SUFFdkIsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNiLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDOUMsSUFBSSx3REFBeUIsQ0FBQyxLQUFLLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUNsRSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsOERBQThELEVBQUUsR0FBRyxFQUFFO1FBQ3RFLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsQ0FBQztRQUM1RCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEdBQUcsQ0FDeEMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFFLENBQStDLENBQUMsVUFBVSxFQUFFLFVBQVUsQ0FDL0UsQ0FBQztRQUNGLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUIsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FB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QyxpQkFBaUIsRUFBRTtZQUNoRCxzQkFBc0IsRUFBRTtnQkFDdEIsS0FBSyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUNyQixrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDZixNQUFNLEVBQUUsbUJBQW1CO3dCQUMzQixnQkFBZ0IsRUFBRSxFQUFFO3dCQUNwQixNQUFNLEVBQUUsU0FBUztxQkFDbEIsQ0FBQztpQkFDSCxDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxtRUFBbUUsRUFBRSxHQUFHLEVBQUU7UUFDM0UsUUFBUSxDQUFDLHFCQUFxQixDQUFDLGlCQUFpQixFQUFFO1lBQ2hELHNCQUFzQixFQUFFO2dCQUN0QixLQUFLLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7b0JBQ3JCLGtCQUFLLENBQUMsVUFBVSxDQUFDO3dCQUNmLDJCQUEyQixFQUFFLEVBQUUsY0FBYyxFQUFFLENBQUMsRUFBRTt3QkFDbEQsTUFBTSxFQUFFLFNBQVM7cUJBQ2xCLENBQUM7aUJBQ0gsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gXCJhd3MtY2RrLWxpYi9hc3NlcnRpb25zXCI7XG5pbXBvcnQgeyBVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0IH0gZnJvbSBcIi4uL2xpYi9jb25zdHJ1Y3RzL3VzYWdlLWhpc3RvcnktYXJjaGl2ZS1idWNrZXRcIjtcblxuZGVzY3JpYmUoXCJVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0XCIsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3Qgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgXCJUZXN0U3RhY2tcIik7XG4gICAgbmV3IFVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXQoc3RhY2ssIFwiVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldFwiKTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGVtYmVkIGFjY291bnQgSUQgaW4gYnVja2V0IG5hbWUgZm9yIGdsb2JhbCB1bmlxdWVuZXNzXCIsICgpID0+IHtcbiAgICBjb25zdCByZXNvdXJjZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTMzo6QnVja2V0XCIpO1xuICAgIGNvbnN0IG5hbWVzID0gT2JqZWN0LnZhbHVlcyhyZXNvdXJjZXMpLm1hcChcbiAgICAgIChyKSA9PiAociBhcyB7IFByb3BlcnRpZXM/OiB7IEJ1Y2tldE5hbWU/OiB1bmtub3duIH0gfSkuUHJvcGVydGllcz8uQnVja2V0TmFtZVxuICAgICk7XG4gICAgZXhwZWN0KG5hbWVzKS50b0hhdmVMZW5ndGgoMSk7XG4gICAgY29uc3Qgc2VyaWFsaXplZCA9IEpTT04uc3RyaW5naWZ5KG5hbWVzWzBdKTtcbiAgICBleHBlY3Qoc2VyaWFsaXplZCkudG9Db250YWluKFwiQVdTOjpBY2NvdW50SWRcIik7XG4gICAgZXhwZWN0KHNlcmlhbGl6ZWQpLnRvQ29udGFpbihcInRlc3RzdGFja1wiKTtcbiAgICBleHBlY3Qoc2VyaWFsaXplZCkudG9Db250YWluKFwidXNhZ2UtaGlzdG9yeS1hcmNoaXZlXCIpO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIHZlcnNpb25pbmcgZW5hYmxlZFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIFZlcnNpb25pbmdDb25maWd1cmF0aW9uOiB7IFN0YXR1czogXCJFbmFibGVkXCIgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgaGF2ZSBTU0UtUzMgZW5jcnlwdGlvbiAoQUVTMjU2KVwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIEJ1Y2tldEVuY3J5cHRpb246IHtcbiAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb25CeURlZmF1bHQ6IHsgU1NFQWxnb3JpdGhtOiBcIkFFUzI1NlwiIH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgaGF2ZSBCbG9ja1B1YmxpY0FjY2VzcyBCTE9DS19BTExcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgZW5mb3JjZSBTU0xcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFBvbGljeVwiLCB7XG4gICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBFZmZlY3Q6IFwiRGVueVwiLFxuICAgICAgICAgICAgQ29uZGl0aW9uOiB7IEJvb2w6IHsgXCJhd3M6U2VjdXJlVHJhbnNwb3J0XCI6IFwiZmFsc2VcIiB9IH0sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgaGF2ZSBsaWZlY3ljbGUgcnVsZSBmb3IgY29udGVudC8gcHJlZml4IHdpdGggOTAtZGF5IGV4cGlyYXRpb25cIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBMaWZlY3ljbGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgUHJlZml4OiBcImNvbnRlbnQvXCIsXG4gICAgICAgICAgICBFeHBpcmF0aW9uSW5EYXlzOiA5MCxcbiAgICAgICAgICAgIFN0YXR1czogXCJFbmFibGVkXCIsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgaGF2ZSBsaWZlY3ljbGUgcnVsZSBmb3IgYXR0YWNobWVudHMvIHByZWZpeCB3aXRoIDkwLWRheSBleHBpcmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgTGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFByZWZpeDogXCJhdHRhY2htZW50cy9cIixcbiAgICAgICAgICAgIEV4cGlyYXRpb25JbkRheXM6IDkwLFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBkeW5hbW9kYi1leHBvcnRzLyBwcmVmaXggd2l0aCA5MC1kYXkgZXhwaXJhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBQcmVmaXg6IFwiZHluYW1vZGItZXhwb3J0cy9cIixcbiAgICAgICAgICAgIEV4cGlyYXRpb25JbkRheXM6IDkwLFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIG5vbmN1cnJlbnQgdmVyc2lvbiBleHBpcmF0aW9uIGxpZmVjeWNsZSBydWxlICg3IGRheXMpXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgTGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIE5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogeyBOb25jdXJyZW50RGF5czogNyB9LFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19