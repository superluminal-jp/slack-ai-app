#!/usr/bin/env node
/**
 * File Creator Agent Zone CDK Application Entry Point
 *
 * Standalone CDK app for the File Creator Agent zone.
 * Deploys a single FileCreatorAgentStack with AgentCore Runtime (A2A).
 *
 * @module execution-zones/execution-agent/cdk/bin/cdk
 */

import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import * as path from "path";
import { FileCreatorAgentStack } from "../lib/file-creator-agent-stack";
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

const VALID_ENVIRONMENTS = ["dev", "prod"] as const;
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";

type DeploymentEnvironment = (typeof VALID_ENVIRONMENTS)[number];

const outdir =
  process.env.CDK_OUTDIR || path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });

logInfo("File Creator Agent CDK app starting", { phase: "config" });

Aspects.of(app).add(new LogRetentionAspect());
Aspects.of(app).add(new CostAllocationTagAspect());

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

function getConfigValue<T>(key: string, defaultValue: T): T {
  const contextValue = app.node.tryGetContext(key);
  if (contextValue !== undefined) return contextValue as T;
  if (config && key in config) {
    return (config as unknown as Record<string, unknown>)[key] as T;
  }
  return defaultValue;
}

function getConfigString(key: string, defaultValue = ""): string {
  const value = getConfigValue<string>(key, defaultValue);
  return value || "";
}

const region = getConfigValue("awsRegion", DEFAULT_REGION);
const baseFileCreatorStackName = getConfigValue(
  "fileCreatorStackName",
  "SlackAI-FileCreator",
);
const environmentSuffix = deploymentEnv === "prod" ? "Prod" : "Dev";
const fileCreatorStackName = `${baseFileCreatorStackName}-${environmentSuffix}`;
const verificationAccountId = getConfigString("verificationAccountId");
const fileCreatorAccountId = getConfigString("fileCreatorAccountId");
const fileCreatorAgentName = getConfigString(
  "fileCreatorAgentName",
  `SlackAI_FileCreatorAgent_${environmentSuffix}`,
);
const bedrockModelId = getConfigString(
  "bedrockModelId",
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
);

if (config) {
  app.node.setContext("awsRegion", region);
  app.node.setContext("bedrockModelId", config.bedrockModelId);
  app.node.setContext("deploymentEnv", deploymentEnv);
  app.node.setContext("fileCreatorStackName", baseFileCreatorStackName);
  app.node.setContext("verificationAccountId", verificationAccountId);
  app.node.setContext("fileCreatorAccountId", fileCreatorAccountId);
  app.node.setContext("fileCreatorAgentName", fileCreatorAgentName);
}

const defaultEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: region,
};
const fileCreatorEnv: cdk.Environment = fileCreatorAccountId
  ? { account: fileCreatorAccountId, region: region }
  : defaultEnv;

new FileCreatorAgentStack(app, fileCreatorStackName, {
  env: fileCreatorEnv,
  awsRegion: region,
  bedrockModelId: bedrockModelId || undefined,
  verificationAccountId: verificationAccountId || undefined,
  fileCreatorAgentName: fileCreatorAgentName || undefined,
});
logInfo("File Creator Agent stack created.", {
  phase: "stack",
  context: { stackName: fileCreatorStackName },
});

app.synth();
