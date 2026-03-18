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
exports.DynamoDbExportJob = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const aws_scheduler_1 = require("aws-cdk-lib/aws-scheduler");
const aws_scheduler_targets_1 = require("aws-cdk-lib/aws-scheduler-targets");
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const cdk_nag_1 = require("cdk-nag");
class DynamoDbExportJob extends constructs_1.Construct {
    function;
    constructor(scope, id, props) {
        super(scope, id);
        const stack = cdk.Stack.of(this);
        const lambdaPath = path.join(__dirname, "../lambda/dynamodb-export-job");
        this.function = new lambda.Function(this, "Handler", {
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: "handler.lambda_handler",
            code: lambda.Code.fromAsset(lambdaPath, {
                bundling: {
                    image: lambda.Runtime.PYTHON_3_11.bundlingImage,
                    command: [
                        "bash",
                        "-c",
                        "pip install --no-cache-dir -r requirements.txt -t /asset-output && cp -r . /asset-output",
                    ],
                    local: {
                        tryBundle(outputDir) {
                            try {
                                (0, child_process_1.execSync)("pip --version", { stdio: "pipe" });
                                (0, child_process_1.execSync)(`pip install --no-cache-dir -r ${path.join(lambdaPath, "requirements.txt")} -t ${outputDir} --quiet`, { stdio: "pipe" });
                                const files = fs.readdirSync(lambdaPath);
                                for (const file of files) {
                                    const srcPath = path.join(lambdaPath, file);
                                    const destPath = path.join(outputDir, file);
                                    const stat = fs.statSync(srcPath);
                                    if (stat.isFile()) {
                                        fs.copyFileSync(srcPath, destPath);
                                    }
                                    else if (stat.isDirectory() && file !== "__pycache__") {
                                        fs.cpSync(srcPath, destPath, { recursive: true });
                                    }
                                }
                                return true;
                            }
                            catch {
                                return false;
                            }
                        },
                    },
                },
            }),
            timeout: cdk.Duration.seconds(60),
            environment: {
                TABLE_ARN: props.table.tableArn,
                EXPORT_BUCKET_NAME: props.bucket.bucketName,
                AWS_REGION_NAME: stack.region,
            },
        });
        // Least-privilege: ExportTableToPointInTime on the specific table only
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:ExportTableToPointInTime"],
            resources: [props.table.tableArn],
        }));
        // S3 write permissions — Lambda role holds all required permissions (no DynamoDB service principal)
        props.bucket.grantPut(this.function, "dynamodb-exports/*");
        this.function.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["s3:AbortMultipartUpload"],
            resources: [`${props.bucket.bucketArn}/dynamodb-exports/*`],
        }));
        // EventBridge Scheduler: daily at JST 00:00 = UTC 15:00
        const schedulerInvokeRole = new iam.Role(this, "SchedulerInvokeRole", {
            assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
            description: "Invoke role for DynamoDB export Lambda (EventBridge Scheduler target)",
        });
        this.function.grantInvoke(schedulerInvokeRole);
        cdk_nag_1.NagSuppressions.addResourceSuppressions(schedulerInvokeRole, [
            {
                id: "AwsSolutions-IAM5",
                reason: "EventBridge Scheduler needs permission to invoke the Lambda across versions/aliases. " +
                    "The Lambda invoke permission model uses function ARN patterns that may include `:*$` suffixes.",
            },
        ], true);
        new aws_scheduler_1.Schedule(this, "DailySchedule", {
            schedule: aws_scheduler_1.ScheduleExpression.cron({ hour: "15", minute: "0" }),
            target: new aws_scheduler_targets_1.LambdaInvoke(this.function, { role: schedulerInvokeRole }),
            description: "Daily DynamoDB usage-history export to S3 (JST 00:00)",
        });
        // cdk-nag suppressions:
        // - IAM4: Lambda uses AWS-managed basic execution policy for CloudWatch logs
        // - L1: runtime pinned to Python 3.11 (project baseline)
        // - IAM5: S3 multipart upload requires wildcard actions scoped to the export prefix
        if (this.function.role) {
            cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.role, [
                {
                    id: "AwsSolutions-IAM4",
                    reason: "Lambda uses AWS-managed policy for basic logging permissions (AWSLambdaBasicExecutionRole).",
                },
                {
                    id: "AwsSolutions-L1",
                    reason: "Lambda runtime is pinned to Python 3.11 to match the project baseline. Runtime upgrades are handled separately.",
                },
                {
                    id: "AwsSolutions-IAM5",
                    reason: "S3 multipart upload operations use wildcard actions (Abort*, List*) as part of the AWS S3 API. " +
                        "Permissions are scoped to the dynamodb-exports/ prefix in the usage-history bucket.",
                },
            ], true);
        }
        cdk_nag_1.NagSuppressions.addResourceSuppressions(this.function.node.defaultChild ?? this.function, [
            {
                id: "AwsSolutions-L1",
                reason: "Lambda runtime is pinned to Python 3.11 to match the project baseline. Runtime upgrades are handled separately.",
            },
        ]);
    }
}
exports.DynamoDbExportJob = DynamoDbExportJob;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGItZXhwb3J0LWpvYi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImR5bmFtb2RiLWV4cG9ydC1qb2IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQywrREFBaUQ7QUFFakQsNkRBQXlFO0FBQ3pFLDZFQUFpRTtBQUNqRSwyQ0FBdUM7QUFDdkMsMkNBQTZCO0FBQzdCLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFDekIscUNBQTBDO0FBc0IxQyxNQUFhLGlCQUFrQixTQUFRLHNCQUFTO0lBQzlCLFFBQVEsQ0FBa0I7SUFFMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE2QjtRQUNyRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ2pDLE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLCtCQUErQixDQUFDLENBQUM7UUFFekUsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRTtZQUNuRCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx3QkFBd0I7WUFDakMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRTtnQkFDdEMsUUFBUSxFQUFFO29CQUNSLEtBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQyxPQUFPLEVBQUU7d0JBQ1AsTUFBTTt3QkFDTixJQUFJO3dCQUNKLDBGQUEwRjtxQkFDM0Y7b0JBQ0QsS0FBSyxFQUFFO3dCQUNMLFNBQVMsQ0FBQyxTQUFp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QUFJLENBQUMsUUFBUSxFQUNoRDtZQUNFO2dCQUNFLEVBQUUsRUFBRSxpQkFBaUI7Z0JBQ3JCLE1BQU0sRUFDSixpSEFBaUg7YUFDcEg7U0FDRixDQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUE1SUQsOENBNElDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSBcImF3cy1jZGstbGliL2F3cy1keW5hbW9kYlwiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCB7IFNjaGVkdWxlLCBTY2hlZHVsZUV4cHJlc3Npb24gfSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXNjaGVkdWxlclwiO1xuaW1wb3J0IHsgTGFtYmRhSW52b2tlIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zY2hlZHVsZXItdGFyZ2V0c1wiO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSBcImNoaWxkX3Byb2Nlc3NcIjtcbmltcG9ydCAqIGFzIGZzIGZyb20gXCJmc1wiO1xuaW1wb3J0IHsgTmFnU3VwcHJlc3Npb25zIH0gZnJvbSBcImNkay1uYWdcIjtcblxuLyoqXG4gKiBEeW5hbW9EQiBFeHBvcnQgSm9iIGNvbnN0cnVjdC5cbiAqXG4gKiBQdXJwb3NlOiBUcmlnZ2VyIGEgZGFpbHkgZnVsbCBEeW5hbW9EQi10by1TMyBleHBvcnQgYXQgSlNUIDAwOjAwIChVVEMgMTU6MDApXG4gKiB2aWEgRXZlbnRCcmlkZ2UgU2NoZWR1bGVyLiBVc2VzIER5bmFtb0RCIG5hdGl2ZSBFeHBvcnRUYWJsZVRvUG9pbnRJblRpbWUgQVBJXG4gKiAocmVxdWlyZXMgUElUUiB0byBiZSBlbmFibGVkIG9uIHRoZSBzb3VyY2UgdGFibGUpLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IFB5dGhvbiBMYW1iZGEgdGhhdCBjYWxscyBFeHBvcnRUYWJsZVRvUG9pbnRJblRpbWU7XG4gKiBFdmVudEJyaWRnZSBTY2hlZHVsZSBjcm9uKDAgMTUgKiAqID8gKik7IGxlYXN0LXByaXZpbGVnZSBJQU0uXG4gKlxuICogSW5wdXRzOiBEeW5hbW9EYkV4cG9ydEpvYlByb3BzICh0YWJsZSwgYnVja2V0KS5cbiAqIE91dHB1dHM6IGZ1bmN0aW9uIChmb3IgQ2xvdWRXYXRjaCBhbGFybSBhdHRhY2htZW50IGluIHZlcmlmaWNhdGlvbi1zdGFjaykuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRHluYW1vRGJFeHBvcnRKb2JQcm9wcyB7XG4gIC8qKiBVc2FnZUhpc3RvcnkgRHluYW1vREIgdGFibGUuIE11c3QgaGF2ZSBQSVRSIGVuYWJsZWQuICovXG4gIHRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIC8qKiBVc2FnZUhpc3RvcnkgUzMgYnVja2V0LiBFeHBvcnRzIHdyaXR0ZW4gdG8gZHluYW1vZGItZXhwb3J0cy8gcHJlZml4LiAqL1xuICBidWNrZXQ6IHMzLklCdWNrZXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBEeW5hbW9EYkV4cG9ydEpvYiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBmdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEeW5hbW9EYkV4cG9ydEpvYlByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuICAgIGNvbnN0IGxhbWJkYVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYS9keW5hbW9kYi1leHBvcnQtam9iXCIpO1xuXG4gICAgdGhpcy5mdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQobGFtYmRhUGF0aCwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgIFwiYmFzaFwiLFxuICAgICAgICAgICAgXCItY1wiLFxuICAgICAgICAgICAgXCJwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLXIgLiAvYXNzZXQtb3V0cHV0XCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXCJwaXAgLS12ZXJzaW9uXCIsIHsgc3RkaW86IFwicGlwZVwiIH0pO1xuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgICAgYHBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yICR7cGF0aC5qb2luKGxhbWJkYVBhdGgsIFwicmVxdWlyZW1lbnRzLnR4dFwiKX0gLXQgJHtvdXRwdXREaXJ9IC0tcXVpZXRgLFxuICAgICAgICAgICAgICAgICAgeyBzdGRpbzogXCJwaXBlXCIgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRBQkxFX0FSTjogcHJvcHMudGFibGUudGFibGVBcm4sXG4gICAgICAgIEVYUE9SVF9CVUNLRVRfTkFNRTogcHJvcHMuYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIEFXU19SRUdJT05fTkFNRTogc3RhY2sucmVnaW9uLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExlYXN0LXByaXZpbGVnZTogRXhwb3J0VGFibGVUb1BvaW50SW5UaW1lIG9uIHRoZSBzcGVjaWZpYyB0YWJsZSBvbmx5XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiZHluYW1vZGI6RXhwb3J0VGFibGVUb1BvaW50SW5UaW1lXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy50YWJsZS50YWJsZUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTMyB3cml0ZSBwZXJtaXNzaW9ucyDigJQgTGFtYmRhIHJvbGUgaG9sZHMgYWxsIHJlcXVpcmVkIHBlcm1pc3Npb25zIChubyBEeW5hbW9EQiBzZXJ2aWNlIHByaW5jaXBhbClcbiAgICBwcm9wcy5idWNrZXQuZ3JhbnRQdXQodGhpcy5mdW5jdGlvbiwgXCJkeW5hbW9kYi1leHBvcnRzLypcIik7XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiczM6QWJvcnRNdWx0aXBhcnRVcGxvYWRcIl0sXG4gICAgICAgIHJlc291cmNlczogW2Ake3Byb3BzLmJ1Y2tldC5idWNrZXRBcm59L2R5bmFtb2RiLWV4cG9ydHMvKmBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2UgU2NoZWR1bGVyOiBkYWlseSBhdCBKU1QgMDA6MDAgPSBVVEMgMTU6MDBcbiAgICBjb25zdCBzY2hlZHVsZXJJbnZva2VSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiU2NoZWR1bGVySW52b2tlUm9sZVwiLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcInNjaGVkdWxlci5hbWF6b25hd3MuY29tXCIpLFxuICAgICAgZGVzY3JpcHRpb246IFwiSW52b2tlIHJvbGUgZm9yIER5bmFtb0RCIGV4cG9ydCBMYW1iZGEgKEV2ZW50QnJpZGdlIFNjaGVkdWxlciB0YXJnZXQpXCIsXG4gICAgfSk7XG4gICAgdGhpcy5mdW5jdGlvbi5ncmFudEludm9rZShzY2hlZHVsZXJJbnZva2VSb2xlKTtcblxuICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgIHNjaGVkdWxlckludm9rZVJvbGUsXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtSUFNNVwiLFxuICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgIFwiRXZlbnRCcmlkZ2UgU2NoZWR1bGVyIG5lZWRzIHBlcm1pc3Npb24gdG8gaW52b2tlIHRoZSBMYW1iZGEgYWNyb3NzIHZlcnNpb25zL2FsaWFzZXMuIFwiICtcbiAgICAgICAgICAgIFwiVGhlIExhbWJkYSBpbnZva2UgcGVybWlzc2lvbiBtb2RlbCB1c2VzIGZ1bmN0aW9uIEFSTiBwYXR0ZXJucyB0aGF0IG1heSBpbmNsdWRlIGA6KiRgIHN1ZmZpeGVzLlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRydWUsXG4gICAgKTtcblxuICAgIG5ldyBTY2hlZHVsZSh0aGlzLCBcIkRhaWx5U2NoZWR1bGVcIiwge1xuICAgICAgc2NoZWR1bGU6IFNjaGVkdWxlRXhwcmVzc2lvbi5jcm9uKHsgaG91cjogXCIxNVwiLCBtaW51dGU6IFwiMFwiIH0pLFxuICAgICAgdGFyZ2V0OiBuZXcgTGFtYmRhSW52b2tlKHRoaXMuZnVuY3Rpb24sIHsgcm9sZTogc2NoZWR1bGVySW52b2tlUm9sZSB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkRhaWx5IER5bmFtb0RCIHVzYWdlLWhpc3RvcnkgZXhwb3J0IHRvIFMzIChKU1QgMDA6MDApXCIsXG4gICAgfSk7XG5cbiAgICAvLyBjZGstbmFnIHN1cHByZXNzaW9uczpcbiAgICAvLyAtIElBTTQ6IExhbWJkYSB1c2VzIEFXUy1tYW5hZ2VkIGJhc2ljIGV4ZWN1dGlvbiBwb2xpY3kgZm9yIENsb3VkV2F0Y2ggbG9nc1xuICAgIC8vIC0gTDE6IHJ1bnRpbWUgcGlubmVkIHRvIFB5dGhvbiAzLjExIChwcm9qZWN0IGJhc2VsaW5lKVxuICAgIC8vIC0gSUFNNTogUzMgbXVsdGlwYXJ0IHVwbG9hZCByZXF1aXJlcyB3aWxkY2FyZCBhY3Rpb25zIHNjb3BlZCB0byB0aGUgZXhwb3J0IHByZWZpeFxuICAgIGlmICh0aGlzLmZ1bmN0aW9uLnJvbGUpIHtcbiAgICAgIE5hZ1N1cHByZXNzaW9ucy5hZGRSZXNvdXJjZVN1cHByZXNzaW9ucyhcbiAgICAgICAgdGhpcy5mdW5jdGlvbi5yb2xlLFxuICAgICAgICBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgaWQ6IFwiQXdzU29sdXRpb25zLUlBTTRcIixcbiAgICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgICAgXCJMYW1iZGEgdXNlcyBBV1MtbWFuYWdlZCBwb2xpY3kgZm9yIGJhc2ljIGxvZ2dpbmcgcGVybWlzc2lvbnMgKEFXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZSkuXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtTDFcIixcbiAgICAgICAgICAgIHJlYXNvbjpcbiAgICAgICAgICAgICAgXCJMYW1iZGEgcnVudGltZSBpcyBwaW5uZWQgdG8gUHl0aG9uIDMuMTEgdG8gbWF0Y2ggdGhlIHByb2plY3QgYmFzZWxpbmUuIFJ1bnRpbWUgdXBncmFkZXMgYXJlIGhhbmRsZWQgc2VwYXJhdGVseS5cIixcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGlkOiBcIkF3c1NvbHV0aW9ucy1JQU01XCIsXG4gICAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICAgIFwiUzMgbXVsdGlwYXJ0IHVwbG9hZCBvcGVyYXRpb25zIHVzZSB3aWxkY2FyZCBhY3Rpb25zIChBYm9ydCosIExpc3QqKSBhcyBwYXJ0IG9mIHRoZSBBV1MgUzMgQVBJLiBcIiArXG4gICAgICAgICAgICAgIFwiUGVybWlzc2lvbnMgYXJlIHNjb3BlZCB0byB0aGUgZHluYW1vZGItZXhwb3J0cy8gcHJlZml4IGluIHRoZSB1c2FnZS1oaXN0b3J5IGJ1Y2tldC5cIixcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICB0cnVlLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBOYWdTdXBwcmVzc2lvbnMuYWRkUmVzb3VyY2VTdXBwcmVzc2lvbnMoXG4gICAgICB0aGlzLmZ1bmN0aW9uLm5vZGUuZGVmYXVsdENoaWxkID8/IHRoaXMuZnVuY3Rpb24sXG4gICAgICBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogXCJBd3NTb2x1dGlvbnMtTDFcIixcbiAgICAgICAgICByZWFzb246XG4gICAgICAgICAgICBcIkxhbWJkYSBydW50aW1lIGlzIHBpbm5lZCB0byBQeXRob24gMy4xMSB0byBtYXRjaCB0aGUgcHJvamVjdCBiYXNlbGluZS4gUnVudGltZSB1cGdyYWRlcyBhcmUgaGFuZGxlZCBzZXBhcmF0ZWx5LlwiLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICApO1xuICB9XG59XG4iXX0=