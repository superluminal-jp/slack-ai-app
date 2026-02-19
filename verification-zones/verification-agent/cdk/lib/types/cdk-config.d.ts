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
 * Validate configuration using Zod schema
 */
export declare function validateConfig(config: unknown): CdkConfig;
/**
 * Load CDK configuration for a specific environment
 *
 * @param env - Deployment environment ("dev" or "prod")
 * @param cdkDir - CDK directory path (default: current directory)
 * @returns Validated CDK configuration
 */
export declare function loadCdkConfig(env: "dev" | "prod", cdkDir?: string): CdkConfig;
/**
 * Apply environment variable overrides to configuration
 *
 * @param config - Base configuration
 * @returns Configuration with environment variable overrides applied
 */
export declare function applyEnvOverrides(config: CdkConfig): CdkConfig;
