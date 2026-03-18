#!/usr/bin/env node
/**
 * Slack Search Agent Zone CDK Application Entry Point
 *
 * @module verification-zones/slack-search-agent/cdk/bin/cdk
 */

import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import * as path from "path";
import { SlackSearchAgentStack } from "../lib/slack-search-agent-stack";
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
  applyNagPacks,
} from "@slack-ai-app/cdk-tooling";

const VALID_ENVIRONMENTS = ["dev", "prod"] as const;
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";
type DeploymentEnvironment = (typeof VALID_ENVIRONMENTS)[number];

const outdir =
  process.env.CDK_OUTDIR || path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });

logInfo("Slack Search Agent CDK app starting", { phase: "config" });
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
      message: `Invalid deployment environment '${deploymentEnvRaw}'.`,
      cause: "Invalid deployment environment",
      remediation: `Set DEPLOYMENT_ENV to one of: ${VALID_ENVIRONMENTS.join(", ")}`,
      source: "app",
    });
  }

  if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
    logWarn(`DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}'.`, {
      phase: "config",
    });
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
      },
    );
    return null;
  }
}

const config = loadConfiguration(deploymentEnv);
logInfo(
  config
    ? "Configuration loaded from file or env overrides."
    : "Using context or defaults.",
  { phase: "config", context: { deploymentEnv } },
);

function getConfigValue<T>(key: string, defaultValue: T): T {
  const contextValue = app.node.tryGetContext(key);
  if (contextValue !== undefined) return contextValue as T;
  if (config && key in config)
    return (config as unknown as Record<string, unknown>)[key] as T;
  return defaultValue;
}

function getConfigString(key: string, defaultValue = ""): string {
  return getConfigValue<string>(key, defaultValue) || "";
}

const region = getConfigValue("awsRegion", DEFAULT_REGION);
const baseSlackSearchStackName = getConfigValue(
  "slackSearchStackName",
  "SlackAI-SlackSearch",
);
const environmentSuffix = deploymentEnv === "prod" ? "Prod" : "Dev";
const slackSearchStackName = `${baseSlackSearchStackName}-${environmentSuffix}`;
const verificationAccountId = getConfigString("verificationAccountId");
const slackSearchAccountId = getConfigString("slackSearchAccountId");
const slackSearchAgentName = getConfigString(
  "slackSearchAgentName",
  `SlackAI_SlackSearch_${environmentSuffix}`,
);
const bedrockModelId = getConfigString(
  "bedrockModelId",
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0",
);

if (config) {
  app.node.setContext("awsRegion", region);
  app.node.setContext("bedrockModelId", config.bedrockModelId);
  app.node.setContext("deploymentEnv", deploymentEnv);
  app.node.setContext("slackSearchStackName", baseSlackSearchStackName);
  app.node.setContext("verificationAccountId", verificationAccountId);
  app.node.setContext("slackSearchAccountId", slackSearchAccountId);
  app.node.setContext("slackSearchAgentName", slackSearchAgentName);
}

const defaultEnv: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region,
};
const slackSearchEnv: cdk.Environment = slackSearchAccountId
  ? { account: slackSearchAccountId, region }
  : defaultEnv;

new SlackSearchAgentStack(app, slackSearchStackName, {
  env: slackSearchEnv,
  awsRegion: region,
  bedrockModelId: bedrockModelId || undefined,
  verificationAccountId: verificationAccountId || undefined,
  slackSearchAgentName: slackSearchAgentName || undefined,
});
logInfo("Slack Search Agent stack created.", {
  phase: "stack",
  context: { stackName: slackSearchStackName },
});

applyNagPacks(app);
app.synth();
