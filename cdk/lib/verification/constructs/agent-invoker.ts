import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
import * as path from "path";
import { execSync } from "child_process";
import * as fs from "fs";

export interface AgentInvokerProps {
  /** SQS queue for agent invocation requests (agent-invocation-request). */
  agentInvocationQueue: sqs.IQueue;
  /** ARN of the Verification Agent Runtime to invoke. */
  verificationAgentArn: string;
}

/**
 * Agent Invoker Lambda (016): triggered by SQS, calls InvokeAgentRuntime(Verification Agent).
 * Timeout 900s to allow long-running agent execution; SQS visibility is 900s.
 */
export class AgentInvoker extends Construct {
  public readonly function: lambda.Function;

  constructor(scope: Construct, id: string, props: AgentInvokerProps) {
    super(scope, id);

    const stack = cdk.Stack.of(this);
    const lambdaPath = path.join(__dirname, "../lambda/agent-invoker");

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
      timeout: cdk.Duration.seconds(900),
      environment: {
        VERIFICATION_AGENT_ARN: props.verificationAgentArn,
        AWS_REGION_NAME: stack.region,
      },
    });

    // Grant InvokeAgentRuntime on Verification Agent runtime and its DEFAULT endpoint.
    // 026 US1 (T007): Least privilege — scoped to specific ARNs per audit-iam-bedrock.md.
    const runtimeEndpointArn = `${props.verificationAgentArn}/runtime-endpoint/DEFAULT`;
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock-agentcore:InvokeAgentRuntime"],
        resources: [props.verificationAgentArn, runtimeEndpointArn],
      })
    );

    // Grant SQS consume permissions
    props.agentInvocationQueue.grantConsumeMessages(this.function);

    // SQS event source: batch size 1 per research (long-running per message)
    this.function.addEventSource(
      new lambdaEventSources.SqsEventSource(props.agentInvocationQueue, {
        batchSize: 1,
      })
    );
  }
}
