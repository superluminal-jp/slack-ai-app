/**
 * Web Fetch Agent CDK Configuration Management
 *
 * @module execution-zones/fetch-url-agent/cdk/lib/types/cdk-config
 */

import * as path from "path";
import { z } from "zod";
import { loadJsonFile, mergeConfigs } from "@slack-ai-app/cdk-tooling";

export interface CdkConfig {
  awsRegion: string;
  bedrockModelId: string;
  deploymentEnv: "dev" | "prod";
  webFetchStackName: string;
  verificationAccountId: string;
  webFetchAccountId: string;
  webFetchAgentName?: string;
}

const CdkConfigSchema = z.object({
  awsRegion: z
    .string()
    .regex(/^[a-z]+-[a-z]+-[0-9]+$/, "Invalid AWS region format"),
  bedrockModelId: z.string().min(1, "bedrockModelId is required"),
  deploymentEnv: z.enum(["dev", "prod"]),
  webFetchStackName: z.string().min(1, "webFetchStackName is required"),
  verificationAccountId: z
    .string()
    .regex(
      /^\d{12}$/,
      "verificationAccountId must be a 12-digit AWS account ID",
    ),
  webFetchAccountId: z
    .string()
    .regex(/^\d{12}$/, "webFetchAccountId must be a 12-digit AWS account ID"),
  webFetchAgentName: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/).optional(),
});

export function validateConfig(config: unknown): CdkConfig {
  try {
    return CdkConfigSchema.parse(config);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(
        (e) => `  - ${e.path.join(".")}: ${e.message}`,
      );
      throw new Error(
        `Configuration validation failed:\n${messages.join("\n")}`,
      );
    }
    throw error;
  }
}

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
      `Environment-specific configuration file not found: ${configDir}/cdk.config.${env}.json`,
    );
  }
  configs.push(envConfig);

  const mergedConfig = mergeConfigs(...configs);
  mergedConfig.deploymentEnv = env;
  return validateConfig(mergedConfig);
}

export function applyEnvOverrides(config: CdkConfig): CdkConfig {
  return {
    ...config,
    awsRegion: process.env.AWS_REGION || config.awsRegion,
    bedrockModelId: process.env.BEDROCK_MODEL_ID || config.bedrockModelId,
    verificationAccountId:
      process.env.VERIFICATION_ACCOUNT_ID || config.verificationAccountId,
    webFetchAccountId: process.env.WEB_FETCH_ACCOUNT_ID || config.webFetchAccountId,
  };
}
