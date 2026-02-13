import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

/**
 * Slack Poster construct (019): SQS queue + Lambda for posting messages to Slack.
 *
 * Purpose: Verification Agent sends post requests to this queue; Lambda consumes and calls Slack API.
 * Decouples agent from Slack API and allows retries.
 *
 * Responsibilities: Create SQS queue and Lambda; Lambda has Slack OAuth token and posts to channels.
 *
 * Inputs: SlackPosterProps (stackName for queue naming).
 *
 * Outputs: queue, function.
 */
export interface SlackPosterProps {
  /** Stack name for queue naming */
  stackName: string;
}

export class SlackPoster extends Construct {
  public readonly queue: sqs.IQueue;
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: SlackPosterProps) {
    super(scope, id);

    const lambdaPath = path.join(__dirname, "../lambda/slack-poster");

    this.queue = new sqs.Queue(this, "SlackPostRequest", {
      queueName: `${props.stackName}-slack-post-request`,
      retentionPeriod: cdk.Duration.days(1),
      visibilityTimeout: cdk.Duration.seconds(60),
    });

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
      timeout: cdk.Duration.seconds(30),
    });

    this.queue.grantConsumeMessages(this.function);
    this.function.addEventSource(
      new lambdaEventSources.SqsEventSource(this.queue, { batchSize: 10 })
    );
  }
}
