#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ExecutionStack } from "../lib/execution-stack";
import { VerificationStack } from "../lib/verification-stack";
import { DeploymentMode } from "../lib/types/stack-config";

const app = new cdk.App();

// Get configuration from context
const region = app.node.tryGetContext("awsRegion") || "ap-northeast-1";
const deploymentMode: DeploymentMode =
  app.node.tryGetContext("deploymentMode") || "split";
const verificationStackName =
  app.node.tryGetContext("verificationStackName") || "SlackAI-Verification";
const executionStackName =
  app.node.tryGetContext("executionStackName") || "SlackAI-Execution";

// Cross-account configuration (optional)
const verificationAccountId =
  app.node.tryGetContext("verificationAccountId") || "";
const executionAccountId = app.node.tryGetContext("executionAccountId") || "";
const verificationLambdaRoleArn =
  app.node.tryGetContext("verificationLambdaRoleArn") || "";
const executionApiUrl = app.node.tryGetContext("executionApiUrl") || "";

// Environment configuration
const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: region,
};

// Get execution API ARN from URL (for IAM policy)
function getApiArnFromUrl(
  apiUrl: string,
  region: string,
  account?: string
): string {
  if (!apiUrl) return "";
  // Extract API ID from URL: https://{api-id}.execute-api.{region}.amazonaws.com/prod/
  const match = apiUrl.match(/https:\/\/([^.]+)\.execute-api\./);
  if (match && match[1]) {
    const apiId = match[1];
    const accountId = account || process.env.CDK_DEFAULT_ACCOUNT || "*";
    return `arn:aws:execute-api:${region}:${accountId}:${apiId}/*`;
  }
  return "";
}

/**
 * Deployment Architecture:
 *
 * The application uses two independent stacks that can be deployed separately:
 * - ExecutionStack: BedrockProcessor + API Gateway
 * - VerificationStack: SlackEventHandler + DynamoDB + Secrets
 *
 * Deploy order: ExecutionStack → VerificationStack → ExecutionStack (update)
 *
 * Cross-account deployment is supported by setting verificationAccountId and executionAccountId.
 * If both account IDs are the same (or not set), same-account deployment is used.
 */

// Validate deployment mode (for backward compatibility)
if (
  deploymentMode &&
  deploymentMode !== "split" &&
  deploymentMode !== "cross-account"
) {
  throw new Error(
    `Invalid deploymentMode: ${deploymentMode}. Must be "split" or "cross-account".`
  );
}

// Determine environments based on account IDs (cross-account if different accounts specified)
const executionEnv = executionAccountId
  ? { account: executionAccountId, region: region }
  : defaultEnv;
const verificationEnv = verificationAccountId
  ? { account: verificationAccountId, region: region }
  : defaultEnv;

// Create Execution Stack
new ExecutionStack(app, executionStackName, {
  env: executionEnv,
  verificationLambdaRoleArn: verificationLambdaRoleArn || undefined,
  verificationAccountId: verificationAccountId || undefined,
});

// Create Verification Stack (requires Execution API URL from first deployment)
if (executionApiUrl) {
  const executionApiArn = getApiArnFromUrl(
    executionApiUrl,
    region,
    executionAccountId || process.env.CDK_DEFAULT_ACCOUNT
  );

  new VerificationStack(app, verificationStackName, {
    env: verificationEnv,
    executionApiUrl: executionApiUrl,
    executionApiArn: executionApiArn,
    executionAccountId: executionAccountId || undefined,
  });
} else {
  // If no API URL, only synthesize Execution Stack
  // User will need to deploy Execution Stack first, get URL, then re-run
  console.log(`
================================================================================
DEPLOYMENT - STEP 1

Execution Stack will be created. After deployment:

1. Get the ExecutionApiUrl from stack outputs:
   npx cdk deploy ${executionStackName}

2. Set the URL in cdk.json or environment:
   "executionApiUrl": "<URL from step 1>"

3. Re-run to create Verification Stack:
   npx cdk deploy ${verificationStackName}

4. Get VerificationLambdaRoleArn from stack outputs and update Execution Stack:
   "verificationLambdaRoleArn": "<ARN from step 3>"
   npx cdk deploy ${executionStackName}

================================================================================
  `);
}
