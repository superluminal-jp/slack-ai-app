#!/usr/bin/env node
/**
 * CDK Application Entry Point
 *
 * This file defines the CDK application structure and stack instantiation.
 * It handles configuration loading, validation, and stack creation for both
 * ExecutionStack and VerificationStack.
 *
 * @module cdk/bin/cdk
 */

import * as cdk from "aws-cdk-lib";
import * as path from "path";
import { ExecutionStack } from "../lib/execution-stack";
import { VerificationStack } from "../lib/verification-stack";
import {
  loadCdkConfig,
  applyEnvOverrides,
  CdkConfig,
} from "../lib/types/cdk-config";

// Constants
const VALID_ENVIRONMENTS = ["dev", "prod"] as const;
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";

type DeploymentEnvironment = (typeof VALID_ENVIRONMENTS)[number];

const app = new cdk.App();

/**
 * Get and validate deployment environment
 *
 * Priority: 1. DEPLOYMENT_ENV environment variable, 2. cdk.json context, 3. default
 *
 * @returns Validated deployment environment
 * @throws {Error} If deployment environment is invalid
 */
function getDeploymentEnvironment(): DeploymentEnvironment {
  const deploymentEnvRaw =
    process.env.DEPLOYMENT_ENV ||
    app.node.tryGetContext("deploymentEnv") ||
    DEFAULT_ENVIRONMENT;

  const deploymentEnv = deploymentEnvRaw
    .toLowerCase()
    .trim() as DeploymentEnvironment;

  if (!VALID_ENVIRONMENTS.includes(deploymentEnv)) {
    throw new Error(
      `Invalid deployment environment '${deploymentEnvRaw}'. ` +
        `Must be one of: ${VALID_ENVIRONMENTS.join(", ")}`
    );
  }

  // Warn if using default
  if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
    console.warn(
      `[WARNING] DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}' environment.`
    );
  }

  return deploymentEnv;
}

const deploymentEnv = getDeploymentEnvironment();

/**
 * Load configuration from files with fallback to context/defaults
 *
 * Priority: 1. Command-line context (--context), 2. Config files, 3. Defaults
 *
 * @param env - Deployment environment
 * @returns Configuration object or null if loading failed
 */
function loadConfiguration(env: DeploymentEnvironment): CdkConfig | null {
  try {
    const cdkDir = path.resolve(__dirname, "..");
    const fileConfig = loadCdkConfig(env, cdkDir);
    return applyEnvOverrides(fileConfig);
  } catch (error) {
    // Fallback to context-based configuration for backward compatibility
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(
      `[WARNING] Failed to load configuration file: ${errorMessage}`
    );
    console.warn(`[WARNING] Falling back to cdk.json context or defaults.`);
    return null;
  }
}

const config = loadConfiguration(deploymentEnv);

/**
 * Get configuration value with priority: context > config file > default
 *
 * @param key - Configuration key
 * @param defaultValue - Default value if not found
 * @returns Configuration value
 */
function getConfigValue<T>(key: string, defaultValue: T): T {
  const contextValue = app.node.tryGetContext(key);
  if (contextValue !== undefined) {
    return contextValue as T;
  }
  if (config && key in config) {
    return (config as unknown as Record<string, unknown>)[key] as T;
  }
  return defaultValue;
}

/**
 * Get configuration value as string with empty string handling
 *
 * @param key - Configuration key
 * @param defaultValue - Default value if not found
 * @returns Configuration value or empty string
 */
function getConfigString(key: string, defaultValue = ""): string {
  const value = getConfigValue<string>(key, defaultValue);
  return value || "";
}

// Get configuration values with priority: context > config file > defaults
const region = getConfigValue("awsRegion", DEFAULT_REGION);

// Base stack names (without environment suffix)
const baseVerificationStackName = getConfigValue(
  "verificationStackName",
  "SlackAI-Verification"
);
const baseExecutionStackName = getConfigValue(
  "executionStackName",
  "SlackAI-Execution"
);

// Add environment suffix to stack names
const environmentSuffix = deploymentEnv === "prod" ? "Prod" : "Dev";
const verificationStackName = `${baseVerificationStackName}-${environmentSuffix}`;
const executionStackName = `${baseExecutionStackName}-${environmentSuffix}`;

// Cross-account configuration (optional)
const verificationAccountId = getConfigString("verificationAccountId");
const executionAccountId = getConfigString("executionAccountId");
const verificationLambdaRoleArn = getConfigString("verificationLambdaRoleArn");
const executionApiUrl = getConfigString("executionApiUrl");
const executionResponseQueueUrl = getConfigString("executionResponseQueueUrl");

/**
 * Set loaded config values to CDK context for backward compatibility
 * This ensures that app.node.tryGetContext() calls work as expected
 *
 * @param config - Configuration object
 */
function setContextFromConfig(config: CdkConfig | null): void {
  if (!config) {
    return;
  }

  // Required configuration
  app.node.setContext("awsRegion", region);
  app.node.setContext("bedrockModelId", config.bedrockModelId);
  app.node.setContext("deploymentEnv", deploymentEnv);
  app.node.setContext("verificationStackName", baseVerificationStackName);
  app.node.setContext("executionStackName", baseExecutionStackName);
  app.node.setContext("verificationAccountId", verificationAccountId);
  app.node.setContext("executionAccountId", executionAccountId);

  // Optional configuration (only set if provided)
  if (verificationLambdaRoleArn) {
    app.node.setContext("verificationLambdaRoleArn", verificationLambdaRoleArn);
  }
  if (executionApiUrl) {
    app.node.setContext("executionApiUrl", executionApiUrl);
  }
  if (config.slackBotToken) {
    app.node.setContext("slackBotToken", config.slackBotToken);
  }
  if (config.slackSigningSecret) {
    app.node.setContext("slackSigningSecret", config.slackSigningSecret);
  }
}

setContextFromConfig(config);

/**
 * Get default CDK environment configuration
 *
 * @param region - AWS region
 * @returns CDK environment object
 */
function getDefaultEnv(region: string): cdk.Environment {
  return {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  };
}

const defaultEnv = getDefaultEnv(region);

/**
 * Extract API Gateway ARN from URL (for IAM policy)
 *
 * @param apiUrl - API Gateway URL (e.g., https://{api-id}.execute-api.{region}.amazonaws.com/prod/)
 * @param region - AWS region
 * @param account - AWS account ID (optional)
 * @returns API Gateway ARN or empty string if URL is invalid
 */
function getApiArnFromUrl(
  apiUrl: string,
  region: string,
  account?: string
): string {
  if (!apiUrl) {
    return "";
  }

  // Extract API ID from URL: https://{api-id}.execute-api.{region}.amazonaws.com/prod/
  const match = apiUrl.match(/https:\/\/([^.]+)\.execute-api\./);
  if (!match || !match[1]) {
    return "";
  }

  const apiId = match[1];
  const accountId = account || process.env.CDK_DEFAULT_ACCOUNT || "*";
  return `arn:aws:execute-api:${region}:${accountId}:${apiId}/*`;
}

/**
 * Deployment Architecture:
 *
 * The application uses two independent stacks that can be deployed separately:
 * - ExecutionStack: BedrockProcessor + API Gateway
 * - VerificationStack: SlackEventHandler + DynamoDB + Secrets
 *
 * Stacks can be deployed independently using CDK CLI:
 *   - Deploy ExecutionStack: npx cdk deploy SlackAI-Execution-{Env}
 *   - Deploy VerificationStack: npx cdk deploy SlackAI-Verification-{Env}
 *
 * Deploy order (for initial setup):
 *   1. ExecutionStack → Get ExecutionApiUrl
 *   2. VerificationStack (with ExecutionApiUrl) → Get VerificationLambdaRoleArn
 *   3. ExecutionStack (update with VerificationLambdaRoleArn)
 *
 * Cross-account deployment is supported by setting verificationAccountId and executionAccountId.
 * If both account IDs are the same (or not set), same-account deployment is used.
 *
 * Stack independence:
 * - ExecutionStack can be deployed without VerificationStack
 * - VerificationStack requires ExecutionApiUrl (from ExecutionStack) to be configured
 * - If ExecutionApiUrl is not configured, only ExecutionStack will be synthesized
 */

/**
 * Determine CDK environment based on account ID
 *
 * @param accountId - AWS account ID (optional)
 * @param region - AWS region
 * @param defaultEnv - Default environment configuration
 * @returns CDK environment object
 */
function getStackEnvironment(
  accountId: string,
  region: string,
  defaultEnv: cdk.Environment
): cdk.Environment {
  return accountId ? { account: accountId, region: region } : defaultEnv;
}

// Determine environments based on account IDs (cross-account if different accounts specified)
const executionEnv = getStackEnvironment(
  executionAccountId,
  region,
  defaultEnv
);
const verificationEnv = getStackEnvironment(
  verificationAccountId,
  region,
  defaultEnv
);

/**
 * Create Execution Stack
 *
 * @param app - CDK app instance
 * @param stackName - Stack name
 * @param env - CDK environment
 * @param verificationLambdaRoleArn - Verification Lambda role ARN (optional)
 * @param verificationAccountId - Verification account ID (optional)
 * @param executionResponseQueueUrl - SQS queue URL for responses (optional)
 */
function createExecutionStack(
  app: cdk.App,
  stackName: string,
  env: cdk.Environment,
  verificationLambdaRoleArn?: string,
  verificationAccountId?: string,
  executionResponseQueueUrl?: string
): void {
  new ExecutionStack(app, stackName, {
    env: env,
    verificationLambdaRoleArn: verificationLambdaRoleArn,
    verificationAccountId: verificationAccountId,
    executionResponseQueueUrl: executionResponseQueueUrl,
  });
}

/**
 * Create Verification Stack
 *
 * @param app - CDK app instance
 * @param stackName - Stack name
 * @param env - CDK environment
 * @param executionApiUrl - Execution API URL
 * @param executionApiArn - Execution API ARN
 * @param executionAccountId - Execution account ID (optional)
 */
function createVerificationStack(
  app: cdk.App,
  stackName: string,
  env: cdk.Environment,
  executionApiUrl: string,
  executionApiArn: string,
  executionAccountId?: string
): void {
  new VerificationStack(app, stackName, {
    env: env,
    executionApiUrl: executionApiUrl,
    executionApiArn: executionApiArn,
    executionAccountId: executionAccountId,
  });
}

/**
 * Print deployment instructions when ExecutionApiUrl is not configured
 *
 * @param deploymentEnv - Deployment environment
 * @param executionStackName - Execution stack name
 * @param verificationStackName - Verification stack name
 * @param region - AWS region
 */
function printDeploymentInstructions(
  deploymentEnv: DeploymentEnvironment,
  executionStackName: string,
  verificationStackName: string,
  region: string
): void {
  const awsProfile = process.env.AWS_PROFILE || "amplify-admin";
  console.warn(`
╔════════════════════════════════════════════════════════════════════════════╗
║                    DEPLOYMENT - STEP 1: Execution Stack                   ║
╚════════════════════════════════════════════════════════════════════════════╝

[INFO] ExecutionApiUrl is not configured. Only ExecutionStack will be deployed.

[STATUS] Stack to deploy: ${executionStackName}
[STATUS] VerificationStack will be skipped (requires ExecutionApiUrl)

[NEXT STEPS] After deploying ExecutionStack:

  1. Deploy ExecutionStack:
     AWS_PROFILE=${awsProfile} DEPLOYMENT_ENV=${deploymentEnv} \\
     npx cdk deploy ${executionStackName} --profile ${awsProfile}

  2. Get ExecutionApiUrl from stack outputs:
     AWS_PROFILE=${awsProfile} aws cloudformation describe-stacks \\
       --stack-name ${executionStackName} \\
       --region ${region} \\
       --query 'Stacks[0].Outputs[?OutputKey==\`ExecutionApiUrl\`].OutputValue' \\
       --output text

  3. Update configuration file (cdk.config.${deploymentEnv}.json):
     Set "executionApiUrl": "<URL from step 2>"

  4. Deploy VerificationStack:
     AWS_PROFILE=${awsProfile} DEPLOYMENT_ENV=${deploymentEnv} \\
     npx cdk deploy ${verificationStackName} --profile ${awsProfile}

  5. Get VerificationLambdaRoleArn from stack outputs:
     AWS_PROFILE=${awsProfile} aws cloudformation describe-stacks \\
       --stack-name ${verificationStackName} \\
       --region ${region} \\
       --query 'Stacks[0].Outputs[?OutputKey==\`VerificationLambdaRoleArn\`].OutputValue' \\
       --output text

  6. Update configuration file (cdk.config.${deploymentEnv}.json):
     Set "verificationLambdaRoleArn": "<ARN from step 5>"

  7. Update ExecutionStack with resource policy:
     AWS_PROFILE=${awsProfile} DEPLOYMENT_ENV=${deploymentEnv} \\
     npx cdk deploy ${executionStackName} --profile ${awsProfile}

╔════════════════════════════════════════════════════════════════════════════╗
║  TIP: Use scripts/deploy-split-stacks.sh for automated deployment         ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);
}

// Create Execution Stack
createExecutionStack(
  app,
  executionStackName,
  executionEnv,
  verificationLambdaRoleArn || undefined,
  verificationAccountId || undefined,
  executionResponseQueueUrl || undefined
);

// Create Verification Stack (requires Execution API URL from first deployment)
if (executionApiUrl) {
  const executionApiArn = getApiArnFromUrl(
    executionApiUrl,
    region,
    executionAccountId || process.env.CDK_DEFAULT_ACCOUNT
  );

  if (!executionApiArn) {
    console.warn(
      `[WARNING] Failed to extract API ARN from URL: ${executionApiUrl}`
    );
  }

  createVerificationStack(
    app,
    verificationStackName,
    verificationEnv,
    executionApiUrl,
    executionApiArn,
    executionAccountId || undefined
  );
} else {
  // If no API URL, only synthesize Execution Stack
  // User will need to deploy Execution Stack first, get URL, then re-run
  printDeploymentInstructions(
    deploymentEnv,
    executionStackName,
    verificationStackName,
    region
  );
}
