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
import { ExecutionStack } from "../lib/execution/execution-stack";
import { VerificationStack } from "../lib/verification/verification-stack";
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

// AgentCore configuration
const executionAgentName = getConfigString(
  "executionAgentName",
  "SlackAI_ExecutionAgent"
);
const verificationAgentName = getConfigString(
  "verificationAgentName",
  "SlackAI_VerificationAgent"
);
const executionAgentArn = getConfigString("executionAgentArn");

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

  if (config.slackBotToken) {
    app.node.setContext("slackBotToken", config.slackBotToken);
  }
  if (config.slackSigningSecret) {
    app.node.setContext("slackSigningSecret", config.slackSigningSecret);
  }
  app.node.setContext("executionAgentName", executionAgentName);
  app.node.setContext("verificationAgentName", verificationAgentName);
  if (executionAgentArn) {
    app.node.setContext("executionAgentArn", executionAgentArn);
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
 * Deployment Architecture (A2A only):
 *
 * - ExecutionStack: Execution Agent AgentCore Runtime (A2A)
 * - VerificationStack: SlackEventHandler + Verification Agent + DynamoDB + Secrets
 *
 * Deploy order: 1) ExecutionStack → get ExecutionAgentRuntimeArn
 *               2) VerificationStack with executionAgentArn (and executionAccountId if cross-account)
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

// Create Execution Stack (A2A only)
const executionStack = new ExecutionStack(app, executionStackName, {
  env: executionEnv,
  verificationAccountId: verificationAccountId || undefined,
  executionAgentName: executionAgentName || undefined,
});

// Create Verification Stack (A2A only; needs executionAgentArn from Execution Stack or config)
const resolvedExecutionAgentArn =
  executionAgentArn || executionStack.executionAgentArn;

new VerificationStack(app, verificationStackName, {
  env: verificationEnv,
  executionAccountId: executionAccountId || undefined,
  verificationAgentName: verificationAgentName || undefined,
  executionAgentArn: resolvedExecutionAgentArn || undefined,
});
