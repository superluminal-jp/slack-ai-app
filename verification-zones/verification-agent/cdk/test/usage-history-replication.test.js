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
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const assertions_1 = require("aws-cdk-lib/assertions");
const usage_history_replication_1 = require("../lib/constructs/usage-history-replication");
function buildTemplate(archiveAccountId) {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, "TestStack");
    const sourceBucket = new s3.Bucket(stack, "Source", { versioned: true });
    const archiveBucket = new s3.Bucket(stack, "Archive", { versioned: true });
    new usage_history_replication_1.UsageHistoryReplication(stack, "Replication", {
        sourceBucket,
        archiveBucket,
        archiveAccountId,
    });
    return assertions_1.Template.fromStack(stack);
}
describe("UsageHistoryReplication — same-account mode", () => {
    let template;
    beforeAll(() => {
        template = buildTemplate(); // no archiveAccountId
    });
    it("should create IAM role with s3.amazonaws.com trust", () => {
        template.hasResourceProperties("AWS::IAM::Role", {
            AssumeRolePolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Principal: { Service: "s3.amazonaws.com" },
                        Action: "sts:AssumeRole",
                    }),
                ]),
            },
        });
    });
    it("should grant s3:GetReplicationConfiguration and s3:ListBucket on source bucket", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Allow",
                        Action: assertions_1.Match.arrayWith([
                            "s3:GetReplicationConfiguration",
                            "s3:ListBucket",
                        ]),
                    }),
                ]),
            },
        });
    });
    it("should grant GetObjectVersion* actions on source bucket objects", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Allow",
                        Action: assertions_1.Match.arrayWith([
                            "s3:GetObjectVersionForReplication",
                            "s3:GetObjectVersionAcl",
                            "s3:GetObjectVersionTagging",
                        ]),
                    }),
                ]),
            },
        });
    });
    it("should grant ReplicateObject, ReplicateDelete, ReplicateTags on archive bucket objects", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Allow",
                        Action: assertions_1.Match.arrayWith([
                            "s3:ReplicateObject",
                            "s3:ReplicateDelete",
                            "s3:ReplicateTags",
                        ]),
                    }),
                ]),
            },
        });
    });
    it("should add bucket policy on archive bucket allowing replication writes", () => {
        template.hasResourceProperties("AWS::S3::BucketPolicy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Allow",
                        Action: assertions_1.Match.arrayWith([
                            "s3:ReplicateObject",
                            "s3:ReplicateDelete",
                        ]),
                    }),
                ]),
            },
        });
    });
    it("should set ReplicationConfiguration on source bucket with filter prefix '' and Status Enabled", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            ReplicationConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Filter: { Prefix: "" },
                        Status: "Enabled",
                    }),
                ]),
            },
        });
    });
    it("should set DeleteMarkerReplication to Disabled", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            ReplicationConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        DeleteMarkerReplication: { Status: "Disabled" },
                    }),
                ]),
            },
        });
    });
    it("should NOT include Account or AccessControlTranslation in same-account mode", () => {
        const resources = template.findResources("AWS::S3::Bucket", {
            Properties: {
                ReplicationConfiguration: assertions_1.Match.objectLike({}),
            },
        });
        const bucketWithReplication = Object.values(resources)[0];
        const destination = bucketWithReplication.Properties.ReplicationConfiguration.Rules[0]
            .Destination;
        expect(destination).not.toHaveProperty("Account");
        expect(destination).not.toHaveProperty("AccessControlTranslation");
    });
});
describe("UsageHistoryReplication — cross-account mode", () => {
    let template;
    const crossAccountId = "123456789012";
    beforeAll(() => {
        template = buildTemplate(crossAccountId);
    });
    it("should set Account in replication destination", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            ReplicationConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Destination: assertions_1.Match.objectLike({
                            Account: crossAccountId,
                        }),
                    }),
                ]),
            },
        });
    });
    it("should set AccessControlTranslation Owner to Destination", () => {
        template.hasResourceProperties("AWS::S3::Bucket", {
            ReplicationConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Destination: assertions_1.Match.objectLike({
                            AccessControlTranslation: { Owner: "Destination" },
                        }),
                    }),
                ]),
            },
        });
    });
    it("should include s3:ObjectOwnerOverrideToBucketOwner in IAM policy", () => {
        template.hasResourceProperties("AWS::IAM::Policy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Allow",
                        Action: assertions_1.Match.arrayWith([
                            "s3:ObjectOwnerOverrideToBucketOwner",
                        ]),
                    }),
                ]),
            },
        });
    });
    it("should include s3:ObjectOwnerOverrideToBucketOwner in archive bucket policy", () => {
        template.hasResourceProperties("AWS::S3::BucketPolicy", {
            PolicyDocument: {
                Statement: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Effect: "Allow",
                        Action: assertions_1.Match.arrayWith([
                            "s3:ObjectOwnerOverrideToBucketOwner",
                        ]),
                    }),
                ]),
            },
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUF5QztBQUN6Qyx1REFBeUQ7QUFDekQsMkZBQXNGO0FBRXRGLFNBQVMsYUFBYSxDQUFDLGdCQUF5QjtJQUM5QyxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztJQUMxQixNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLFdBQVcsQ0FBQyxDQUFDO0lBQzlDLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDekUsTUFBTSxhQUFhLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMzRSxJQUFJLG1EQUF1QixDQUFDLEtBQUssRUFBRSxhQUFhLEVBQUU7UUFDaEQsWUFBWTtRQUNaLGFBQWE7UUFDYixnQkFBZ0I7S0FDakIsQ0FBQyxDQUFDO0lBQ0gsT0FBTyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQsUUFBUSxDQUFDLDZDQUE2QyxFQUFFLEdBQUcsRUFBRTtJQUMzRCxJQUFJLFFBQWtCLENBQUM7SUFFdkIsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNiLFFBQVEsR0FBRyxhQUFhLEVBQUUsQ0FBQyxDQUFDLHNCQUFzQjtJQUNwRCxDQUFDLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyxvREFBb0Qs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O3dCQUNmLE1BQU0sRUFBRSxrQkFBSyxDQUFDLFNBQVMsQ0FBQzs0QkFDdEIscUNBQXFDO3lCQUN0QyxDQUFDO3FCQUNILENBQUM7aUJBQ0gsQ0FBQzthQUNIO1NBQ0YsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsNkVBQTZFLEVBQUUsR0FBRyxFQUFFO1FBQ3JGLFFBQVEsQ0FBQyxxQkFBcUIsQ0FBQyx1QkFBdUIsRUFBRTtZQUN0RCxjQUFjLEVBQUU7Z0JBQ2QsU0FBUyxFQUFFLGtCQUFLLENBQUMsU0FBUyxDQUFDO29CQUN6QixrQkFBSyxDQUFDLFVBQVUsQ0FBQzt3QkFDZixNQUFNLEVBQUUsT0FBTzt3QkFDZixNQUFNLEVBQUUsa0JBQUssQ0FBQyxTQUFTLENBQUM7NEJBQ3RCLHFDQUFxQzt5QkFDdEMsQ0FBQztxQkFDSCxDQUFDO2lCQUNILENBQUM7YUFDSDtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgeyBUZW1wbGF0ZSwgTWF0Y2ggfSBmcm9tIFwiYXdzLWNkay1saWIvYXNzZXJ0aW9uc1wiO1xuaW1wb3J0IHsgVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24gfSBmcm9tIFwiLi4vbGliL2NvbnN0cnVjdHMvdXNhZ2UtaGlzdG9yeS1yZXBsaWNhdGlvblwiO1xuXG5mdW5jdGlvbiBidWlsZFRlbXBsYXRlKGFyY2hpdmVBY2NvdW50SWQ/OiBzdHJpbmcpOiBUZW1wbGF0ZSB7XG4gIGNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gIGNvbnN0IHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsIFwiVGVzdFN0YWNrXCIpO1xuICBjb25zdCBzb3VyY2VCdWNrZXQgPSBuZXcgczMuQnVja2V0KHN0YWNrLCBcIlNvdXJjZVwiLCB7IHZlcnNpb25lZDogdHJ1ZSB9KTtcbiAgY29uc3QgYXJjaGl2ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQoc3RhY2ssIFwiQXJjaGl2ZVwiLCB7IHZlcnNpb25lZDogdHJ1ZSB9KTtcbiAgbmV3IFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uKHN0YWNrLCBcIlJlcGxpY2F0aW9uXCIsIHtcbiAgICBzb3VyY2VCdWNrZXQsXG4gICAgYXJjaGl2ZUJ1Y2tldCxcbiAgICBhcmNoaXZlQWNjb3VudElkLFxuICB9KTtcbiAgcmV0dXJuIFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG59XG5cbmRlc2NyaWJlKFwiVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24g4oCUIHNhbWUtYWNjb3VudCBtb2RlXCIsICgpID0+IHtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIHRlbXBsYXRlID0gYnVpbGRUZW1wbGF0ZSgpOyAvLyBubyBhcmNoaXZlQWNjb3VudElkXG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGNyZWF0ZSBJQU0gcm9sZSB3aXRoIHMzLmFtYXpvbmF3cy5jb20gdHJ1c3RcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpSb2xlXCIsIHtcbiAgICAgIEFzc3VtZVJvbGVQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBQcmluY2lwYWw6IHsgU2VydmljZTogXCJzMy5hbWF6b25hd3MuY29tXCIgfSxcbiAgICAgICAgICAgIEFjdGlvbjogXCJzdHM6QXNzdW1lUm9sZVwiLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGdyYW50IHMzOkdldFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvbiBhbmQgczM6TGlzdEJ1Y2tldCBvbiBzb3VyY2UgYnVja2V0XCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OklBTTo6UG9saWN5XCIsIHtcbiAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgICBcInMzOkdldFJlcGxpY2F0aW9uQ29uZmlndXJhdGlvblwiLFxuICAgICAgICAgICAgICBcInMzOkxpc3RCdWNrZXRcIixcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGdyYW50IEdldE9iamVjdFZlcnNpb24qIGFjdGlvbnMgb24gc291cmNlIGJ1Y2tldCBvYmplY3RzXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OklBTTo6UG9saWN5XCIsIHtcbiAgICAgIFBvbGljeURvY3VtZW50OiB7XG4gICAgICAgIFN0YXRlbWVudDogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICBNYXRjaC5vYmplY3RMaWtlKHtcbiAgICAgICAgICAgIEVmZmVjdDogXCJBbGxvd1wiLFxuICAgICAgICAgICAgQWN0aW9uOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25Gb3JSZXBsaWNhdGlvblwiLFxuICAgICAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25BY2xcIixcbiAgICAgICAgICAgICAgXCJzMzpHZXRPYmplY3RWZXJzaW9uVGFnZ2luZ1wiLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXQoXCJzaG91bGQgZ3JhbnQgUmVwbGljYXRlT2JqZWN0LCBSZXBsaWNhdGVEZWxldGUsIFJlcGxpY2F0ZVRhZ3Mgb24gYXJjaGl2ZSBidWNrZXQgb2JqZWN0c1wiLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKFwiQVdTOjpJQU06OlBvbGljeVwiLCB7XG4gICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBFZmZlY3Q6IFwiQWxsb3dcIixcbiAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgXCJzMzpSZXBsaWNhdGVPYmplY3RcIixcbiAgICAgICAgICAgICAgXCJzMzpSZXBsaWNhdGVEZWxldGVcIixcbiAgICAgICAgICAgICAgXCJzMzpSZXBsaWNhdGVUYWdzXCIsXG4gICAgICAgICAgICBdKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBhZGQgYnVja2V0IHBvbGljeSBvbiBhcmNoaXZlIGJ1Y2tldCBhbGxvd2luZyByZXBsaWNhdGlvbiB3cml0ZXNcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFBvbGljeVwiLCB7XG4gICAgICBQb2xpY3lEb2N1bWVudDoge1xuICAgICAgICBTdGF0ZW1lbnQ6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBFZmZlY3Q6IFwiQWxsb3dcIixcbiAgICAgICAgICAgIEFjdGlvbjogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAgICAgICAgXCJzMzpSZXBsaWNhdGVPYmplY3RcIixcbiAgICAgICAgICAgICAgXCJzMzpSZXBsaWNhdGVEZWxldGVcIixcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIHNldCBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gb24gc291cmNlIGJ1Y2tldCB3aXRoIGZpbHRlciBwcmVmaXggJycgYW5kIFN0YXR1cyBFbmFibGVkXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgUmVwbGljYXRpb25Db25maWd1cmF0aW9uOiB7XG4gICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgRmlsdGVyOiB7IFByZWZpeDogXCJcIiB9LFxuICAgICAgICAgICAgU3RhdHVzOiBcIkVuYWJsZWRcIixcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBzZXQgRGVsZXRlTWFya2VyUmVwbGljYXRpb24gdG8gRGlzYWJsZWRcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBEZWxldGVNYXJrZXJSZXBsaWNhdGlvbjogeyBTdGF0dXM6IFwiRGlzYWJsZWRcIiB9LFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIE5PVCBpbmNsdWRlIEFjY291bnQgb3IgQWNjZXNzQ29udHJvbFRyYW5zbGF0aW9uIGluIHNhbWUtYWNjb3VudCBtb2RlXCIsICgpID0+IHtcbiAgICBjb25zdCByZXNvdXJjZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKFwiQVdTOjpTMzo6QnVja2V0XCIsIHtcbiAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgUmVwbGljYXRpb25Db25maWd1cmF0aW9uOiBNYXRjaC5vYmplY3RMaWtlKHt9KSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY29uc3QgYnVja2V0V2l0aFJlcGxpY2F0aW9uID0gT2JqZWN0LnZhbHVlcyhyZXNvdXJjZXMpWzBdIGFzIHtcbiAgICAgIFByb3BlcnRpZXM6IHsgUmVwbGljYXRpb25Db25maWd1cmF0aW9uOiB7IFJ1bGVzOiB7IERlc3RpbmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gfSB9O1xuICAgIH07XG4gICAgY29uc3QgZGVzdGluYXRpb24gPVxuICAgICAgYnVja2V0V2l0aFJlcGxpY2F0aW9uLlByb3BlcnRpZXMuUmVwbGljYXRpb25Db25maWd1cmF0aW9uLlJ1bGVzWzBdXG4gICAgICAgIC5EZXN0aW5hdGlvbjtcbiAgICBleHBlY3QoZGVzdGluYXRpb24pLm5vdC50b0hhdmVQcm9wZXJ0eShcIkFjY291bnRcIik7XG4gICAgZXhwZWN0KGRlc3RpbmF0aW9uKS5ub3QudG9IYXZlUHJvcGVydHkoXCJBY2Nlc3NDb250cm9sVHJhbnNsYXRpb25cIik7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKFwiVXNhZ2VIaXN0b3J5UmVwbGljYXRpb24g4oCUIGNyb3NzLWFjY291bnQgbW9kZVwiLCAoKSA9PiB7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG4gIGNvbnN0IGNyb3NzQWNjb3VudElkID0gXCIxMjM0NTY3ODkwMTJcIjtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIHRlbXBsYXRlID0gYnVpbGRUZW1wbGF0ZShjcm9zc0FjY291bnRJZCk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIHNldCBBY2NvdW50IGluIHJlcGxpY2F0aW9uIGRlc3RpbmF0aW9uXCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRcIiwge1xuICAgICAgUmVwbGljYXRpb25Db25maWd1cmF0aW9uOiB7XG4gICAgICAgIFJ1bGVzOiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgRGVzdGluYXRpb246IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgICBBY2NvdW50OiBjcm9zc0FjY291bnRJZCxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIHNldCBBY2Nlc3NDb250cm9sVHJhbnNsYXRpb24gT3duZXIgdG8gRGVzdGluYXRpb25cIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6UzM6OkJ1Y2tldFwiLCB7XG4gICAgICBSZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgUnVsZXM6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICBEZXN0aW5hdGlvbjogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgICAgIEFjY2Vzc0NvbnRyb2xUcmFuc2xhdGlvbjogeyBPd25lcjogXCJEZXN0aW5hdGlvblwiIH0sXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdChcInNob3VsZCBpbmNsdWRlIHMzOk9iamVjdE93bmVyT3ZlcnJpZGVUb0J1Y2tldE93bmVyIGluIElBTSBwb2xpY3lcIiwgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcyhcIkFXUzo6SUFNOjpQb2xpY3lcIiwge1xuICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgIFwiczM6T2JqZWN0T3duZXJPdmVycmlkZVRvQnVja2V0T3duZXJcIixcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIGl0KFwic2hvdWxkIGluY2x1ZGUgczM6T2JqZWN0T3duZXJPdmVycmlkZVRvQnVja2V0T3duZXIgaW4gYXJjaGl2ZSBidWNrZXQgcG9saWN5XCIsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoXCJBV1M6OlMzOjpCdWNrZXRQb2xpY3lcIiwge1xuICAgICAgUG9saWN5RG9jdW1lbnQ6IHtcbiAgICAgICAgU3RhdGVtZW50OiBNYXRjaC5hcnJheVdpdGgoW1xuICAgICAgICAgIE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgICAgRWZmZWN0OiBcIkFsbG93XCIsXG4gICAgICAgICAgICBBY3Rpb246IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgICAgICAgIFwiczM6T2JqZWN0T3duZXJPdmVycmlkZVRvQnVja2V0T3duZXJcIixcbiAgICAgICAgICAgIF0pLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=