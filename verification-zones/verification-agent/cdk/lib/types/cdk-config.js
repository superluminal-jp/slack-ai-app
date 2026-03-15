"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.loadCdkConfig = loadCdkConfig;
exports.applyEnvOverrides = applyEnvOverrides;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
/**
 * Zod schema for CDK configuration validation
 */
const CdkConfigSchema = zod_1.z.object({
    awsRegion: zod_1.z
        .string()
        .regex(/^[a-z]+-[a-z]+-[0-9]+$/, "Invalid AWS region format"),
    bedrockModelId: zod_1.z.string().min(1, "bedrockModelId is required"),
    deploymentEnv: zod_1.z.enum(["dev", "prod"], {
        errorMap: () => ({ message: "deploymentEnv must be 'dev' or 'prod'" }),
    }),
    verificationStackName: zod_1.z.string().min(1, "verificationStackName is required"),
    verificationAccountId: zod_1.z
        .string()
        .regex(/^\d{12}$/, "verificationAccountId must be a 12-digit AWS account ID"),
    executionAccountId: zod_1.z
        .string()
        .regex(/^\d{12}$/, "executionAccountId must be a 12-digit AWS account ID"),
    slackBotToken: zod_1.z.string().min(1, "slackBotToken cannot be empty").optional(),
    slackSigningSecret: zod_1.z
        .string()
        .min(1, "slackSigningSecret cannot be empty")
        .optional(),
    verificationAgentName: zod_1.z
        .string()
        .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/, "verificationAgentName must match pattern [a-zA-Z][a-zA-Z0-9_]{0,47}")
        .optional(),
    executionAgentArns: zod_1.z
        .record(zod_1.z.string(), zod_1.z.string().regex(/^arn:aws:bedrock-agentcore:.+:\d{12}:runtime\/.+/, "executionAgentArns values must be valid AgentCore Runtime ARNs"))
        .optional(),
    autoReplyChannelIds: zod_1.z.array(zod_1.z.string()).optional(),
    slackSearchAgentArn: zod_1.z
        .string()
        .regex(/^arn:aws:bedrock-agentcore:.+:\d{12}:runtime\/.+/, "slackSearchAgentArn must be a valid AgentCore Runtime ARN")
        .optional(),
});
/**
 * Load JSON configuration file
 * Converts empty strings to undefined for optional fields
 */
function loadJsonFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        // Convert empty strings to undefined for optional fields
        const cleaned = {};
        for (const [key, value] of Object.entries(parsed)) {
            // Skip empty strings for optional fields
            if (value === "" &&
                key === "executionAgentArns") {
                continue; // Skip empty optional field
            }
            // Type-safe assignment
            if (key in cleaned || key in CdkConfigSchema.shape) {
                cleaned[key] = value;
            }
        }
        return cleaned;
    }
    catch (error) {
        throw new Error(`Failed to load configuration file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Merge multiple configuration objects (later configs override earlier ones)
 */
function mergeConfigs(...configs) {
    const merged = {};
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
function validateConfig(config) {
    try {
        return CdkConfigSchema.parse(config);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const errorMessages = error.errors.map((e) => {
                const path = e.path.join(".");
                return `  - ${path}: ${e.message}`;
            });
            throw new Error(`Configuration validation failed:\n${errorMessages.join("\n")}`);
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
function loadCdkConfig(env, cdkDir) {
    const configDir = cdkDir
        ? path.resolve(cdkDir)
        : path.resolve(process.cwd(), "cdk");
    const configs = [];
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
        throw new Error(`Environment-specific configuration file not found: ${envConfigPath}\n` +
            `Please create cdk.config.${env}.json or use cdk.config.json.example as a template.`);
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
function applyEnvOverrides(config) {
    // Helper to convert empty string to undefined
    const envOrConfig = (envVar, configValue) => {
        const env = envVar?.trim();
        const cfg = configValue?.trim();
        const value = env || cfg;
        return value && value !== "" ? value : undefined;
    };
    const parseAutoReplyChannelIds = (raw) => {
        const value = raw?.trim();
        if (!value)
            return undefined;
        const ids = value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
        return ids.length > 0 ? ids : undefined;
    };
    const parseExecutionAgentArns = (raw) => {
        const value = raw?.trim();
        if (!value) {
            return undefined;
        }
        try {
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return undefined;
            }
            const out = {};
            for (const [key, arn] of Object.entries(parsed)) {
                if (typeof arn === "string" && arn.trim() !== "") {
                    out[key] = arn.trim();
                }
            }
            return Object.keys(out).length > 0 ? out : undefined;
        }
        catch {
            return undefined;
        }
    };
    const normalizeExecutionAgentArns = (raw) => {
        if (!raw || Object.keys(raw).length === 0) {
            return undefined;
        }
        const normalized = { ...raw };
        // Backward compatibility: legacy key "web-fetch" is normalized to "fetch-url".
        if (normalized["web-fetch"] && !normalized["fetch-url"]) {
            normalized["fetch-url"] = normalized["web-fetch"];
        }
        delete normalized["web-fetch"];
        return Object.keys(normalized).length > 0 ? normalized : undefined;
    };
    const mergedExecutionAgentArns = (config.executionAgentArns && Object.keys(config.executionAgentArns).length > 0
        ? { ...config.executionAgentArns }
        : undefined);
    const fromJson = parseExecutionAgentArns(process.env.EXECUTION_AGENT_ARNS);
    const fromSingles = {};
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
    const webFetchArn = process.env.WEB_FETCH_AGENT_ARN?.trim();
    if (webFetchArn) {
        fromSingles["fetch-url"] = webFetchArn;
    }
    const fromSingleMap = Object.keys(fromSingles).length > 0 ? fromSingles : undefined;
    const resolvedExecutionAgentArns = normalizeExecutionAgentArns(fromJson ?? fromSingleMap ?? mergedExecutionAgentArns);
    const slackSearchAgentArnFromEnv = process.env.SLACK_SEARCH_AGENT_ARN?.trim();
    return {
        ...config,
        awsRegion: process.env.AWS_REGION || config.awsRegion,
        bedrockModelId: process.env.BEDROCK_MODEL_ID || config.bedrockModelId,
        verificationAccountId: process.env.VERIFICATION_ACCOUNT_ID || config.verificationAccountId,
        executionAccountId: process.env.EXECUTION_ACCOUNT_ID || config.executionAccountId,
        slackBotToken: envOrConfig(process.env.SLACK_BOT_TOKEN, config.slackBotToken),
        slackSigningSecret: envOrConfig(process.env.SLACK_SIGNING_SECRET, config.slackSigningSecret),
        executionAgentArns: resolvedExecutionAgentArns,
        autoReplyChannelIds: parseAutoReplyChannelIds(process.env.AUTO_REPLY_CHANNEL_IDS) ??
            config.autoReplyChannelIds,
        slackSearchAgentArn: slackSearchAgentArnFromEnv || config.slackSearchAgentArn,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNkay1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQXVKSCx3Q0FlQztBQVNELHNDQXVDQztBQVFELDhDQW9IQztBQWhWRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZCQUF3QjtBQWtDeEI7O0dBRUc7QUFDSCxNQUFNLGVBQWUsR0FBRyxPQUFDLENBQUMsTUFBTSxDQUFDO0lBQy9CLFNBQVMsRUFBRSxPQUFDO1NBQ1QsTUFBTSxFQUFFO1NBQ1IsS0FBSyxDQUFDLHdCQUF3QixFQUFFLDJCQUEyQixDQUFDO0lBQy9ELGNBQWMsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSw0QkFBNEIsQ0FBQztJQUMvRCxhQUFhLEVBQUUsT0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsRUFBRTtRQUNyQyxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxDQUFDO0tBQ3ZFLENBQUM7SUFDRixxQkFBcUIsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQztJQUM3RSxxQkFBcUIsRUFBRSxPQUFDO1NBQ3JCLE1BQU0sRUFBRTtTQUNSLEtBQUssQ0FDSixVQUFVLEVBQ1YseURBQXlELENBQzFEO0lBQ0gsa0JBQWtCLEVBQUUsT0FBQztTQUNsQixNQUFNLEVBQUU7U0FDUixLQUFLLENBQUMsVUFBVSxFQUFFLHNEQUFzRCxDQUFDO0lBQzVFLGFBQWEsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJ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QUEwQixHQUM5QiwyQkFBMkIsQ0FDekIsUUFBUSxJQUFJLGFBQWEsSUFBSSx3QkFBd0IsQ0FDdEQsQ0FBQztJQUVKLE1BQU0sMEJBQTBCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUU5RSxPQUFPO1FBQ0wsR0FBRyxNQUFNO1FBQ1QsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLE1BQU0sQ0FBQyxTQUFTO1FBQ3JELGNBQWMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixJQUFJLE1BQU0sQ0FBQyxjQUFjO1FBQ3JFLHFCQUFxQixFQUNuQixPQUFPLENBQUMsR0FBRyxDQUFDLHVCQUF1QixJQUFJLE1BQU0sQ0FBQyxxQkFBcUI7UUFDckUsa0JBQWtCLEVBQ2hCLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLElBQUksTUFBTSxDQUFDLGtCQUFrQjtRQUMvRCxhQUFhLEVBQUUsV0FBVyxDQUN4QixPQUFPLENBQUMsR0FBRyxDQUFDLGVBQWUsRUFDM0IsTUFBTSxDQUFDLGFBQWEsQ0FDckI7UUFDRCxrQkFBa0IsRUFBRSxXQUFXLENBQzdCLE9BQU8sQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEVBQ2hDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FDMUI7UUFDRCxrQkFBa0IsRUFBRSwwQkFBMEI7UUFDOUMsbUJBQW1CLEVBQ2pCLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUM7WUFDNUQsTUFBTSxDQUFDLG1CQUFtQjtRQUM1QixtQkFBbUIsRUFDakIsMEJBQTBCLElBQUksTUFBTSxDQUFDLG1CQUFtQjtLQUMzRCxDQUFDO0FBQ0osQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQ0RLIENvbmZpZ3VyYXRpb24gTWFuYWdlbWVudCAoVmVyaWZpY2F0aW9uIFpvbmUpXG4gKlxuICogVGhpcyBtb2R1bGUgcHJvdmlkZXMgdHlwZS1zYWZlIGNvbmZpZ3VyYXRpb24gbG9hZGluZyBhbmQgdmFsaWRhdGlvbiBmb3IgdGhlXG4gKiBWZXJpZmljYXRpb24gWm9uZSBDREsgZGVwbG95bWVudC4gU3VwcG9ydHMgZW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvblxuICogZmlsZXMgd2l0aCBwcmlvcml0eS1iYXNlZCBtZXJnaW5nLlxuICpcbiAqIENvbmZpZ3VyYXRpb24gUHJpb3JpdHkgKGhpZ2ggdG8gbG93KTpcbiAqIDEuIEVudmlyb25tZW50IHZhcmlhYmxlc1xuICogMi4gQ29tbWFuZC1saW5lIGFyZ3VtZW50cyAoLS1jb250ZXh0IGtleT12YWx1ZSlcbiAqIDMuIEVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZyBmaWxlIChjZGsuY29uZmlnLntlbnZ9Lmpzb24pXG4gKiA0LiBMb2NhbCBjb25maWcgZmlsZSAoY2RrLmNvbmZpZy5sb2NhbC5qc29uIC0gb3B0aW9uYWwpXG4gKiA1LiBCYXNlIGNvbmZpZyBmaWxlIChjZGsuY29uZmlnLmpzb24gLSBvcHRpb25hbClcbiAqIDYuIERlZmF1bHQgdmFsdWVzIChpbiBjb2RlKVxuICpcbiAqIEtleSB0eXBlczogQ2RrQ29uZmlnICh2YWxpZGF0ZWQgc2hhcGUpLiBLZXkgZnVuY3Rpb25zOiBsb2FkQ2RrQ29uZmlnLCB2YWxpZGF0ZUNvbmZpZywgYXBwbHlFbnZPdmVycmlkZXMuXG4gKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyB6IH0gZnJvbSBcInpvZFwiO1xuXG4vKipcbiAqIFZhbGlkYXRlZCBDREsgY29uZmlndXJhdGlvbiBzaGFwZSBmb3IgdGhlIFZlcmlmaWNhdGlvbiBab25lLlxuICogQWxsIHJlcXVpcmVkIGZpZWxkcyBhcmUgZW5mb3JjZWQgYnkgQ2RrQ29uZmlnU2NoZW1hIChab2QpLlxuICogT3B0aW9uYWwgZmllbGRzIChlLmcuIHNsYWNrQm90VG9rZW4sIGV4ZWN1dGlvbkFnZW50QXJucykgbWF5IGJlIHNldCB2aWEgZW52IG9yIGNvbmZpZyBmaWxlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIENka0NvbmZpZyB7XG4gIC8qKiBBV1MgUmVnaW9uIGZvciBkZXBsb3ltZW50ICovXG4gIGF3c1JlZ2lvbjogc3RyaW5nO1xuICAvKiogQmVkcm9jayBtb2RlbCBJRCB0byB1c2UgZm9yIEFJIHByb2Nlc3NpbmcgKi9cbiAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZztcbiAgLyoqIERlcGxveW1lbnQgZW52aXJvbm1lbnQ6IFwiZGV2XCIgb3IgXCJwcm9kXCIgKi9cbiAgZGVwbG95bWVudEVudjogXCJkZXZcIiB8IFwicHJvZFwiO1xuICAvKiogQmFzZSBuYW1lIGZvciBWZXJpZmljYXRpb24gU3RhY2sgKHdpdGhvdXQgZW52aXJvbm1lbnQgc3VmZml4KSAqL1xuICB2ZXJpZmljYXRpb25TdGFja05hbWU6IHN0cmluZztcbiAgLyoqIEFXUyBBY2NvdW50IElEIGZvciBWZXJpZmljYXRpb24gU3RhY2sgKi9cbiAgdmVyaWZpY2F0aW9uQWNjb3VudElkOiBzdHJpbmc7XG4gIC8qKiBBV1MgQWNjb3VudCBJRCBmb3IgRXhlY3V0aW9uIFN0YWNrIChmb3IgY3Jvc3MtYWNjb3VudCBBMkEpICovXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogc3RyaW5nO1xuICAvKiogU2xhY2sgQm90IFRva2VuIChvcHRpb25hbCwgY2FuIGJlIHNldCB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGUpICovXG4gIHNsYWNrQm90VG9rZW4/OiBzdHJpbmc7XG4gIC8qKiBTbGFjayBTaWduaW5nIFNlY3JldCAob3B0aW9uYWwsIGNhbiBiZSBzZXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlKSAqL1xuICBzbGFja1NpZ25pbmdTZWNyZXQ/OiBzdHJpbmc7XG4gIC8qKiBOYW1lIGZvciB0aGUgVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbCkgKi9cbiAgdmVyaWZpY2F0aW9uQWdlbnROYW1lPzogc3RyaW5nO1xuICAvKiogTWFwIG9mIGV4ZWN1dGlvbiBhZ2VudCBJRHMgdG8gcnVudGltZSBBUk5zIGZvciBBMkEgKG9wdGlvbmFsOyBmcm9tIHN0YWNrIG91dHB1dHMgb3IgY29uZmlnKSAqL1xuICBleGVjdXRpb25BZ2VudEFybnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAvKiogQ2hhbm5lbCBJRHMgd2hlcmUgdGhlIGJvdCBhdXRvLXJlcGxpZXMgd2l0aG91dCBhIG1lbnRpb24gKG9wdGlvbmFsKSAqL1xuICBhdXRvUmVwbHlDaGFubmVsSWRzPzogc3RyaW5nW107XG4gIC8qKiBBUk4gb2YgdGhlIFNsYWNrIFNlYXJjaCBBZ2VudCBBZ2VudENvcmUgUnVudGltZSAob3B0aW9uYWwpICovXG4gIHNsYWNrU2VhcmNoQWdlbnRBcm4/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogWm9kIHNjaGVtYSBmb3IgQ0RLIGNvbmZpZ3VyYXRpb24gdmFsaWRhdGlvblxuICovXG5jb25zdCBDZGtDb25maWdTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGF3c1JlZ2lvbjogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleCgvXlthLXpdKy1bYS16XSstWzAtOV0rJC8sIFwiSW52YWxpZCBBV1MgcmVnaW9uIGZvcm1hdFwiKSxcbiAgYmVkcm9ja01vZGVsSWQ6IHouc3RyaW5nKCkubWluKDEsIFwiYmVkcm9ja01vZGVsSWQgaXMgcmVxdWlyZWRcIiksXG4gIGRlcGxveW1lbnRFbnY6IHouZW51bShbXCJkZXZcIiwgXCJwcm9kXCJdLCB7XG4gICAgZXJyb3JNYXA6ICgpID0+ICh7IG1lc3NhZ2U6IFwiZGVwbG95bWVudEVudiBtdXN0IGJlICdkZXYnIG9yICdwcm9kJ1wiIH0pLFxuICB9KSxcbiAgdmVyaWZpY2F0aW9uU3RhY2tOYW1lOiB6LnN0cmluZygpLm1pbigxLCBcInZlcmlmaWNhdGlvblN0YWNrTmFtZSBpcyByZXF1aXJlZFwiKSxcbiAgdmVyaWZpY2F0aW9uQWNjb3VudElkOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KFxuICAgICAgL15cXGR7MTJ9JC8sXG4gICAgICBcInZlcmlmaWNhdGlvbkFjY291bnRJZCBtdXN0IGJlIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSURcIlxuICAgICksXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleCgvXlxcZHsxMn0kLywgXCJleGVjdXRpb25BY2NvdW50SWQgbXVzdCBiZSBhIDEyLWRpZ2l0IEFXUyBhY2NvdW50IElEXCIpLFxuICBzbGFja0JvdFRva2VuOiB6LnN0cmluZygpLm1pbigxLCBcInNsYWNrQm90VG9rZW4gY2Fubm90IGJlIGVtcHR5XCIpLm9wdGlvbmFsKCksXG4gIHNsYWNrU2lnbmluZ1NlY3JldDogelxuICAgIC5zdHJpbmcoKVxuICAgIC5taW4oMSwgXCJzbGFja1NpZ25pbmdTZWNyZXQgY2Fubm90IGJlIGVtcHR5XCIpXG4gICAgLm9wdGlvbmFsKCksXG4gIHZlcmlmaWNhdGlvbkFnZW50TmFtZTogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleChcbiAgICAgIC9eW2EtekEtWl1bYS16QS1aMC05X117MCw0N30kLyxcbiAgICAgIFwidmVyaWZpY2F0aW9uQWdlbnROYW1lIG11c3QgbWF0Y2ggcGF0dGVybiBbYS16QS1aXVthLXpBLVowLTlfXXswLDQ3fVwiXG4gICAgKVxuICAgIC5vcHRpb25hbCgpLFxuICBleGVjdXRpb25BZ2VudEFybnM6IHpcbiAgICAucmVjb3JkKFxuICAgICAgei5zdHJpbmcoKSxcbiAgICAgIHouc3RyaW5nKCkucmVnZXgoXG4gICAgICAgIC9eYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTouKzpcXGR7MTJ9OnJ1bnRpbWVcXC8uKy8sXG4gICAgICAgIFwiZXhlY3V0aW9uQWdlbnRBcm5zIHZhbHVlcyBtdXN0IGJlIHZhbGlkIEFnZW50Q29yZSBSdW50aW1lIEFSTnNcIlxuICAgICAgKVxuICAgIClcbiAgICAub3B0aW9uYWwoKSxcbiAgYXV0b1JlcGx5Q2hhbm5lbElkczogei5hcnJheSh6LnN0cmluZygpKS5vcHRpb25hbCgpLFxuICBzbGFja1NlYXJjaEFnZW50QXJuOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KFxuICAgICAgL15hcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOi4rOlxcZHsxMn06cnVudGltZVxcLy4rLyxcbiAgICAgIFwic2xhY2tTZWFyY2hBZ2VudEFybiBtdXN0IGJlIGEgdmFsaWQgQWdlbnRDb3JlIFJ1bnRpbWUgQVJOXCJcbiAgICApXG4gICAgLm9wdGlvbmFsKCksXG59KTtcblxuLyoqXG4gKiBQYXJ0aWFsIGNvbmZpZ3VyYXRpb24gdHlwZSBmb3IgbWVyZ2luZ1xuICovXG50eXBlIFBhcnRpYWxDZGtDb25maWcgPSBQYXJ0aWFsPENka0NvbmZpZz47XG5cbi8qKlxuICogTG9hZCBKU09OIGNvbmZpZ3VyYXRpb24gZmlsZVxuICogQ29udmVydHMgZW1wdHkgc3RyaW5ncyB0byB1bmRlZmluZWQgZm9yIG9wdGlvbmFsIGZpZWxkc1xuICovXG5mdW5jdGlvbiBsb2FkSnNvbkZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IFBhcnRpYWxDZGtDb25maWcgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgXCJ1dGYtOFwiKTtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNvbnRlbnQpIGFzIFBhcnRpYWw8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+O1xuXG4gICAgLy8gQ29udmVydCBlbXB0eSBzdHJpbmdzIHRvIHVuZGVmaW5lZCBmb3Igb3B0aW9uYWwgZmllbGRzXG4gICAgY29uc3QgY2xlYW5lZDogUGFydGlhbENka0NvbmZpZyA9IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHBhcnNlZCkpIHtcbiAgICAgIC8vIFNraXAgZW1wdHkgc3RyaW5ncyBmb3Igb3B0aW9uYWwgZmllbGRzXG4gICAgICBpZiAoXG4gICAgICAgIHZhbHVlID09PSBcIlwiICYmXG4gICAgICAgIGtleSA9PT0gXCJleGVjdXRpb25BZ2VudEFybnNcIlxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlOyAvLyBTa2lwIGVtcHR5IG9wdGlvbmFsIGZpZWxkXG4gICAgICB9XG4gICAgICAvLyBUeXBlLXNhZmUgYXNzaWdubWVudFxuICAgICAgaWYgKGtleSBpbiBjbGVhbmVkIHx8IGtleSBpbiBDZGtDb25maWdTY2hlbWEuc2hhcGUpIHtcbiAgICAgICAgKGNsZWFuZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gY2xlYW5lZDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRmFpbGVkIHRvIGxvYWQgY29uZmlndXJhdGlvbiBmaWxlICR7ZmlsZVBhdGh9OiAke1xuICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcilcbiAgICAgIH1gXG4gICAgKTtcbiAgfVxufVxuXG4vKipcbiAqIE1lcmdlIG11bHRpcGxlIGNvbmZpZ3VyYXRpb24gb2JqZWN0cyAobGF0ZXIgY29uZmlncyBvdmVycmlkZSBlYXJsaWVyIG9uZXMpXG4gKi9cbmZ1bmN0aW9uIG1lcmdlQ29uZmlncyhcbiAgLi4uY29uZmlnczogKFBhcnRpYWxDZGtDb25maWcgfCBudWxsKVtdXG4pOiBQYXJ0aWFsQ2RrQ29uZmlnIHtcbiAgY29uc3QgbWVyZ2VkOiBQYXJ0aWFsQ2RrQ29uZmlnID0ge307XG4gIGZvciAoY29uc3QgY29uZmlnIG9mIGNvbmZpZ3MpIHtcbiAgICBpZiAoY29uZmlnKSB7XG4gICAgICBPYmplY3QuYXNzaWduKG1lcmdlZCwgY29uZmlnKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG1lcmdlZDtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBjb25maWd1cmF0aW9uIHVzaW5nIFpvZCBzY2hlbWFcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlQ29uZmlnKGNvbmZpZzogdW5rbm93bik6IENka0NvbmZpZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIENka0NvbmZpZ1NjaGVtYS5wYXJzZShjb25maWcpO1xuICB9IGNhdGNoIChlcnJvcjogdW5rbm93bikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIHouWm9kRXJyb3IpIHtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZXMgPSBlcnJvci5lcnJvcnMubWFwKChlOiB6LlpvZElzc3VlKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBlLnBhdGguam9pbihcIi5cIik7XG4gICAgICAgIHJldHVybiBgICAtICR7cGF0aH06ICR7ZS5tZXNzYWdlfWA7XG4gICAgICB9KTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbmZpZ3VyYXRpb24gdmFsaWRhdGlvbiBmYWlsZWQ6XFxuJHtlcnJvck1lc3NhZ2VzLmpvaW4oXCJcXG5cIil9YFxuICAgICAgKTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBMb2FkIENESyBjb25maWd1cmF0aW9uIGZvciBhIHNwZWNpZmljIGVudmlyb25tZW50XG4gKlxuICogQHBhcmFtIGVudiAtIERlcGxveW1lbnQgZW52aXJvbm1lbnQgKFwiZGV2XCIgb3IgXCJwcm9kXCIpXG4gKiBAcGFyYW0gY2RrRGlyIC0gQ0RLIGRpcmVjdG9yeSBwYXRoIChkZWZhdWx0OiBjdXJyZW50IGRpcmVjdG9yeSlcbiAqIEByZXR1cm5zIFZhbGlkYXRlZCBDREsgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZENka0NvbmZpZyhlbnY6IFwiZGV2XCIgfCBcInByb2RcIiwgY2RrRGlyPzogc3RyaW5nKTogQ2RrQ29uZmlnIHtcbiAgY29uc3QgY29uZmlnRGlyID0gY2RrRGlyXG4gICAgPyBwYXRoLnJlc29sdmUoY2RrRGlyKVxuICAgIDogcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIFwiY2RrXCIpO1xuICBjb25zdCBjb25maWdzOiAoUGFydGlhbENka0NvbmZpZyB8IG51bGwpW10gPSBbXTtcblxuICAvLyAxLiBMb2FkIGJhc2UgY29uZmlnIChvcHRpb25hbClcbiAgY29uc3QgYmFzZUNvbmZpZ1BhdGggPSBwYXRoLmpvaW4oY29uZmlnRGlyLCBcImNkay5jb25maWcuanNvblwiKTtcbiAgY29uc3QgYmFzZUNvbmZpZyA9IGxvYWRKc29uRmlsZShiYXNlQ29uZmlnUGF0aCk7XG4gIGlmIChiYXNlQ29uZmlnKSB7XG4gICAgY29uZmlncy5wdXNoKGJhc2VDb25maWcpO1xuICB9XG5cbiAgLy8gMi4gTG9hZCBsb2NhbCBjb25maWcgKG9wdGlvbmFsLCBmb3IgcGVyc29uYWwgb3ZlcnJpZGVzKVxuICBjb25zdCBsb2NhbENvbmZpZ1BhdGggPSBwYXRoLmpvaW4oY29uZmlnRGlyLCBcImNkay5jb25maWcubG9jYWwuanNvblwiKTtcbiAgY29uc3QgbG9jYWxDb25maWcgPSBsb2FkSnNvbkZpbGUobG9jYWxDb25maWdQYXRoKTtcbiAgaWYgKGxvY2FsQ29uZmlnKSB7XG4gICAgY29uZmlncy5wdXNoKGxvY2FsQ29uZmlnKTtcbiAgfVxuXG4gIC8vIDMuIExvYWQgZW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlnIChyZXF1aXJlZClcbiAgY29uc3QgZW52Q29uZmlnUGF0aCA9IHBhdGguam9pbihjb25maWdEaXIsIGBjZGsuY29uZmlnLiR7ZW52fS5qc29uYCk7XG4gIGNvbnN0IGVudkNvbmZpZyA9IGxvYWRKc29uRmlsZShlbnZDb25maWdQYXRoKTtcbiAgaWYgKCFlbnZDb25maWcpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBmaWxlIG5vdCBmb3VuZDogJHtlbnZDb25maWdQYXRofVxcbmAgK1xuICAgICAgICBgUGxlYXNlIGNyZWF0ZSBjZGsuY29uZmlnLiR7ZW52fS5qc29uIG9yIHVzZSBjZGsuY29uZmlnLmpzb24uZXhhbXBsZSBhcyBhIHRlbXBsYXRlLmBcbiAgICApO1xuICB9XG4gIGNvbmZpZ3MucHVzaChlbnZDb25maWcpO1xuXG4gIC8vIE1lcmdlIGFsbCBjb25maWdzIChsYXRlciBjb25maWdzIG92ZXJyaWRlIGVhcmxpZXIgb25lcylcbiAgY29uc3QgbWVyZ2VkQ29uZmlnID0gbWVyZ2VDb25maWdzKC4uLmNvbmZpZ3MpO1xuXG4gIC8vIEVuc3VyZSBkZXBsb3ltZW50RW52IG1hdGNoZXMgdGhlIHJlcXVlc3RlZCBlbnZpcm9ubWVudFxuICBtZXJnZWRDb25maWcuZGVwbG95bWVudEVudiA9IGVudjtcblxuICAvLyBWYWxpZGF0ZSBhbmQgcmV0dXJuXG4gIHJldHVybiB2YWxpZGF0ZUNvbmZpZyhtZXJnZWRDb25maWcpO1xufVxuXG4vKipcbiAqIEFwcGx5IGVudmlyb25tZW50IHZhcmlhYmxlIG92ZXJyaWRlcyB0byBjb25maWd1cmF0aW9uXG4gKlxuICogQHBhcmFtIGNvbmZpZyAtIEJhc2UgY29uZmlndXJhdGlvblxuICogQHJldHVybnMgQ29uZmlndXJhdGlvbiB3aXRoIGVudmlyb25tZW50IHZhcmlhYmxlIG92ZXJyaWRlcyBhcHBsaWVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUVudk92ZXJyaWRlcyhjb25maWc6IENka0NvbmZpZyk6IENka0NvbmZpZyB7XG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGVtcHR5IHN0cmluZyB0byB1bmRlZmluZWRcbiAgY29uc3QgZW52T3JDb25maWcgPSAoXG4gICAgZW52VmFyOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgY29uZmlnVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZFxuICApOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGVudiA9IGVudlZhcj8udHJpbSgpO1xuICAgIGNvbnN0IGNmZyA9IGNvbmZpZ1ZhbHVlPy50cmltKCk7XG4gICAgY29uc3QgdmFsdWUgPSBlbnYgfHwgY2ZnO1xuICAgIHJldHVybiB2YWx1ZSAmJiB2YWx1ZSAhPT0gXCJcIiA/IHZhbHVlIDogdW5kZWZpbmVkO1xuICB9O1xuXG4gIGNvbnN0IHBhcnNlQXV0b1JlcGx5Q2hhbm5lbElkcyA9IChcbiAgICByYXc6IHN0cmluZyB8IHVuZGVmaW5lZFxuICApOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSByYXc/LnRyaW0oKTtcbiAgICBpZiAoIXZhbHVlKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGlkcyA9IHZhbHVlLnNwbGl0KFwiLFwiKS5tYXAoKHMpID0+IHMudHJpbSgpKS5maWx0ZXIoKHMpID0+IHMubGVuZ3RoID4gMCk7XG4gICAgcmV0dXJuIGlkcy5sZW5ndGggPiAwID8gaWRzIDogdW5kZWZpbmVkO1xuICB9O1xuXG4gIGNvbnN0IHBhcnNlRXhlY3V0aW9uQWdlbnRBcm5zID0gKFxuICAgIHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcmF3Py50cmltKCk7XG4gICAgaWYgKCF2YWx1ZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UodmFsdWUpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuICAgICAgaWYgKCFwYXJzZWQgfHwgdHlwZW9mIHBhcnNlZCAhPT0gXCJvYmplY3RcIiB8fCBBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICAgICAgZm9yIChjb25zdCBba2V5LCBhcm5dIG9mIE9iamVjdC5lbnRyaWVzKHBhcnNlZCkpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBhcm4gPT09IFwic3RyaW5nXCIgJiYgYXJuLnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICAgIG91dFtrZXldID0gYXJuLnRyaW0oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKG91dCkubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZDtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IG5vcm1hbGl6ZUV4ZWN1dGlvbkFnZW50QXJucyA9IChcbiAgICByYXc6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWRcbiAgKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCA9PiB7XG4gICAgaWYgKCFyYXcgfHwgT2JqZWN0LmtleXMocmF3KS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSB7IC4uLnJhdyB9O1xuICAgIC8vIEJhY2t3YXJkIGNvbXBhdGliaWxpdHk6IGxlZ2FjeSBrZXkgXCJ3ZWItZmV0Y2hcIiBpcyBub3JtYWxpemVkIHRvIFwiZmV0Y2gtdXJsXCIuXG4gICAgaWYgKG5vcm1hbGl6ZWRbXCJ3ZWItZmV0Y2hcIl0gJiYgIW5vcm1hbGl6ZWRbXCJmZXRjaC11cmxcIl0pIHtcbiAgICAgIG5vcm1hbGl6ZWRbXCJmZXRjaC11cmxcIl0gPSBub3JtYWxpemVkW1wid2ViLWZldGNoXCJdO1xuICAgIH1cbiAgICBkZWxldGUgbm9ybWFsaXplZFtcIndlYi1mZXRjaFwiXTtcbiAgICByZXR1cm4gT2JqZWN0LmtleXMobm9ybWFsaXplZCkubGVuZ3RoID4gMCA/IG5vcm1hbGl6ZWQgOiB1bmRlZmluZWQ7XG4gIH07XG5cbiAgY29uc3QgbWVyZ2VkRXhlY3V0aW9uQWdlbnRBcm5zID0gKFxuICAgIGNvbmZpZy5leGVjdXRpb25BZ2VudEFybnMgJiYgT2JqZWN0LmtleXMoY29uZmlnLmV4ZWN1dGlvbkFnZW50QXJucykubGVuZ3RoID4gMFxuICAgICAgPyB7IC4uLmNvbmZpZy5leGVjdXRpb25BZ2VudEFybnMgfVxuICAgICAgOiB1bmRlZmluZWRcbiAgKTtcbiAgY29uc3QgZnJvbUpzb24gPSBwYXJzZUV4ZWN1dGlvbkFnZW50QXJucyhwcm9jZXNzLmVudi5FWEVDVVRJT05fQUdFTlRfQVJOUyk7XG4gIGNvbnN0IGZyb21TaW5nbGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gIGNvbnN0IGZpbGVDcmVhdG9yQXJuID0gcHJvY2Vzcy5lbnYuRklMRV9DUkVBVE9SX0FHRU5UX0FSTj8udHJpbSgpO1xuICBpZiAoZmlsZUNyZWF0b3JBcm4pIHtcbiAgICBmcm9tU2luZ2xlc1tcImZpbGUtY3JlYXRvclwiXSA9IGZpbGVDcmVhdG9yQXJuO1xuICB9XG4gIGNvbnN0IGRvY3NBcm4gPSBwcm9jZXNzLmVudi5ET0NTX0FHRU5UX0FSTj8udHJpbSgpO1xuICBpZiAoZG9jc0Fybikge1xuICAgIGZyb21TaW5nbGVzLmRvY3MgPSBkb2NzQXJuO1xuICB9XG4gIGNvbnN0IHRpbWVBcm4gPSBwcm9jZXNzLmVudi5USU1FX0FHRU5UX0FSTj8udHJpbSgpO1xuICBpZiAodGltZUFybikge1xuICAgIGZyb21TaW5nbGVzLnRpbWUgPSB0aW1lQXJuO1xuICB9XG4gIGNvbnN0IHdlYkZldGNoQXJuID0gcHJvY2Vzcy5lbnYuV0VCX0ZFVENIX0FHRU5UX0FSTj8udHJpbSgpO1xuICBpZiAod2ViRmV0Y2hBcm4pIHtcbiAgICBmcm9tU2luZ2xlc1tcImZldGNoLXVybFwiXSA9IHdlYkZldGNoQXJuO1xuICB9XG4gIGNvbnN0IGZyb21TaW5nbGVNYXAgPVxuICAgIE9iamVjdC5rZXlzKGZyb21TaW5nbGVzKS5sZW5ndGggPiAwID8gZnJvbVNpbmdsZXMgOiB1bmRlZmluZWQ7XG5cbiAgY29uc3QgcmVzb2x2ZWRFeGVjdXRpb25BZ2VudEFybnMgPVxuICAgIG5vcm1hbGl6ZUV4ZWN1dGlvbkFnZW50QXJucyhcbiAgICAgIGZyb21Kc29uID8/IGZyb21TaW5nbGVNYXAgPz8gbWVyZ2VkRXhlY3V0aW9uQWdlbnRBcm5zXG4gICAgKTtcblxuICBjb25zdCBzbGFja1NlYXJjaEFnZW50QXJuRnJvbUVudiA9IHByb2Nlc3MuZW52LlNMQUNLX1NFQVJDSF9BR0VOVF9BUk4/LnRyaW0oKTtcblxuICByZXR1cm4ge1xuICAgIC4uLmNvbmZpZyxcbiAgICBhd3NSZWdpb246IHByb2Nlc3MuZW52LkFXU19SRUdJT04gfHwgY29uZmlnLmF3c1JlZ2lvbixcbiAgICBiZWRyb2NrTW9kZWxJZDogcHJvY2Vzcy5lbnYuQkVEUk9DS19NT0RFTF9JRCB8fCBjb25maWcuYmVkcm9ja01vZGVsSWQsXG4gICAgdmVyaWZpY2F0aW9uQWNjb3VudElkOlxuICAgICAgcHJvY2Vzcy5lbnYuVkVSSUZJQ0FUSU9OX0FDQ09VTlRfSUQgfHwgY29uZmlnLnZlcmlmaWNhdGlvbkFjY291bnRJZCxcbiAgICBleGVjdXRpb25BY2NvdW50SWQ6XG4gICAgICBwcm9jZXNzLmVudi5FWEVDVVRJT05fQUNDT1VOVF9JRCB8fCBjb25maWcuZXhlY3V0aW9uQWNjb3VudElkLFxuICAgIHNsYWNrQm90VG9rZW46IGVudk9yQ29uZmlnKFxuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfQk9UX1RPS0VOLFxuICAgICAgY29uZmlnLnNsYWNrQm90VG9rZW5cbiAgICApLFxuICAgIHNsYWNrU2lnbmluZ1NlY3JldDogZW52T3JDb25maWcoXG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19TSUdOSU5HX1NFQ1JFVCxcbiAgICAgIGNvbmZpZy5zbGFja1NpZ25pbmdTZWNyZXRcbiAgICApLFxuICAgIGV4ZWN1dGlvbkFnZW50QXJuczogcmVzb2x2ZWRFeGVjdXRpb25BZ2VudEFybnMsXG4gICAgYXV0b1JlcGx5Q2hhbm5lbElkczpcbiAgICAgIHBhcnNlQXV0b1JlcGx5Q2hhbm5lbElkcyhwcm9jZXNzLmVudi5BVVRPX1JFUExZX0NIQU5ORUxfSURTKSA/P1xuICAgICAgY29uZmlnLmF1dG9SZXBseUNoYW5uZWxJZHMsXG4gICAgc2xhY2tTZWFyY2hBZ2VudEFybjpcbiAgICAgIHNsYWNrU2VhcmNoQWdlbnRBcm5Gcm9tRW52IHx8IGNvbmZpZy5zbGFja1NlYXJjaEFnZW50QXJuLFxuICB9O1xufVxuIl19