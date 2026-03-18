import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Schedule, ScheduleExpression } from "aws-cdk-lib/aws-scheduler";
import { LambdaInvoke } from "aws-cdk-lib/aws-scheduler-targets";
import { Construct } from "constructs";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";
import { NagSuppressions } from "cdk-nag";

/**
 * DynamoDB Export Job construct.
 *
 * Purpose: Trigger a daily full DynamoDB-to-S3 export at JST 00:00 (UTC 15:00)
 * via EventBridge Scheduler. Uses DynamoDB native ExportTableToPointInTime API
 * (requires PITR to be enabled on the source table).
 *
 * Responsibilities: Python Lambda that calls ExportTableToPointInTime;
 * EventBridge Schedule cron(0 15 * * ? *); least-privilege IAM.
 *
 * Inputs: DynamoDbExportJobProps (table, bucket).
 * Outputs: function (for CloudWatch alarm attachment in verification-stack).
 */
export interface DynamoDbExportJobProps {
  /** UsageHistory DynamoDB table. Must have PITR enabled. */
  table: dynamodb.ITable;
  /** UsageHistory S3 bucket. Exports written to dynamodb-exports/ prefix. */
  bucket: s3.IBucket;
}

export class DynamoDbExportJob extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: DynamoDbExportJobProps) {
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
            tryBundle(outputDir: string): boolean {
              try {
                execSync("pip --version", { stdio: "pipe" });
                execSync(
                  `pip install --no-cache-dir -r ${path.join(lambdaPath, "requirements.txt")} -t ${outputDir} --quiet`,
                  { stdio: "pipe" }
                );
                const files = fs.readdirSync(lambdaPath);
                for (const file of files) {
                  const srcPath = path.join(lambdaPath, file);
                  const destPath = path.join(outputDir, file);
                  const stat = fs.statSync(srcPath);
                  if (stat.isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                  } else if (stat.isDirectory() && file !== "__pycache__") {
                    fs.cpSync(srcPath, destPath, { recursive: true });
                  }
                }
                return true;
              } catch {
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
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:ExportTableToPointInTime"],
        resources: [props.table.tableArn],
      })
    );

    // S3 write permissions — Lambda role holds all required permissions (no DynamoDB service principal)
    props.bucket.grantPut(this.function, "dynamodb-exports/*");
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["s3:AbortMultipartUpload"],
        resources: [`${props.bucket.bucketArn}/dynamodb-exports/*`],
      })
    );

    // EventBridge Scheduler: daily at JST 00:00 = UTC 15:00
    const schedulerInvokeRole = new iam.Role(this, "SchedulerInvokeRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      description: "Invoke role for DynamoDB export Lambda (EventBridge Scheduler target)",
    });
    this.function.grantInvoke(schedulerInvokeRole);

    NagSuppressions.addResourceSuppressions(
      schedulerInvokeRole,
      [
        {
          id: "AwsSolutions-IAM5",
          reason:
            "EventBridge Scheduler needs permission to invoke the Lambda across versions/aliases. " +
            "The Lambda invoke permission model uses function ARN patterns that may include `:*$` suffixes.",
        },
      ],
      true,
    );

    new Schedule(this, "DailySchedule", {
      schedule: ScheduleExpression.cron({ hour: "15", minute: "0" }),
      target: new LambdaInvoke(this.function, { role: schedulerInvokeRole }),
      description: "Daily DynamoDB usage-history export to S3 (JST 00:00)",
    });

    // cdk-nag suppressions:
    // - IAM4: Lambda uses AWS-managed basic execution policy for CloudWatch logs
    // - L1: runtime pinned to Python 3.11 (project baseline)
    // - IAM5: S3 multipart upload requires wildcard actions scoped to the export prefix
    if (this.function.role) {
      NagSuppressions.addResourceSuppressions(
        this.function.role,
        [
          {
            id: "AwsSolutions-IAM4",
            reason:
              "Lambda uses AWS-managed policy for basic logging permissions (AWSLambdaBasicExecutionRole).",
          },
          {
            id: "AwsSolutions-L1",
            reason:
              "Lambda runtime is pinned to Python 3.11 to match the project baseline. Runtime upgrades are handled separately.",
          },
          {
            id: "AwsSolutions-IAM5",
            reason:
              "S3 multipart upload operations use wildcard actions (Abort*, List*) as part of the AWS S3 API. " +
              "Permissions are scoped to the dynamodb-exports/ prefix in the usage-history bucket.",
          },
        ],
        true,
      );
    }

    NagSuppressions.addResourceSuppressions(
      this.function.node.defaultChild ?? this.function,
      [
        {
          id: "AwsSolutions-L1",
          reason:
            "Lambda runtime is pinned to Python 3.11 to match the project baseline. Runtime upgrades are handled separately.",
        },
      ],
    );
  }
}
