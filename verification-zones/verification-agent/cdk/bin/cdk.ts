#!/usr/bin/env node
/**
 * Verification Zone CDK Application Entry Point
 *
 * This file defines the standalone CDK application for the Verification Zone.
 * It instantiates only the VerificationStack; execution stacks live in a separate CDK app.
 *
 * Configuration priority (highest first): (1) Environment variables (e.g. DEPLOYMENT_ENV, SLACK_BOT_TOKEN),
 * (2) Command-line context (--context key=value), (3) Environment-specific config file (cdk.config.{env}.json),
 * (4) Defaults in code. See getConfigValue / getConfigString and loadConfiguration.
 *
 * Execution agent ARNs are supplied via config file (executionAgentArns) or individual env vars:
 * FILE_CREATOR_AGENT_ARN, DOCS_AGENT_ARN, TIME_AGENT_ARN (or combined EXECUTION_AGENT_ARNS JSON).
 *
 * Deploy order: 1) Deploy execution CDK app (execution-zones/) to get runtime ARNs,
 *               2) Set executionAgentArns in cdk.config.{env}.json (or env vars),
 *               3) Deploy this app: npx cdk deploy
 *
 * @module verification-zones/verification-agent/cdk/bin/cdk
 */

import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import * as path from "path";
import { VerificationStack } from "../lib/verification-stack";
import {
  loadCdkConfig,
  applyEnvOverrides,
  CdkConfig,
} from "../lib/types/cdk-config";
import {
  LogRetentionAspect,
  CostAllocationTagAspect,
  logInfo,
  logWarn,
  CdkError,
} from "@slack-ai-app/cdk-tooling";

// Constants
const VALID_ENVIRONMENTS = ["dev", "prod"] as const;
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";

type DeploymentEnvironment = (typeof VALID_ENVIRONMENTS)[number];

// Outdir for cloud assembly (CLI sets CDK_OUTDIR; else default cdk.out)
const outdir =
  process.env.CDK_OUTDIR || path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });

logInfo("Verification Zone CDK app starting", { phase: "config" });

// Apply synthesis-time validation aspects
Aspects.of(app).add(new LogRetentionAspect());
Aspects.of(app).add(new CostAllocationTagAspect());

/**
 * Get and validate deployment environment.
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

  if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
    logWarn(
      `DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}' environment.`,
      {
        phase: "config",
      },
    );
  }

  return deploymentEnv;
}

const deploymentEnv = getDeploymentEnvironment();

/**
 * Load configuration from files with fallback to context/defaults
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
    logWarn(
      "Configuration file load failed; falling back to context or defaults.",
      {
        phase: "config",
        context: { step: "config load" },
      },
    );
    return null;
  }
}

const config = loadConfiguration(deploymentEnv);

logInfo(
  config
    ? "Configuration loaded from file or env overrides."
    : "Using context or defaults (no config file).",
  { phase: "config", context: { deploymentEnv } },
);

/**
 * Get configuration value with priority: context > config file > default
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
 */
function getConfigString(key: string, defaultValue = ""): string {
  const value = getConfigValue<string>(key, defaultValue);
  return value || "";
}

/**
 * Get configuration value as object.
 */
function getConfigObject<T extends object>(key: string, defaultValue: T): T {
  const value = getConfigValue<T>(key, defaultValue);
  return value || defaultValue;
}

// Get configuration values
const region = getConfigValue("awsRegion", DEFAULT_REGION);

// Stack name (without environment suffix)
const baseVerificationStackName = getConfigValue(
  "verificationStackName",
  "SlackAI-Verification",
);

// Add environment suffix
const environmentSuffix = deploymentEnv === "prod" ? "Prod" : "Dev";
const verificationStackName = `${baseVerificationStackName}-${environmentSuffix}`;

// Cross-account configuration
const verificationAccountId = getConfigString("verificationAccountId");
const executionAccountId = getConfigString("executionAccountId");

// AgentCore configuration
const verificationAgentName = getConfigString(
  "verificationAgentName",
  `SlackAI_VerificationAgent_${environmentSuffix}`,
);

// Execution agent ARNs (from context, env vars, or config file).
// CDK --context always passes strings; JSON-parse when needed.
const executionAgentArns: Record<string, string> = (() => {
  const ctxRaw = app.node.tryGetContext("executionAgentArns");
  if (ctxRaw !== undefined) {
    if (typeof ctxRaw === "string") {
      try {
        return JSON.parse(ctxRaw) as Record<string, string>;
      } catch {
        return {};
      }
    }
    if (typeof ctxRaw === "object" && ctxRaw !== null) {
      return ctxRaw as Record<string, string>;
    }
  }
  return config?.executionAgentArns ?? {};
})();

/**
 * Set loaded config values to CDK context for backward compatibility
 */
function setContextFromConfig(config: CdkConfig | null): void {
  if (!config) {
    return;
  }

  app.node.setContext("awsRegion", region);
  app.node.setContext("bedrockModelId", config.bedrockModelId);
  app.node.setContext("deploymentEnv", deploymentEnv);
  app.node.setContext("verificationStackName", baseVerificationStackName);
  app.node.setContext("verificationAccountId", verificationAccountId);
  app.node.setContext("executionAccountId", executionAccountId);

  if (config.slackBotToken) {
    app.node.setContext("slackBotToken", config.slackBotToken);
  }
  if (config.slackSigningSecret) {
    app.node.setContext("slackSigningSecret", config.slackSigningSecret);
  }
  app.node.setContext("verificationAgentName", verificationAgentName);
  if (Object.keys(executionAgentArns).length > 0) {
    app.node.setContext("executionAgentArns", executionAgentArns);
  }
}

setContextFromConfig(config);

/**
 * Get CDK environment configuration
 */
function getDefaultEnv(region: string): cdk.Environment {
  return {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  };
}

const defaultEnv = getDefaultEnv(region);

function getStackEnvironment(
  accountId: string,
  region: string,
  defaultEnv: cdk.Environment,
): cdk.Environment {
  return accountId ? { account: accountId, region: region } : defaultEnv;
}

const verificationEnv = getStackEnvironment(
  verificationAccountId,
  region,
  defaultEnv,
);

const bedrockModelId = getConfigString(
  "bedrockModelId",
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
);

// Create Verification Stack
new VerificationStack(app, verificationStackName, {
  env: verificationEnv,
  executionAccountId: executionAccountId || undefined,
  verificationAgentName: verificationAgentName || undefined,
  executionAgentArns:
    Object.keys(executionAgentArns).length > 0 ? executionAgentArns : undefined,
  bedrockModelId: bedrockModelId || undefined,
});
logInfo("Verification stack created.", {
  phase: "stack",
  context: { stackName: verificationStackName },
});

// Emit cloud assembly
app.synth();
