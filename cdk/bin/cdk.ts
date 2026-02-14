#!/usr/bin/env node
/**
 * CDK Application Entry Point
 *
 * This file defines the CDK application structure and stack instantiation.
 * It handles configuration loading, validation, and stack creation for both
 * ExecutionStack and VerificationStack.
 *
 * Configuration priority (highest first): (1) Environment variables (e.g. DEPLOYMENT_ENV, SLACK_BOT_TOKEN),
 * (2) Command-line context (--context key=value), (3) Environment-specific config file (cdk.config.{env}.json),
 * (4) Defaults in code. See getConfigValue / getConfigString and loadConfiguration.
 *
 * Stack creation flow: (1) ExecutionStack is created first and exposes executionAgentArn.
 * (2) VerificationStack is created with executionAgentArn from Execution Stack output or config.
 * Deploy order: deploy ExecutionStack, then set executionAgentArn and deploy VerificationStack.
 *
 * Audit (FR-005, SC-004): Log and CdkError messages in this file and in lib/utils (cdk-logger,
 * cdk-error) do not include secrets, tokens, or PII; config load failure does not log raw error.
 *
 * @module cdk/bin/cdk
 */

import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import * as path from "path";
import { ExecutionStack } from "../lib/execution/execution-stack";
import { VerificationStack } from "../lib/verification/verification-stack";
import {
  loadCdkConfig,
  applyEnvOverrides,
  CdkConfig,
} from "../lib/types/cdk-config";
import { LogRetentionAspect } from "../lib/aspects/log-retention-aspect";
import { CostAllocationTagAspect } from "../lib/utils/cost-allocation-tags";
import { logInfo, logWarn } from "../lib/utils/cdk-logger";
import { CdkError } from "../lib/utils/cdk-error";

// Constants
const VALID_ENVIRONMENTS = ["dev", "prod"] as const;
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";

type DeploymentEnvironment = (typeof VALID_ENVIRONMENTS)[number];

// Outdir for cloud assembly (CLI sets CDK_OUTDIR; else default cdk.out)
const outdir =
  process.env.CDK_OUTDIR ||
  path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });

logInfo("CDK app starting", { phase: "config" });

// Apply synthesis-time validation aspects (e.g. log retention, naming)
Aspects.of(app).add(new LogRetentionAspect());
// Ensure cost allocation tags on app-level constructs (e.g. S3 auto-delete custom resource provider)
Aspects.of(app).add(new CostAllocationTagAspect());

/**
 * Get and validate deployment environment.
 * Entry-point validation uses CdkError (cause, remediation, source) per error-report contract.
 *
 * Priority: 1. DEPLOYMENT_ENV environment variable, 2. cdk.json context, 3. default
 *
 * @returns Validated deployment environment
 * @throws {CdkError} If deployment environment is invalid
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
    CdkError.throw({
      message: `Invalid deployment environment '${deploymentEnvRaw}'. Must be one of: ${VALID_ENVIRONMENTS.join(", ")}.`,
      cause: "Invalid deployment environment",
      remediation: `Set DEPLOYMENT_ENV or use --context deploymentEnv to one of: ${VALID_ENVIRONMENTS.join(", ")}`,
      source: "app",
    });
  }

  // Warn if using default
  if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
    logWarn(`DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}' environment.`, {
      phase: "config",
    });
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
  } catch {
    // Wrapped error: context (step "config load") and user-facing message only; raw error
    // not logged to avoid paths or sensitive data (FR-007). Cause is preserved in catch for
    // optional rethrow with CdkError had we chosen to fail fast.
    logWarn("Configuration file load failed; falling back to context or defaults.", {
      phase: "config",
      context: { step: "config load" },
    });
    return null;
  }
}

const config = loadConfiguration(deploymentEnv);

logInfo(
  config
    ? "Configuration loaded from file or env overrides."
    : "Using context or defaults (no config file).",
  { phase: "config", context: { deploymentEnv } }
);

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

// Get configuration values with priority: context > config file > defaults (see module JSDoc for full priority)
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

// AgentCore configuration (default names include env suffix so Dev and Prod can coexist in same account)
const executionAgentName = getConfigString(
  "executionAgentName",
  `SlackAI_ExecutionAgent_${environmentSuffix}`
);
const verificationAgentName = getConfigString(
  "verificationAgentName",
  `SlackAI_VerificationAgent_${environmentSuffix}`
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

// Bedrock model ID (Execution Agent + Verification Stack)
const bedrockModelId = getConfigString("bedrockModelId", "amazon.nova-pro-v1:0");

// Create Execution Stack (A2A only)
const executionStack = new ExecutionStack(app, executionStackName, {
  env: executionEnv,
  awsRegion: region,
  bedrockModelId: bedrockModelId || undefined,
  verificationAccountId: verificationAccountId || undefined,
  executionAgentName: executionAgentName || undefined,
});
logInfo("Execution stack created.", { phase: "stack", context: { stackName: executionStackName } });

// Create Verification Stack (A2A only; needs executionAgentArn from Execution Stack or config)
const resolvedExecutionAgentArn =
  executionAgentArn || executionStack.executionAgentArn;

new VerificationStack(app, verificationStackName, {
  env: verificationEnv,
  executionAccountId: executionAccountId || undefined,
  verificationAgentName: verificationAgentName || undefined,
  executionAgentArn: resolvedExecutionAgentArn || undefined,
});
logInfo("Verification stack created.", { phase: "stack", context: { stackName: verificationStackName } });

// Emit cloud assembly (outdir set on App constructor above).
app.synth();
