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
    new Schedule(this, "DailySchedule", {
      schedule: ScheduleExpression.cron({ hour: "15", minute: "0" }),
      target: new LambdaInvoke(this.function),
      description: "Daily DynamoDB usage-history export to S3 (JST 00:00)",
    });
  }
}
