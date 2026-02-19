/**
 * CDK Configuration Management (Verification Zone)
 *
 * This module provides type-safe configuration loading and validation for the
 * Verification Zone CDK deployment. Supports environment-specific configuration
 * files with priority-based merging.
 *
 * Configuration Priority (high to low):
 * 1. Environment variables
 * 2. Command-line arguments (--context key=value)
 * 3. Environment-specific config file (cdk.config.{env}.json)
 * 4. Local config file (cdk.config.local.json - optional)
 * 5. Base config file (cdk.config.json - optional)
 * 6. Default values (in code)
 *
 * Key types: CdkConfig (validated shape). Key functions: loadCdkConfig, validateConfig, applyEnvOverrides.
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

/**
 * Validated CDK configuration shape for the Verification Zone.
 * All required fields are enforced by CdkConfigSchema (Zod).
 * Optional fields (e.g. slackBotToken, executionAgentArns) may be set via env or config file.
 */
export interface CdkConfig {
  /** AWS Region for deployment */
  awsRegion: string;
  /** Bedrock model ID to use for AI processing */
  bedrockModelId: string;
  /** Deployment environment: "dev" or "prod" */
  deploymentEnv: "dev" | "prod";
  /** Base name for Verification Stack (without environment suffix) */
  verificationStackName: string;
  /** AWS Account ID for Verification Stack */
  verificationAccountId: string;
  /** AWS Account ID for Execution Stack (for cross-account A2A) */
  executionAccountId: string;
  /** Slack Bot Token (optional, can be set via environment variable) */
  slackBotToken?: string;
  /** Slack Signing Secret (optional, can be set via environment variable) */
  slackSigningSecret?: string;
  /** Name for the Verification Agent AgentCore Runtime (optional) */
  verificationAgentName?: string;
  /** Map of execution agent IDs to runtime ARNs for A2A (optional; from stack outputs or config) */
  executionAgentArns?: Record<string, string>;
}

/**
 * Zod schema for CDK configuration validation
 */
const CdkConfigSchema = z.object({
  awsRegion: z
    .string()
    .regex(/^[a-z]+-[a-z]+-[0-9]+$/, "Invalid AWS region format"),
  bedrockModelId: z.string().min(1, "bedrockModelId is required"),
  deploymentEnv: z.enum(["dev", "prod"], {
    errorMap: () => ({ message: "deploymentEnv must be 'dev' or 'prod'" }),
  }),
  verificationStackName: z.string().min(1, "verificationStackName is required"),
  verificationAccountId: z
    .string()
    .regex(
      /^\d{12}$/,
      "verificationAccountId must be a 12-digit AWS account ID"
    ),
  executionAccountId: z
    .string()
    .regex(/^\d{12}$/, "executionAccountId must be a 12-digit AWS account ID"),
  slackBotToken: z.string().min(1, "slackBotToken cannot be empty").optional(),
  slackSigningSecret: z
    .string()
    .min(1, "slackSigningSecret cannot be empty")
    .optional(),
  verificationAgentName: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/,
      "verificationAgentName must match pattern [a-zA-Z][a-zA-Z0-9_]{0,47}"
    )
    .optional(),
  executionAgentArns: z
    .record(
      z.string(),
      z.string().regex(
        /^arn:aws:bedrock-agentcore:.+:\d{12}:runtime\/.+/,
        "executionAgentArns values must be valid AgentCore Runtime ARNs"
      )
    )
    .optional(),
});

/**
 * Partial configuration type for merging
 */
type PartialCdkConfig = Partial<CdkConfig>;

/**
 * Load JSON configuration file
 * Converts empty strings to undefined for optional fields
 */
function loadJsonFile(filePath: string): PartialCdkConfig | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as Partial<Record<string, unknown>>;

    // Convert empty strings to undefined for optional fields
    const cleaned: PartialCdkConfig = {};
    for (const [key, value] of Object.entries(parsed)) {
      // Skip empty strings for optional fields
      if (
        value === "" &&
        key === "executionAgentArns"
      ) {
        continue; // Skip empty optional field
      }
      // Type-safe assignment
      if (key in cleaned || key in CdkConfigSchema.shape) {
        (cleaned as Record<string, unknown>)[key] = value;
      }
    }

    return cleaned;
  } catch (error) {
    throw new Error(
      `Failed to load configuration file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Merge multiple configuration objects (later configs override earlier ones)
 */
function mergeConfigs(
  ...configs: (PartialCdkConfig | null)[]
): PartialCdkConfig {
  const merged: PartialCdkConfig = {};
  for (const config of configs) {
    if (config) {
      Object.assign(merged, config);
    }
  }
  return merged;
}

/**
 * Validate configuration using Zod schema
 */
export function validateConfig(config: unknown): CdkConfig {
  try {
    return CdkConfigSchema.parse(config);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((e: z.ZodIssue) => {
        const path = e.path.join(".");
        return `  - ${path}: ${e.message}`;
      });
      throw new Error(
        `Configuration validation failed:\n${errorMessages.join("\n")}`
      );
    }
    throw error;
  }
}

/**
 * Load CDK configuration for a specific environment
 *
 * @param env - Deployment environment ("dev" or "prod")
 * @param cdkDir - CDK directory path (default: current directory)
 * @returns Validated CDK configuration
 */
export function loadCdkConfig(env: "dev" | "prod", cdkDir?: string): CdkConfig {
  const configDir = cdkDir
    ? path.resolve(cdkDir)
    : path.resolve(process.cwd(), "cdk");
  const configs: (PartialCdkConfig | null)[] = [];

  // 1. Load base config (optional)
  const baseConfigPath = path.join(configDir, "cdk.config.json");
  const baseConfig = loadJsonFile(baseConfigPath);
  if (baseConfig) {
    configs.push(baseConfig);
  }

  // 2. Load local config (optional, for personal overrides)
  const localConfigPath = path.join(configDir, "cdk.config.local.json");
  const localConfig = loadJsonFile(localConfigPath);
  if (localConfig) {
    configs.push(localConfig);
  }

  // 3. Load environment-specific config (required)
  const envConfigPath = path.join(configDir, `cdk.config.${env}.json`);
  const envConfig = loadJsonFile(envConfigPath);
  if (!envConfig) {
    throw new Error(
      `Environment-specific configuration file not found: ${envConfigPath}\n` +
        `Please create cdk.config.${env}.json or use cdk.config.json.example as a template.`
    );
  }
  configs.push(envConfig);

  // Merge all configs (later configs override earlier ones)
  const mergedConfig = mergeConfigs(...configs);

  // Ensure deploymentEnv matches the requested environment
  mergedConfig.deploymentEnv = env;

  // Validate and return
  return validateConfig(mergedConfig);
}

/**
 * Apply environment variable overrides to configuration
 *
 * @param config - Base configuration
 * @returns Configuration with environment variable overrides applied
 */
export function applyEnvOverrides(config: CdkConfig): CdkConfig {
  // Helper to convert empty string to undefined
  const envOrConfig = (
    envVar: string | undefined,
    configValue: string | undefined
  ): string | undefined => {
    const env = envVar?.trim();
    const cfg = configValue?.trim();
    const value = env || cfg;
    return value && value !== "" ? value : undefined;
  };

  const parseExecutionAgentArns = (
    raw: string | undefined
  ): Record<string, string> | undefined => {
    const value = raw?.trim();
    if (!value) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return undefined;
      }
      const out: Record<string, string> = {};
      for (const [key, arn] of Object.entries(parsed)) {
        if (typeof arn === "string" && arn.trim() !== "") {
          out[key] = arn.trim();
        }
      }
      return Object.keys(out).length > 0 ? out : undefined;
    } catch {
      return undefined;
    }
  };

  const mergedExecutionAgentArns = (
    config.executionAgentArns && Object.keys(config.executionAgentArns).length > 0
      ? { ...config.executionAgentArns }
      : undefined
  );
  const fromJson = parseExecutionAgentArns(process.env.EXECUTION_AGENT_ARNS);
  const fromSingles: Record<string, string> = {};
  const fileCreatorArn = process.env.FILE_CREATOR_AGENT_ARN?.trim();
  if (fileCreatorArn) {
    fromSingles["file-creator"] = fileCreatorArn;
  }
  const docsArn = process.env.DOCS_AGENT_ARN?.trim();
  if (docsArn) {
    fromSingles.docs = docsArn;
  }
  const timeArn = process.env.TIME_AGENT_ARN?.trim();
  if (timeArn) {
    fromSingles.time = timeArn;
  }
  const fromSingleMap =
    Object.keys(fromSingles).length > 0 ? fromSingles : undefined;

  const resolvedExecutionAgentArns =
    fromJson ?? fromSingleMap ?? mergedExecutionAgentArns;

  return {
    ...config,
    awsRegion: process.env.AWS_REGION || config.awsRegion,
    bedrockModelId: process.env.BEDROCK_MODEL_ID || config.bedrockModelId,
    verificationAccountId:
      process.env.VERIFICATION_ACCOUNT_ID || config.verificationAccountId,
    executionAccountId:
      process.env.EXECUTION_ACCOUNT_ID || config.executionAccountId,
    slackBotToken: envOrConfig(
      process.env.SLACK_BOT_TOKEN,
      config.slackBotToken
    ),
    slackSigningSecret: envOrConfig(
      process.env.SLACK_SIGNING_SECRET,
      config.slackSigningSecret
    ),
    executionAgentArns: resolvedExecutionAgentArns,
  };
}
