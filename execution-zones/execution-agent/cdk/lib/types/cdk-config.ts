/**
 * File Creator Agent CDK Configuration Management
 *
 * Zone-specific configuration loading for the File Creator Agent standalone CDK app.
 * Uses shared config-loader from @slack-ai-app/cdk-tooling.
 *
 * @module execution-zones/execution-agent/cdk/lib/types/cdk-config
 */

import * as path from "path";
import { z } from "zod";
import { loadJsonFile, mergeConfigs } from "@slack-ai-app/cdk-tooling";

/**
 * Validated CDK configuration shape for File Creator Agent zone.
 */
export interface CdkConfig {
  /** AWS Region for deployment */
  awsRegion: string;
  /** Bedrock model ID to use for AI processing */
  bedrockModelId: string;
  /** Deployment environment: "dev" or "prod" */
  deploymentEnv: "dev" | "prod";
  /** Base name for File Creator Stack (without environment suffix) */
  fileCreatorStackName: string;
  /** AWS Account ID for Verification Stack (for cross-account A2A resource policy) */
  verificationAccountId: string;
  /** AWS Account ID for File Creator Stack */
  fileCreatorAccountId: string;
  /** Name for the File Creator Agent AgentCore Runtime (optional) */
  fileCreatorAgentName?: string;
}

const CdkConfigSchema = z.object({
  awsRegion: z
    .string()
    .regex(/^[a-z]+-[a-z]+-[0-9]+$/, "Invalid AWS region format"),
  bedrockModelId: z.string().min(1, "bedrockModelId is required"),
  deploymentEnv: z.enum(["dev", "prod"], {
    errorMap: () => ({ message: "deploymentEnv must be 'dev' or 'prod'" }),
  }),
  fileCreatorStackName: z.string().min(1, "fileCreatorStackName is required"),
  verificationAccountId: z
    .string()
    .regex(/^\d{12}$/, "verificationAccountId must be a 12-digit AWS account ID"),
  fileCreatorAccountId: z
    .string()
    .regex(/^\d{12}$/, "fileCreatorAccountId must be a 12-digit AWS account ID"),
  fileCreatorAgentName: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/,
      "fileCreatorAgentName must match pattern [a-zA-Z][a-zA-Z0-9_]{0,47}"
    )
    .optional(),
});

/**
 * Validate configuration using Zod schema
 */
export function validateConfig(config: unknown): CdkConfig {
  try {
    return CdkConfigSchema.parse(config);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((e: z.ZodIssue) => {
        const p = e.path.join(".");
        return `  - ${p}: ${e.message}`;
      });
      throw new Error(
        `Configuration validation failed:\n${errorMessages.join("\n")}`
      );
    }
    throw error;
  }
}

/**
 * Load CDK configuration for Execution Agent zone.
 *
 * @param env - Deployment environment ("dev" or "prod")
 * @param cdkDir - CDK directory path
 * @returns Validated CdkConfig
 */
export function loadCdkConfig(env: "dev" | "prod", cdkDir?: string): CdkConfig {
  const configDir = cdkDir
    ? path.resolve(cdkDir)
    : path.resolve(process.cwd(), "cdk");
  const configs: (Record<string, unknown> | null)[] = [];

  const baseConfig = loadJsonFile(path.join(configDir, "cdk.config.json"));
  if (baseConfig) configs.push(baseConfig);

  const localConfig = loadJsonFile(path.join(configDir, "cdk.config.local.json"));
  if (localConfig) configs.push(localConfig);

  const envConfig = loadJsonFile(path.join(configDir, `cdk.config.${env}.json`));
  if (!envConfig) {
    throw new Error(
      `Environment-specific configuration file not found: ${configDir}/cdk.config.${env}.json\n` +
        `Please create cdk.config.${env}.json or use cdk.config.json.example as a template.`
    );
  }
  configs.push(envConfig);

  const mergedConfig = mergeConfigs(...configs);
  mergedConfig.deploymentEnv = env;

  return validateConfig(mergedConfig);
}

/**
 * Apply environment variable overrides to configuration
 */
export function applyEnvOverrides(config: CdkConfig): CdkConfig {
  return {
    ...config,
    awsRegion: process.env.AWS_REGION || config.awsRegion,
    bedrockModelId: process.env.BEDROCK_MODEL_ID || config.bedrockModelId,
    verificationAccountId:
      process.env.VERIFICATION_ACCOUNT_ID || config.verificationAccountId,
    fileCreatorAccountId:
      process.env.FILE_CREATOR_ACCOUNT_ID || config.fileCreatorAccountId,
  };
}
