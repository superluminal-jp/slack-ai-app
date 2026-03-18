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
        new aws_scheduler_1.Schedule(this, "DailySchedule", {
            schedule: aws_scheduler_1.ScheduleExpression.cron({ hour: "15", minute: "0" }),
            target: new aws_scheduler_targets_1.LambdaInvoke(this.function),
            description: "Daily DynamoDB usage-history export to S3 (JST 00:00)",
        });
    }
}
exports.DynamoDbExportJob = DynamoDbExportJob;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZHluYW1vZGItZXhwb3J0LWpvYi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImR5bmFtb2RiLWV4cG9ydC1qb2IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHlEQUEyQztBQUMzQywrREFBaUQ7QUFFakQsNkRBQXlFO0FBQ3pFLDZFQUFpRTtBQUNqRSwyQ0FBdUM7QUFDdkMsMkNBQTZCO0FBQzdCLGlEQUF5QztBQUN6Qyx1Q0FBeUI7QUFzQnpCLE1BQWEsaUJBQWtCLFNBQVEsc0JBQVM7SUFDOUIsUUFBUSxDQUFrQjtJQUUxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTZCO1FBQ3JFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsTUFBTSxLQUFLLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakMsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsK0JBQStCLENBQUMsQ0FBQztRQUV6RSxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ25ELE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLHdCQUF3QjtZQUNqQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxFQUFFO2dCQUN0QyxRQUFRLEVBQUU7b0JBQ1IsS0FBSyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGFBQWE7b0JBQy9DLE9BQU8sRUFBRTt3QkFDUCxNQUFNO3dCQUNOLElBQUk7d0JBQ0osMEZBQTBGO3FCQUMzRjtvQkFDRCxLQUFLLEVBQUU7d0JBQ0wsU0FBUyxDQUFDLFNBQWlCOzRCQUN6QixJQUFJ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QUFDO1lBQ3ZDLFdBQVcsRUFBRSx1REFBdUQ7U0FDckUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakZELDhDQWlGQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcbmltcG9ydCAqIGFzIGlhbSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgeyBTY2hlZHVsZSwgU2NoZWR1bGVFeHByZXNzaW9uIH0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zY2hlZHVsZXJcIjtcbmltcG9ydCB7IExhbWJkYUludm9rZSB9IGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc2NoZWR1bGVyLXRhcmdldHNcIjtcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gXCJjb25zdHJ1Y3RzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBleGVjU3luYyB9IGZyb20gXCJjaGlsZF9wcm9jZXNzXCI7XG5pbXBvcnQgKiBhcyBmcyBmcm9tIFwiZnNcIjtcblxuLyoqXG4gKiBEeW5hbW9EQiBFeHBvcnQgSm9iIGNvbnN0cnVjdCAoMDQwKS5cbiAqXG4gKiBQdXJwb3NlOiBUcmlnZ2VyIGEgZGFpbHkgZnVsbCBEeW5hbW9EQi10by1TMyBleHBvcnQgYXQgSlNUIDAwOjAwIChVVEMgMTU6MDApXG4gKiB2aWEgRXZlbnRCcmlkZ2UgU2NoZWR1bGVyLiBVc2VzIER5bmFtb0RCIG5hdGl2ZSBFeHBvcnRUYWJsZVRvUG9pbnRJblRpbWUgQVBJXG4gKiAocmVxdWlyZXMgUElUUiB0byBiZSBlbmFibGVkIG9uIHRoZSBzb3VyY2UgdGFibGUpLlxuICpcbiAqIFJlc3BvbnNpYmlsaXRpZXM6IFB5dGhvbiBMYW1iZGEgdGhhdCBjYWxscyBFeHBvcnRUYWJsZVRvUG9pbnRJblRpbWU7XG4gKiBFdmVudEJyaWRnZSBTY2hlZHVsZSBjcm9uKDAgMTUgKiAqID8gKik7IGxlYXN0LXByaXZpbGVnZSBJQU0uXG4gKlxuICogSW5wdXRzOiBEeW5hbW9EYkV4cG9ydEpvYlByb3BzICh0YWJsZSwgYnVja2V0KS5cbiAqIE91dHB1dHM6IGZ1bmN0aW9uIChmb3IgQ2xvdWRXYXRjaCBhbGFybSBhdHRhY2htZW50IGluIHZlcmlmaWNhdGlvbi1zdGFjaykuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRHluYW1vRGJFeHBvcnRKb2JQcm9wcyB7XG4gIC8qKiBVc2FnZUhpc3RvcnkgRHluYW1vREIgdGFibGUuIE11c3QgaGF2ZSBQSVRSIGVuYWJsZWQuICovXG4gIHRhYmxlOiBkeW5hbW9kYi5JVGFibGU7XG4gIC8qKiBVc2FnZUhpc3RvcnkgUzMgYnVja2V0LiBFeHBvcnRzIHdyaXR0ZW4gdG8gZHluYW1vZGItZXhwb3J0cy8gcHJlZml4LiAqL1xuICBidWNrZXQ6IHMzLklCdWNrZXQ7XG59XG5cbmV4cG9ydCBjbGFzcyBEeW5hbW9EYkV4cG9ydEpvYiBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBmdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBEeW5hbW9EYkV4cG9ydEpvYlByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIGNvbnN0IHN0YWNrID0gY2RrLlN0YWNrLm9mKHRoaXMpO1xuICAgIGNvbnN0IGxhbWJkYVBhdGggPSBwYXRoLmpvaW4oX19kaXJuYW1lLCBcIi4uL2xhbWJkYS9keW5hbW9kYi1leHBvcnQtam9iXCIpO1xuXG4gICAgdGhpcy5mdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJIYW5kbGVyXCIsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxuICAgICAgaGFuZGxlcjogXCJoYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQobGFtYmRhUGF0aCwge1xuICAgICAgICBidW5kbGluZzoge1xuICAgICAgICAgIGltYWdlOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMS5idW5kbGluZ0ltYWdlLFxuICAgICAgICAgIGNvbW1hbmQ6IFtcbiAgICAgICAgICAgIFwiYmFzaFwiLFxuICAgICAgICAgICAgXCItY1wiLFxuICAgICAgICAgICAgXCJwaXAgaW5zdGFsbCAtLW5vLWNhY2hlLWRpciAtciByZXF1aXJlbWVudHMudHh0IC10IC9hc3NldC1vdXRwdXQgJiYgY3AgLXIgLiAvYXNzZXQtb3V0cHV0XCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgICBsb2NhbDoge1xuICAgICAgICAgICAgdHJ5QnVuZGxlKG91dHB1dERpcjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgZXhlY1N5bmMoXCJwaXAgLS12ZXJzaW9uXCIsIHsgc3RkaW86IFwicGlwZVwiIH0pO1xuICAgICAgICAgICAgICAgIGV4ZWNTeW5jKFxuICAgICAgICAgICAgICAgICAgYHBpcCBpbnN0YWxsIC0tbm8tY2FjaGUtZGlyIC1yICR7cGF0aC5qb2luKGxhbWJkYVBhdGgsIFwicmVxdWlyZW1lbnRzLnR4dFwiKX0gLXQgJHtvdXRwdXREaXJ9IC0tcXVpZXRgLFxuICAgICAgICAgICAgICAgICAgeyBzdGRpbzogXCJwaXBlXCIgfVxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhsYW1iZGFQYXRoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IHNyY1BhdGggPSBwYXRoLmpvaW4obGFtYmRhUGF0aCwgZmlsZSk7XG4gICAgICAgICAgICAgICAgICBjb25zdCBkZXN0UGF0aCA9IHBhdGguam9pbihvdXRwdXREaXIsIGZpbGUpO1xuICAgICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZzLnN0YXRTeW5jKHNyY1BhdGgpO1xuICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNGaWxlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZnMuY29weUZpbGVTeW5jKHNyY1BhdGgsIGRlc3RQYXRoKTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIGZpbGUgIT09IFwiX19weWNhY2hlX19cIikge1xuICAgICAgICAgICAgICAgICAgICBmcy5jcFN5bmMoc3JjUGF0aCwgZGVzdFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDYwKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRBQkxFX0FSTjogcHJvcHMudGFibGUudGFibGVBcm4sXG4gICAgICAgIEVYUE9SVF9CVUNLRVRfTkFNRTogcHJvcHMuYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIEFXU19SRUdJT05fTkFNRTogc3RhY2sucmVnaW9uLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIExlYXN0LXByaXZpbGVnZTogRXhwb3J0VGFibGVUb1BvaW50SW5UaW1lIG9uIHRoZSBzcGVjaWZpYyB0YWJsZSBvbmx5XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiZHluYW1vZGI6RXhwb3J0VGFibGVUb1BvaW50SW5UaW1lXCJdLFxuICAgICAgICByZXNvdXJjZXM6IFtwcm9wcy50YWJsZS50YWJsZUFybl0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBTMyB3cml0ZSBwZXJtaXNzaW9ucyDigJQgTGFtYmRhIHJvbGUgaG9sZHMgYWxsIHJlcXVpcmVkIHBlcm1pc3Npb25zIChubyBEeW5hbW9EQiBzZXJ2aWNlIHByaW5jaXBhbClcbiAgICBwcm9wcy5idWNrZXQuZ3JhbnRQdXQodGhpcy5mdW5jdGlvbiwgXCJkeW5hbW9kYi1leHBvcnRzLypcIik7XG4gICAgdGhpcy5mdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgYWN0aW9uczogW1wiczM6QWJvcnRNdWx0aXBhcnRVcGxvYWRcIl0sXG4gICAgICAgIHJlc291cmNlczogW2Ake3Byb3BzLmJ1Y2tldC5idWNrZXRBcm59L2R5bmFtb2RiLWV4cG9ydHMvKmBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gRXZlbnRCcmlkZ2UgU2NoZWR1bGVyOiBkYWlseSBhdCBKU1QgMDA6MDAgPSBVVEMgMTU6MDBcbiAgICBuZXcgU2NoZWR1bGUodGhpcywgXCJEYWlseVNjaGVkdWxlXCIsIHtcbiAgICAgIHNjaGVkdWxlOiBTY2hlZHVsZUV4cHJlc3Npb24uY3Jvbih7IGhvdXI6IFwiMTVcIiwgbWludXRlOiBcIjBcIiB9KSxcbiAgICAgIHRhcmdldDogbmV3IExhbWJkYUludm9rZSh0aGlzLmZ1bmN0aW9uKSxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkRhaWx5IER5bmFtb0RCIHVzYWdlLWhpc3RvcnkgZXhwb3J0IHRvIFMzIChKU1QgMDA6MDApXCIsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==