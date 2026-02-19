#!/usr/bin/env node
/**
 * Time Agent Zone CDK Application Entry Point
 *
 * @module execution-zones/time-agent/cdk/bin/cdk
 */

import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import * as path from "path";
import { TimeAgentStack } from "../lib/time-agent-stack";
import { loadCdkConfig, applyEnvOverrides, CdkConfig } from "../lib/types/cdk-config";
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

const outdir = process.env.CDK_OUTDIR || path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });

logInfo("Time Agent CDK app starting", { phase: "config" });
Aspects.of(app).add(new LogRetentionAspect());
Aspects.of(app).add(new CostAllocationTagAspect());

function getDeploymentEnvironment(): DeploymentEnvironment {
  const deploymentEnvRaw =
    process.env.DEPLOYMENT_ENV ||
    app.node.tryGetContext("deploymentEnv") ||
    DEFAULT_ENVIRONMENT;
  const deploymentEnv = deploymentEnvRaw.toLowerCase().trim() as DeploymentEnvironment;

  if (!VALID_ENVIRONMENTS.includes(deploymentEnv)) {
    CdkError.throw({
      message: `Invalid deployment environment '${deploymentEnvRaw}'.`,
      cause: "Invalid deployment environment",
      remediation: `Set DEPLOYMENT_ENV to one of: ${VALID_ENVIRONMENTS.join(", ")}`,
      source: "app",
    });
  }

  if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
    logWarn(`DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}'.`, { phase: "config" });
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
    logWarn("Configuration file load failed; falling back to context or defaults.", {
      phase: "config",
    });
    return null;
  }
}

const config = loadConfiguration(deploymentEnv);
logInfo(
  config ? "Configuration loaded from file or env overrides." : "Using context or defaults.",
  { phase: "config", context: { deploymentEnv } }
);

function getConfigValue<T>(key: string, defaultValue: T): T {
  const contextValue = app.node.tryGetContext(key);
  if (contextValue !== undefined) return contextValue as T;
  if (config && key in config) return (config as unknown as Record<string, unknown>)[key] as T;
  return defaultValue;
}

function getConfigString(key: string, defaultValue = ""): string {
  return getConfigValue<string>(key, defaultValue) || "";
}

const region = getConfigValue("awsRegion", DEFAULT_REGION);
const baseTimeStackName = getConfigValue("timeExecutionStackName", "SlackAI-TimeExecution");
const environmentSuffix = deploymentEnv === "prod" ? "Prod" : "Dev";
const timeStackName = `${baseTimeStackName}-${environmentSuffix}`;
const verificationAccountId = getConfigString("verificationAccountId");
const executionAccountId = getConfigString("executionAccountId");
const timeAgentName = getConfigString("timeAgentName", `SlackAI_TimeAgent_${environmentSuffix}`);
const bedrockModelId = getConfigString("bedrockModelId", "jp.anthropic.claude-sonnet-4-6");

if (config) {
  app.node.setContext("awsRegion", region);
  app.node.setContext("bedrockModelId", config.bedrockModelId);
  app.node.setContext("deploymentEnv", deploymentEnv);
  app.node.setContext("timeExecutionStackName", baseTimeStackName);
  app.node.setContext("verificationAccountId", verificationAccountId);
  app.node.setContext("executionAccountId", executionAccountId);
  app.node.setContext("timeAgentName", timeAgentName);
}

const defaultEnv: cdk.Environment = { account: process.env.CDK_DEFAULT_ACCOUNT, region };
const executionEnv: cdk.Environment = executionAccountId
  ? { account: executionAccountId, region }
  : defaultEnv;

new TimeAgentStack(app, timeStackName, {
  env: executionEnv,
  awsRegion: region,
  bedrockModelId: bedrockModelId || undefined,
  verificationAccountId: verificationAccountId || undefined,
  timeAgentName: timeAgentName || undefined,
});
logInfo("Time Agent stack created.", { phase: "stack", context: { stackName: timeStackName } });

app.synth();
