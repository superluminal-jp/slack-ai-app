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
    it("should create S3 bucket with name pattern {stackName.toLowerCase()}-usage-history-archive", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            BucketName: "teststack-usage-history-archive",
        });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldC50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXNhZ2UtaGlzdG9yeS1hcmNoaXZlLWJ1Y2tldC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5RDtBQUN6RCxpR0FBMkY7QUFFM0YsUUFBUSxDQUFDLDJCQUEyQixFQUFFLEdBQUcsRUFBRTtJQUN6QyxJQUFJLFFBQWtCLENBQUM7SUFFdkIsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNiLE1BQU0sR0FBRyxHQUFHLElBQUksR0FBRyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFDOUMsSUFBSSx3REFBeUIsQ0FBQyxLQUFLLEVBQUUsMkJBQTJCLENBQUMsQ0FBQztRQUNsRSxRQUFRLEdBQUcscUJBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkMsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsMkZBQTJGLEVBQUUsR0FBRyxFQUFFO1FBQ25HLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBaUIsRUFBRTtZQUNoRCxVQUFVLEVBQUUsaUNBQWlDO1NBQzlDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLGdDQUFnQyxFQUFFLEdBQUcsRUFBRTtRQUN4QyxRQUFRLENBQUMscUJBQXFCLENBQUMsaUJBQWlCLEVBQUU7WUFDaEQsdUJBQXVCLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO1NBQy9DLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsRUFBRTtRQUNoRCxRQUFRLENBQUMscUJB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RSxFQUFFLGNBQWMsRUFBRSxDQUFDLEVBQUU7d0JBQ2xELE1BQU0sRUFBRSxTQUFTO3FCQUNsQixDQUFDO2lCQUNILENBQUM7YUFDSDtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldCB9IGZyb20gXCIuLi9saWIvY29uc3RydWN0cy91c2FnZS1oaXN0b3J5LWFyY2hpdmUtYnVja2V0XCI7XG5cbmRlc2NyaWJlKFwiVXNhZ2VIaXN0b3J5QXJjaGl2ZUJ1Y2tldFwiLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgYmVmb3JlQWxsKCgpID0+IHtcbiAgICBjb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIGNvbnN0IHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsIFwiVGVzdFN0YWNrXCIpO1xuICAgIG5ldyBVc2FnZUhpc3RvcnlBcmNoaXZlQnVja2V0KHN0YWNrLCBcIlVzYWdlSGlzdG9yeUFyY2hpdmVCdWNrZXRcIik7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICBpdChcInNob3VsZCBjcmVhdGUgUzMgYnVja2V0IHdpdGggbmFtZSBwYXR0ZXJuIHtzdGFja05hbWUudG9Mb3dlckNhc2UoKX0tdXNhZ2UtaGlzdG9yeS1hcmNoaXZlXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgQnVja2V0TmFtZTogXCJ0ZXN0c3RhY2stdXNhZ2UtaGlzdG9yeS1hcmNoaXZlXCIsXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgdmVyc2lvbmluZyBlbmFibGVkXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgVmVyc2lvbmluZ0NvbmZpZ3VyYXRpb246IHsgU3RhdHVzOiBcIkVuYWJsZWRcIiB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIFNTRS1TMyBlbmNyeXB0aW9uIChBRVMyNTYpXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgQnVja2V0RW5jcnlwdGlvbjoge1xuICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkNvbmZpZ3VyYXRpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBTZXJ2ZXJTaWRlRW5jcnlwdGlvbkJ5RGVmYXVsdDogeyBTU0VBbGdvcml0aG06IFwiQUVTMjU2XCIgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIEJsb2NrUHVibGljQWNjZXNzIEJMT0NLX0FMTFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICBJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBlbmZvcmNlIFNTTFwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0UG9saWN5XCIsIHtcbiAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEVmZmVjdDogXCJEZW55XCIsXG4gICAgICAgICAgICBDb25kaXRpb246IHsgQm9vbDogeyBcImF3czpTZWN1cmVUcmFuc3BvcnRcIjogXCJmYWxzZVwiIH0gfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBjb250ZW50LyBwcmVmaXggd2l0aCA5MC1kYXkgZXhwaXJhdGlvblwiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIExpZmVjeWNsZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBQcmVmaXg6IFwiY29udGVudC9cIixcbiAgICAgICAgICAgIEV4cGlyYXRpb25JbkRheXM6IDkwLFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBoYXZlIGxpZmVjeWNsZSBydWxlIGZvciBhdHRhY2htZW50cy8gcHJlZml4IHdpdGggOTAtZGF5IGV4cGlyYXRpb25cIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBMaWZlY3ljbGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgUHJlZml4OiBcImF0dGFjaG1lbnRzL1wiLFxuICAgICAgICAgICAgRXhwaXJhdGlvbkluRGF5czogOTAsXG4gICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgbGlmZWN5Y2xlIHJ1bGUgZm9yIGR5bmFtb2RiLWV4cG9ydHMvIHByZWZpeCB3aXRoIDkwLWRheSBleHBpcmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgTGlmZWN5Y2xlQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBSdWxlczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIFByZWZpeDogXCJkeW5hbW9kYi1leHBvcnRzL1wiLFxuICAgICAgICAgICAgRXhwaXJhdGlvbkluRGF5czogOTAsXG4gICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGhhdmUgbm9uY3VycmVudCB2ZXJzaW9uIGV4cGlyYXRpb24gbGlmZWN5Y2xlIHJ1bGUgKDcgZGF5cylcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBMaWZlY3ljbGVDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgTm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiB7IE5vbmN1cnJlbnREYXlzOiA3IH0sXG4gICAgICAgICAgICBTdGF0dXM6IFwiRW5hYmxlZFwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=