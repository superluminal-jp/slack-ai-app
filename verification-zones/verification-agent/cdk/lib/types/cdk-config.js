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
    autoReplyChannelIds: zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.object({ id: zod_1.z.string(), label: zod_1.z.string() })])).optional(),
    mentionChannelIds: zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.object({ id: zod_1.z.string(), label: zod_1.z.string() })])).optional(),
    slackSearchAgentArn: zod_1.z
        .string()
        .regex(/^arn:aws:bedrock-agentcore:.+:\d{12}:runtime\/.+/, "slackSearchAgentArn must be a valid AgentCore Runtime ARN")
        .optional(),
    archiveAccountId: zod_1.z
        .string()
        .regex(/^\d{12}$/, "archiveAccountId must be a 12-digit AWS account ID")
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
        mentionChannelIds: parseAutoReplyChannelIds(process.env.MENTION_CHANNEL_IDS) ??
            config.mentionChannelIds,
        slackSearchAgentArn: slackSearchAgentArnFromEnv || config.slackSearchAgentArn,
        archiveAccountId: process.env.ARCHIVE_ACCOUNT_ID?.trim() || config.archiveAccountId,
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNkay1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQStLSCx3Q0FlQztBQVNELHNDQXVDQztBQVFELDhDQXlIQztBQTdXRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZCQUF3QjtBQWlEeEI7O0dBRUc7QUFDSCxNQUFNLGVBQWUsR0FBRyxPQUFDLENBQUMsTUFBTSxDQUFDO0lBQy9CLFNBQVMsRUFBRSxPQUFDO1NBQ1QsTUFBTSxFQUFFO1NBQ1IsS0FBSyxDQUFDLHdCQUF3QixFQUFFLDJCQUEyQixDQUFDO0lBQy9ELGNBQWMsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSw0QkFBNEIsQ0FBQztJQUMvRCxhQUFhLEVBQUUsT0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsRUFBRTtRQUNyQyxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxDQUFDO0tBQ3ZFLENBQUM7SUFDRixxQkFBcUIsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQztJQUM3RSxxQkFBcUIsRUFBRSxPQUFDO1NBQ3JCLE1BQU0sRUFBRTtTQUNSLEtBQUssQ0FDSixVQUFVLEVBQ1YseURBQXlELENBQzFEO0lBQ0gsa0JBQWtCLEVBQUUsT0FBQztTQUNsQixNQUFNLEVBQUU7U0FDUixLQUFLLENBQUMsVUFBVSxFQUFFLHNEQUFzRCxDQUFDO0lBQzVFLGFBQWEsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJ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QUFDLEdBQUcsQ0FBQyxlQUFlLEVBQzNCLE1BQU0sQ0FBQyxhQUFhLENBQ3JCO1FBQ0Qsa0JBQWtCLEVBQUUsV0FBVyxDQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixFQUNoQyxNQUFNLENBQUMsa0JBQWtCLENBQzFCO1FBQ0Qsa0JBQWtCLEVBQUUsMEJBQTBCO1FBQzlDLG1CQUFtQixFQUNoQix3QkFBd0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFrQztZQUM5RixNQUFNLENBQUMsbUJBQW1CO1FBQzVCLGlCQUFpQixFQUNkLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQWtDO1lBQzNGLE1BQU0sQ0FBQyxpQkFBaUI7UUFDMUIsbUJBQW1CLEVBQ2pCLDBCQUEwQixJQUFJLE1BQU0sQ0FBQyxtQkFBbUI7UUFDMUQsZ0JBQWdCLEVBQ2QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsZ0JBQWdCO0tBQ3BFLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDREsgQ29uZmlndXJhdGlvbiBNYW5hZ2VtZW50IChWZXJpZmljYXRpb24gWm9uZSlcbiAqXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyB0eXBlLXNhZmUgY29uZmlndXJhdGlvbiBsb2FkaW5nIGFuZCB2YWxpZGF0aW9uIGZvciB0aGVcbiAqIFZlcmlmaWNhdGlvbiBab25lIENESyBkZXBsb3ltZW50LiBTdXBwb3J0cyBlbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uXG4gKiBmaWxlcyB3aXRoIHByaW9yaXR5LWJhc2VkIG1lcmdpbmcuXG4gKlxuICogQ29uZmlndXJhdGlvbiBQcmlvcml0eSAoaGlnaCB0byBsb3cpOlxuICogMS4gRW52aXJvbm1lbnQgdmFyaWFibGVzXG4gKiAyLiBDb21tYW5kLWxpbmUgYXJndW1lbnRzICgtLWNvbnRleHQga2V5PXZhbHVlKVxuICogMy4gRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlnIGZpbGUgKGNkay5jb25maWcue2Vudn0uanNvbilcbiAqIDQuIExvY2FsIGNvbmZpZyBmaWxlIChjZGsuY29uZmlnLmxvY2FsLmpzb24gLSBvcHRpb25hbClcbiAqIDUuIEJhc2UgY29uZmlnIGZpbGUgKGNkay5jb25maWcuanNvbiAtIG9wdGlvbmFsKVxuICogNi4gRGVmYXVsdCB2YWx1ZXMgKGluIGNvZGUpXG4gKlxuICogS2V5IHR5cGVzOiBDZGtDb25maWcgKHZhbGlkYXRlZCBzaGFwZSkuIEtleSBmdW5jdGlvbnM6IGxvYWRDZGtDb25maWcsIHZhbGlkYXRlQ29uZmlnLCBhcHBseUVudk92ZXJyaWRlcy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tIFwiZnNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHogfSBmcm9tIFwiem9kXCI7XG5cbi8qKlxuICogQSBjaGFubmVsIElEIGVudHJ5IOKAlCBlaXRoZXIgYSBwbGFpbiBTbGFjayBjaGFubmVsIElEIHN0cmluZyBvciBhbiBvYmplY3Qgd2l0aFxuICogYW4gaWQgYW5kIGFuIG9wdGlvbmFsIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGZvciBtYW5hZ2VtZW50IHB1cnBvc2VzLlxuICogVGhlIGxhYmVsIGlzIG5ldmVyIHVzZWQgZm9yIGF1dGhvcml6YXRpb247IGl0IG9ubHkgYXBwZWFycyBpbiBsb2dzLlxuICovXG5leHBvcnQgdHlwZSBDaGFubmVsSWRFbnRyeSA9IHN0cmluZyB8IHsgaWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9O1xuXG4vKipcbiAqIFZhbGlkYXRlZCBDREsgY29uZmlndXJhdGlvbiBzaGFwZSBmb3IgdGhlIFZlcmlmaWNhdGlvbiBab25lLlxuICogQWxsIHJlcXVpcmVkIGZpZWxkcyBhcmUgZW5mb3JjZWQgYnkgQ2RrQ29uZmlnU2NoZW1hIChab2QpLlxuICogT3B0aW9uYWwgZmllbGRzIChlLmcuIHNsYWNrQm90VG9rZW4sIGV4ZWN1dGlvbkFnZW50QXJucykgbWF5IGJlIHNldCB2aWEgZW52IG9yIGNvbmZpZyBmaWxlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIENka0NvbmZpZyB7XG4gIC8qKiBBV1MgUmVnaW9uIGZvciBkZXBsb3ltZW50ICovXG4gIGF3c1JlZ2lvbjogc3RyaW5nO1xuICAvKiogQmVkcm9jayBtb2RlbCBJRCB0byB1c2UgZm9yIEFJIHByb2Nlc3NpbmcgKi9cbiAgYmVkcm9ja01vZGVsSWQ6IHN0cmluZztcbiAgLyoqIERlcGxveW1lbnQgZW52aXJvbm1lbnQ6IFwiZGV2XCIgb3IgXCJwcm9kXCIgKi9cbiAgZGVwbG95bWVudEVudjogXCJkZXZcIiB8IFwicHJvZFwiO1xuICAvKiogQmFzZSBuYW1lIGZvciBWZXJpZmljYXRpb24gU3RhY2sgKHdpdGhvdXQgZW52aXJvbm1lbnQgc3VmZml4KSAqL1xuICB2ZXJpZmljYXRpb25TdGFja05hbWU6IHN0cmluZztcbiAgLyoqIEFXUyBBY2NvdW50IElEIGZvciBWZXJpZmljYXRpb24gU3RhY2sgKi9cbiAgdmVyaWZpY2F0aW9uQWNjb3VudElkOiBzdHJpbmc7XG4gIC8qKiBBV1MgQWNjb3VudCBJRCBmb3IgRXhlY3V0aW9uIFN0YWNrIChmb3IgY3Jvc3MtYWNjb3VudCBBMkEpICovXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogc3RyaW5nO1xuICAvKiogU2xhY2sgQm90IFRva2VuIChvcHRpb25hbCwgY2FuIGJlIHNldCB2aWEgZW52aXJvbm1lbnQgdmFyaWFibGUpICovXG4gIHNsYWNrQm90VG9rZW4/OiBzdHJpbmc7XG4gIC8qKiBTbGFjayBTaWduaW5nIFNlY3JldCAob3B0aW9uYWwsIGNhbiBiZSBzZXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlKSAqL1xuICBzbGFja1NpZ25pbmdTZWNyZXQ/OiBzdHJpbmc7XG4gIC8qKiBOYW1lIGZvciB0aGUgVmVyaWZpY2F0aW9uIEFnZW50IEFnZW50Q29yZSBSdW50aW1lIChvcHRpb25hbCkgKi9cbiAgdmVyaWZpY2F0aW9uQWdlbnROYW1lPzogc3RyaW5nO1xuICAvKiogTWFwIG9mIGV4ZWN1dGlvbiBhZ2VudCBJRHMgdG8gcnVudGltZSBBUk5zIGZvciBBMkEgKG9wdGlvbmFsOyBmcm9tIHN0YWNrIG91dHB1dHMgb3IgY29uZmlnKSAqL1xuICBleGVjdXRpb25BZ2VudEFybnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAvKiogQ2hhbm5lbCBJRHMgd2hlcmUgdGhlIGJvdCBhdXRvLXJlcGxpZXMgd2l0aG91dCBhIG1lbnRpb24gKG9wdGlvbmFsKSAqL1xuICBhdXRvUmVwbHlDaGFubmVsSWRzPzogQ2hhbm5lbElkRW50cnlbXTtcbiAgLyoqIENoYW5uZWwgSURzIHdoZXJlIEBtZW50aW9uIHJlc3BvbnNlcyBhcmUgYWxsb3dlZCAob3B0aW9uYWw7IGVtcHR5ID0gYWxsIGNoYW5uZWxzKSAqL1xuICBtZW50aW9uQ2hhbm5lbElkcz86IENoYW5uZWxJZEVudHJ5W107XG4gIC8qKiBBUk4gb2YgdGhlIFNsYWNrIFNlYXJjaCBBZ2VudCBBZ2VudENvcmUgUnVudGltZSAob3B0aW9uYWwpICovXG4gIHNsYWNrU2VhcmNoQWdlbnRBcm4/OiBzdHJpbmc7XG4gIC8qKlxuICAgKiBBV1MgQWNjb3VudCBJRCBmb3IgdGhlIGFyY2hpdmUgYnVja2V0IGRlc3RpbmF0aW9uIChvcHRpb25hbCkuXG4gICAqIFdoZW4gcHJvdmlkZWQsIFVzYWdlSGlzdG9yeVJlcGxpY2F0aW9uIHVzZXMgY3Jvc3MtYWNjb3VudCBtb2RlLlxuICAgKiBXaGVuIGFic2VudCAoZGVmYXVsdCksIHNhbWUtYWNjb3VudCByZXBsaWNhdGlvbiBpcyB1c2VkLlxuICAgKi9cbiAgYXJjaGl2ZUFjY291bnRJZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBab2Qgc2NoZW1hIGZvciBDREsgY29uZmlndXJhdGlvbiB2YWxpZGF0aW9uXG4gKi9cbmNvbnN0IENka0NvbmZpZ1NjaGVtYSA9IHoub2JqZWN0KHtcbiAgYXdzUmVnaW9uOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KC9eW2Etel0rLVthLXpdKy1bMC05XSskLywgXCJJbnZhbGlkIEFXUyByZWdpb24gZm9ybWF0XCIpLFxuICBiZWRyb2NrTW9kZWxJZDogei5zdHJpbmcoKS5taW4oMSwgXCJiZWRyb2NrTW9kZWxJZCBpcyByZXF1aXJlZFwiKSxcbiAgZGVwbG95bWVudEVudjogei5lbnVtKFtcImRldlwiLCBcInByb2RcIl0sIHtcbiAgICBlcnJvck1hcDogKCkgPT4gKHsgbWVzc2FnZTogXCJkZXBsb3ltZW50RW52IG11c3QgYmUgJ2Rldicgb3IgJ3Byb2QnXCIgfSksXG4gIH0pLFxuICB2ZXJpZmljYXRpb25TdGFja05hbWU6IHouc3RyaW5nKCkubWluKDEsIFwidmVyaWZpY2F0aW9uU3RhY2tOYW1lIGlzIHJlcXVpcmVkXCIpLFxuICB2ZXJpZmljYXRpb25BY2NvdW50SWQ6IHpcbiAgICAuc3RyaW5nKClcbiAgICAucmVnZXgoXG4gICAgICAvXlxcZHsxMn0kLyxcbiAgICAgIFwidmVyaWZpY2F0aW9uQWNjb3VudElkIG11c3QgYmUgYSAxMi1kaWdpdCBBV1MgYWNjb3VudCBJRFwiXG4gICAgKSxcbiAgZXhlY3V0aW9uQWNjb3VudElkOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KC9eXFxkezEyfSQvLCBcImV4ZWN1dGlvbkFjY291bnRJZCBtdXN0IGJlIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSURcIiksXG4gIHNsYWNrQm90VG9rZW46IHouc3RyaW5nKCkubWluKDEsIFwic2xhY2tCb3RUb2tlbiBjYW5ub3QgYmUgZW1wdHlcIikub3B0aW9uYWwoKSxcbiAgc2xhY2tTaWduaW5nU2VjcmV0OiB6XG4gICAgLnN0cmluZygpXG4gICAgLm1pbigxLCBcInNsYWNrU2lnbmluZ1NlY3JldCBjYW5ub3QgYmUgZW1wdHlcIilcbiAgICAub3B0aW9uYWwoKSxcbiAgdmVyaWZpY2F0aW9uQWdlbnROYW1lOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KFxuICAgICAgL15bYS16QS1aXVthLXpBLVowLTlfXXswLDQ3fSQvLFxuICAgICAgXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWUgbXVzdCBtYXRjaCBwYXR0ZXJuIFthLXpBLVpdW2EtekEtWjAtOV9dezAsNDd9XCJcbiAgICApXG4gICAgLm9wdGlvbmFsKCksXG4gIGV4ZWN1dGlvbkFnZW50QXJuczogelxuICAgIC5yZWNvcmQoXG4gICAgICB6LnN0cmluZygpLFxuICAgICAgei5zdHJpbmcoKS5yZWdleChcbiAgICAgICAgL15hcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOi4rOlxcZHsxMn06cnVudGltZVxcLy4rLyxcbiAgICAgICAgXCJleGVjdXRpb25BZ2VudEFybnMgdmFsdWVzIG11c3QgYmUgdmFsaWQgQWdlbnRDb3JlIFJ1bnRpbWUgQVJOc1wiXG4gICAgICApXG4gICAgKVxuICAgIC5vcHRpb25hbCgpLFxuICBhdXRvUmVwbHlDaGFubmVsSWRzOiB6LmFycmF5KFxuICAgIHoudW5pb24oW3ouc3RyaW5nKCksIHoub2JqZWN0KHsgaWQ6IHouc3RyaW5nKCksIGxhYmVsOiB6LnN0cmluZygpIH0pXSlcbiAgKS5vcHRpb25hbCgpLFxuICBtZW50aW9uQ2hhbm5lbElkczogei5hcnJheShcbiAgICB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm9iamVjdCh7IGlkOiB6LnN0cmluZygpLCBsYWJlbDogei5zdHJpbmcoKSB9KV0pXG4gICkub3B0aW9uYWwoKSxcbiAgc2xhY2tTZWFyY2hBZ2VudEFybjogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleChcbiAgICAgIC9eYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTouKzpcXGR7MTJ9OnJ1bnRpbWVcXC8uKy8sXG4gICAgICBcInNsYWNrU2VhcmNoQWdlbnRBcm4gbXVzdCBiZSBhIHZhbGlkIEFnZW50Q29yZSBSdW50aW1lIEFSTlwiXG4gICAgKVxuICAgIC5vcHRpb25hbCgpLFxuICBhcmNoaXZlQWNjb3VudElkOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KC9eXFxkezEyfSQvLCBcImFyY2hpdmVBY2NvdW50SWQgbXVzdCBiZSBhIDEyLWRpZ2l0IEFXUyBhY2NvdW50IElEXCIpXG4gICAgLm9wdGlvbmFsKCksXG59KTtcblxuLyoqXG4gKiBQYXJ0aWFsIGNvbmZpZ3VyYXRpb24gdHlwZSBmb3IgbWVyZ2luZ1xuICovXG50eXBlIFBhcnRpYWxDZGtDb25maWcgPSBQYXJ0aWFsPENka0NvbmZpZz47XG5cbi8qKlxuICogTG9hZCBKU09OIGNvbmZpZ3VyYXRpb24gZmlsZVxuICogQ29udmVydHMgZW1wdHkgc3RyaW5ncyB0byB1bmRlZmluZWQgZm9yIG9wdGlvbmFsIGZpZWxkc1xuICovXG5mdW5jdGlvbiBsb2FkSnNvbkZpbGUoZmlsZVBhdGg6IHN0cmluZyk6IFBhcnRpYWxDZGtDb25maWcgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgY29udGVudCA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgXCJ1dGYtOFwiKTtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNvbnRlbnQpIGFzIFBhcnRpYWw8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+O1xuXG4gICAgLy8gQ29udmVydCBlbXB0eSBzdHJpbmdzIHRvIHVuZGVmaW5lZCBmb3Igb3B0aW9uYWwgZmllbGRzXG4gICAgY29uc3QgY2xlYW5lZDogUGFydGlhbENka0NvbmZpZyA9IHt9O1xuICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHBhcnNlZCkpIHtcbiAgICAgIC8vIFNraXAgZW1wdHkgc3RyaW5ncyBmb3Igb3B0aW9uYWwgZmllbGRzXG4gICAgICBpZiAoXG4gICAgICAgIHZhbHVlID09PSBcIlwiICYmXG4gICAgICAgIGtleSA9PT0gXCJleGVjdXRpb25BZ2VudEFybnNcIlxuICAgICAgKSB7XG4gICAgICAgIGNvbnRpbnVlOyAvLyBTa2lwIGVtcHR5IG9wdGlvbmFsIGZpZWxkXG4gICAgICB9XG4gICAgICAvLyBUeXBlLXNhZmUgYXNzaWdubWVudFxuICAgICAgaWYgKGtleSBpbiBjbGVhbmVkIHx8IGtleSBpbiBDZGtDb25maWdTY2hlbWEuc2hhcGUpIHtcbiAgICAgICAgKGNsZWFuZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gY2xlYW5lZDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRmFpbGVkIHRvIGxvYWQgY29uZmlndXJhdGlvbiBmaWxlICR7ZmlsZVBhdGh9OiAke1xuICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcilcbiAgICAgIH1gXG4gICAgKTtcbiAgfVxufVxuXG4vKipcbiAqIE1lcmdlIG11bHRpcGxlIGNvbmZpZ3VyYXRpb24gb2JqZWN0cyAobGF0ZXIgY29uZmlncyBvdmVycmlkZSBlYXJsaWVyIG9uZXMpXG4gKi9cbmZ1bmN0aW9uIG1lcmdlQ29uZmlncyhcbiAgLi4uY29uZmlnczogKFBhcnRpYWxDZGtDb25maWcgfCBudWxsKVtdXG4pOiBQYXJ0aWFsQ2RrQ29uZmlnIHtcbiAgY29uc3QgbWVyZ2VkOiBQYXJ0aWFsQ2RrQ29uZmlnID0ge307XG4gIGZvciAoY29uc3QgY29uZmlnIG9mIGNvbmZpZ3MpIHtcbiAgICBpZiAoY29uZmlnKSB7XG4gICAgICBPYmplY3QuYXNzaWduKG1lcmdlZCwgY29uZmlnKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG1lcmdlZDtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZSBjb25maWd1cmF0aW9uIHVzaW5nIFpvZCBzY2hlbWFcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlQ29uZmlnKGNvbmZpZzogdW5rbm93bik6IENka0NvbmZpZyB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIENka0NvbmZpZ1NjaGVtYS5wYXJzZShjb25maWcpO1xuICB9IGNhdGNoIChlcnJvcjogdW5rbm93bikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIHouWm9kRXJyb3IpIHtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZXMgPSBlcnJvci5lcnJvcnMubWFwKChlOiB6LlpvZElzc3VlKSA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGggPSBlLnBhdGguam9pbihcIi5cIik7XG4gICAgICAgIHJldHVybiBgICAtICR7cGF0aH06ICR7ZS5tZXNzYWdlfWA7XG4gICAgICB9KTtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgYENvbmZpZ3VyYXRpb24gdmFsaWRhdGlvbiBmYWlsZWQ6XFxuJHtlcnJvck1lc3NhZ2VzLmpvaW4oXCJcXG5cIil9YFxuICAgICAgKTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn1cblxuLyoqXG4gKiBMb2FkIENESyBjb25maWd1cmF0aW9uIGZvciBhIHNwZWNpZmljIGVudmlyb25tZW50XG4gKlxuICogQHBhcmFtIGVudiAtIERlcGxveW1lbnQgZW52aXJvbm1lbnQgKFwiZGV2XCIgb3IgXCJwcm9kXCIpXG4gKiBAcGFyYW0gY2RrRGlyIC0gQ0RLIGRpcmVjdG9yeSBwYXRoIChkZWZhdWx0OiBjdXJyZW50IGRpcmVjdG9yeSlcbiAqIEByZXR1cm5zIFZhbGlkYXRlZCBDREsgY29uZmlndXJhdGlvblxuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZENka0NvbmZpZyhlbnY6IFwiZGV2XCIgfCBcInByb2RcIiwgY2RrRGlyPzogc3RyaW5nKTogQ2RrQ29uZmlnIHtcbiAgY29uc3QgY29uZmlnRGlyID0gY2RrRGlyXG4gICAgPyBwYXRoLnJlc29sdmUoY2RrRGlyKVxuICAgIDogcGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIFwiY2RrXCIpO1xuICBjb25zdCBjb25maWdzOiAoUGFydGlhbENka0NvbmZpZyB8IG51bGwpW10gPSBbXTtcblxuICAvLyAxLiBMb2FkIGJhc2UgY29uZmlnIChvcHRpb25hbClcbiAgY29uc3QgYmFzZUNvbmZpZ1BhdGggPSBwYXRoLmpvaW4oY29uZmlnRGlyLCBcImNkay5jb25maWcuanNvblwiKTtcbiAgY29uc3QgYmFzZUNvbmZpZyA9IGxvYWRKc29uRmlsZShiYXNlQ29uZmlnUGF0aCk7XG4gIGlmIChiYXNlQ29uZmlnKSB7XG4gICAgY29uZmlncy5wdXNoKGJhc2VDb25maWcpO1xuICB9XG5cbiAgLy8gMi4gTG9hZCBsb2NhbCBjb25maWcgKG9wdGlvbmFsLCBmb3IgcGVyc29uYWwgb3ZlcnJpZGVzKVxuICBjb25zdCBsb2NhbENvbmZpZ1BhdGggPSBwYXRoLmpvaW4oY29uZmlnRGlyLCBcImNkay5jb25maWcubG9jYWwuanNvblwiKTtcbiAgY29uc3QgbG9jYWxDb25maWcgPSBsb2FkSnNvbkZpbGUobG9jYWxDb25maWdQYXRoKTtcbiAgaWYgKGxvY2FsQ29uZmlnKSB7XG4gICAgY29uZmlncy5wdXNoKGxvY2FsQ29uZmlnKTtcbiAgfVxuXG4gIC8vIDMuIExvYWQgZW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlnIChyZXF1aXJlZClcbiAgY29uc3QgZW52Q29uZmlnUGF0aCA9IHBhdGguam9pbihjb25maWdEaXIsIGBjZGsuY29uZmlnLiR7ZW52fS5qc29uYCk7XG4gIGNvbnN0IGVudkNvbmZpZyA9IGxvYWRKc29uRmlsZShlbnZDb25maWdQYXRoKTtcbiAgaWYgKCFlbnZDb25maWcpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBgRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBmaWxlIG5vdCBmb3VuZDogJHtlbnZDb25maWdQYXRofVxcbmAgK1xuICAgICAgICBgUGxlYXNlIGNyZWF0ZSBjZGsuY29uZmlnLiR7ZW52fS5qc29uIG9yIHVzZSBjZGsuY29uZmlnLmpzb24uZXhhbXBsZSBhcyBhIHRlbXBsYXRlLmBcbiAgICApO1xuICB9XG4gIGNvbmZpZ3MucHVzaChlbnZDb25maWcpO1xuXG4gIC8vIE1lcmdlIGFsbCBjb25maWdzIChsYXRlciBjb25maWdzIG92ZXJyaWRlIGVhcmxpZXIgb25lcylcbiAgY29uc3QgbWVyZ2VkQ29uZmlnID0gbWVyZ2VDb25maWdzKC4uLmNvbmZpZ3MpO1xuXG4gIC8vIEVuc3VyZSBkZXBsb3ltZW50RW52IG1hdGNoZXMgdGhlIHJlcXVlc3RlZCBlbnZpcm9ubWVudFxuICBtZXJnZWRDb25maWcuZGVwbG95bWVudEVudiA9IGVudjtcblxuICAvLyBWYWxpZGF0ZSBhbmQgcmV0dXJuXG4gIHJldHVybiB2YWxpZGF0ZUNvbmZpZyhtZXJnZWRDb25maWcpO1xufVxuXG4vKipcbiAqIEFwcGx5IGVudmlyb25tZW50IHZhcmlhYmxlIG92ZXJyaWRlcyB0byBjb25maWd1cmF0aW9uXG4gKlxuICogQHBhcmFtIGNvbmZpZyAtIEJhc2UgY29uZmlndXJhdGlvblxuICogQHJldHVybnMgQ29uZmlndXJhdGlvbiB3aXRoIGVudmlyb25tZW50IHZhcmlhYmxlIG92ZXJyaWRlcyBhcHBsaWVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBseUVudk92ZXJyaWRlcyhjb25maWc6IENka0NvbmZpZyk6IENka0NvbmZpZyB7XG4gIC8vIEhlbHBlciB0byBjb252ZXJ0IGVtcHR5IHN0cmluZyB0byB1bmRlZmluZWRcbiAgY29uc3QgZW52T3JDb25maWcgPSAoXG4gICAgZW52VmFyOiBzdHJpbmcgfCB1bmRlZmluZWQsXG4gICAgY29uZmlnVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZFxuICApOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IGVudiA9IGVudlZhcj8udHJpbSgpO1xuICAgIGNvbnN0IGNmZyA9IGNvbmZpZ1ZhbHVlPy50cmltKCk7XG4gICAgY29uc3QgdmFsdWUgPSBlbnYgfHwgY2ZnO1xuICAgIHJldHVybiB2YWx1ZSAmJiB2YWx1ZSAhPT0gXCJcIiA/IHZhbHVlIDogdW5kZWZpbmVkO1xuICB9O1xuXG4gIGNvbnN0IHBhcnNlQXV0b1JlcGx5Q2hhbm5lbElkcyA9IChcbiAgICByYXc6IHN0cmluZyB8IHVuZGVmaW5lZFxuICApOiBDaGFubmVsSWRFbnRyeVtdIHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHJhdz8udHJpbSgpO1xuICAgIGlmICghdmFsdWUpIHJldHVybiB1bmRlZmluZWQ7XG4gICAgY29uc3QgaWRzID0gdmFsdWUuc3BsaXQoXCIsXCIpLm1hcCgocykgPT4gcy50cmltKCkpLmZpbHRlcigocykgPT4gcy5sZW5ndGggPiAwKTtcbiAgICByZXR1cm4gaWRzLmxlbmd0aCA+IDAgPyBpZHMgOiB1bmRlZmluZWQ7XG4gIH07XG5cbiAgY29uc3QgcGFyc2VFeGVjdXRpb25BZ2VudEFybnMgPSAoXG4gICAgcmF3OiBzdHJpbmcgfCB1bmRlZmluZWRcbiAgKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSByYXc/LnRyaW0oKTtcbiAgICBpZiAoIXZhbHVlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh2YWx1ZSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gICAgICBpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkICE9PSBcIm9iamVjdFwiIHx8IEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG4gICAgICBmb3IgKGNvbnN0IFtrZXksIGFybl0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkKSkge1xuICAgICAgICBpZiAodHlwZW9mIGFybiA9PT0gXCJzdHJpbmdcIiAmJiBhcm4udHJpbSgpICE9PSBcIlwiKSB7XG4gICAgICAgICAgb3V0W2tleV0gPSBhcm4udHJpbSgpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gT2JqZWN0LmtleXMob3V0KS5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH07XG5cbiAgY29uc3Qgbm9ybWFsaXplRXhlY3V0aW9uQWdlbnRBcm5zID0gKFxuICAgIHJhdzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZFxuICApOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkID0+IHtcbiAgICBpZiAoIXJhdyB8fCBPYmplY3Qua2V5cyhyYXcpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgY29uc3Qgbm9ybWFsaXplZCA9IHsgLi4ucmF3IH07XG4gICAgLy8gQmFja3dhcmQgY29tcGF0aWJpbGl0eTogbGVnYWN5IGtleSBcIndlYi1mZXRjaFwiIGlzIG5vcm1hbGl6ZWQgdG8gXCJmZXRjaC11cmxcIi5cbiAgICBpZiAobm9ybWFsaXplZFtcIndlYi1mZXRjaFwiXSAmJiAhbm9ybWFsaXplZFtcImZldGNoLXVybFwiXSkge1xuICAgICAgbm9ybWFsaXplZFtcImZldGNoLXVybFwiXSA9IG5vcm1hbGl6ZWRbXCJ3ZWItZmV0Y2hcIl07XG4gICAgfVxuICAgIGRlbGV0ZSBub3JtYWxpemVkW1wid2ViLWZldGNoXCJdO1xuICAgIHJldHVybiBPYmplY3Qua2V5cyhub3JtYWxpemVkKS5sZW5ndGggPiAwID8gbm9ybWFsaXplZCA6IHVuZGVmaW5lZDtcbiAgfTtcblxuICBjb25zdCBtZXJnZWRFeGVjdXRpb25BZ2VudEFybnMgPSAoXG4gICAgY29uZmlnLmV4ZWN1dGlvbkFnZW50QXJucyAmJiBPYmplY3Qua2V5cyhjb25maWcuZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICA/IHsgLi4uY29uZmlnLmV4ZWN1dGlvbkFnZW50QXJucyB9XG4gICAgICA6IHVuZGVmaW5lZFxuICApO1xuICBjb25zdCBmcm9tSnNvbiA9IHBhcnNlRXhlY3V0aW9uQWdlbnRBcm5zKHByb2Nlc3MuZW52LkVYRUNVVElPTl9BR0VOVF9BUk5TKTtcbiAgY29uc3QgZnJvbVNpbmdsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgY29uc3QgZmlsZUNyZWF0b3JBcm4gPSBwcm9jZXNzLmVudi5GSUxFX0NSRUFUT1JfQUdFTlRfQVJOPy50cmltKCk7XG4gIGlmIChmaWxlQ3JlYXRvckFybikge1xuICAgIGZyb21TaW5nbGVzW1wiZmlsZS1jcmVhdG9yXCJdID0gZmlsZUNyZWF0b3JBcm47XG4gIH1cbiAgY29uc3QgZG9jc0FybiA9IHByb2Nlc3MuZW52LkRPQ1NfQUdFTlRfQVJOPy50cmltKCk7XG4gIGlmIChkb2NzQXJuKSB7XG4gICAgZnJvbVNpbmdsZXMuZG9jcyA9IGRvY3NBcm47XG4gIH1cbiAgY29uc3QgdGltZUFybiA9IHByb2Nlc3MuZW52LlRJTUVfQUdFTlRfQVJOPy50cmltKCk7XG4gIGlmICh0aW1lQXJuKSB7XG4gICAgZnJvbVNpbmdsZXMudGltZSA9IHRpbWVBcm47XG4gIH1cbiAgY29uc3Qgd2ViRmV0Y2hBcm4gPSBwcm9jZXNzLmVudi5XRUJfRkVUQ0hfQUdFTlRfQVJOPy50cmltKCk7XG4gIGlmICh3ZWJGZXRjaEFybikge1xuICAgIGZyb21TaW5nbGVzW1wiZmV0Y2gtdXJsXCJdID0gd2ViRmV0Y2hBcm47XG4gIH1cbiAgY29uc3QgZnJvbVNpbmdsZU1hcCA9XG4gICAgT2JqZWN0LmtleXMoZnJvbVNpbmdsZXMpLmxlbmd0aCA+IDAgPyBmcm9tU2luZ2xlcyA6IHVuZGVmaW5lZDtcblxuICBjb25zdCByZXNvbHZlZEV4ZWN1dGlvbkFnZW50QXJucyA9XG4gICAgbm9ybWFsaXplRXhlY3V0aW9uQWdlbnRBcm5zKFxuICAgICAgZnJvbUpzb24gPz8gZnJvbVNpbmdsZU1hcCA/PyBtZXJnZWRFeGVjdXRpb25BZ2VudEFybnNcbiAgICApO1xuXG4gIGNvbnN0IHNsYWNrU2VhcmNoQWdlbnRBcm5Gcm9tRW52ID0gcHJvY2Vzcy5lbnYuU0xBQ0tfU0VBUkNIX0FHRU5UX0FSTj8udHJpbSgpO1xuXG4gIHJldHVybiB7XG4gICAgLi4uY29uZmlnLFxuICAgIGF3c1JlZ2lvbjogcHJvY2Vzcy5lbnYuQVdTX1JFR0lPTiB8fCBjb25maWcuYXdzUmVnaW9uLFxuICAgIGJlZHJvY2tNb2RlbElkOiBwcm9jZXNzLmVudi5CRURST0NLX01PREVMX0lEIHx8IGNvbmZpZy5iZWRyb2NrTW9kZWxJZCxcbiAgICB2ZXJpZmljYXRpb25BY2NvdW50SWQ6XG4gICAgICBwcm9jZXNzLmVudi5WRVJJRklDQVRJT05fQUNDT1VOVF9JRCB8fCBjb25maWcudmVyaWZpY2F0aW9uQWNjb3VudElkLFxuICAgIGV4ZWN1dGlvbkFjY291bnRJZDpcbiAgICAgIHByb2Nlc3MuZW52LkVYRUNVVElPTl9BQ0NPVU5UX0lEIHx8IGNvbmZpZy5leGVjdXRpb25BY2NvdW50SWQsXG4gICAgc2xhY2tCb3RUb2tlbjogZW52T3JDb25maWcoXG4gICAgICBwcm9jZXNzLmVudi5TTEFDS19CT1RfVE9LRU4sXG4gICAgICBjb25maWcuc2xhY2tCb3RUb2tlblxuICAgICksXG4gICAgc2xhY2tTaWduaW5nU2VjcmV0OiBlbnZPckNvbmZpZyhcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX1NJR05JTkdfU0VDUkVULFxuICAgICAgY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldFxuICAgICksXG4gICAgZXhlY3V0aW9uQWdlbnRBcm5zOiByZXNvbHZlZEV4ZWN1dGlvbkFnZW50QXJucyxcbiAgICBhdXRvUmVwbHlDaGFubmVsSWRzOlxuICAgICAgKHBhcnNlQXV0b1JlcGx5Q2hhbm5lbElkcyhwcm9jZXNzLmVudi5BVVRPX1JFUExZX0NIQU5ORUxfSURTKSBhcyBDaGFubmVsSWRFbnRyeVtdIHwgdW5kZWZpbmVkKSA/P1xuICAgICAgY29uZmlnLmF1dG9SZXBseUNoYW5uZWxJZHMsXG4gICAgbWVudGlvbkNoYW5uZWxJZHM6XG4gICAgICAocGFyc2VBdXRvUmVwbHlDaGFubmVsSWRzKHByb2Nlc3MuZW52Lk1FTlRJT05fQ0hBTk5FTF9JRFMpIGFzIENoYW5uZWxJZEVudHJ5W10gfCB1bmRlZmluZWQpID8/XG4gICAgICBjb25maWcubWVudGlvbkNoYW5uZWxJZHMsXG4gICAgc2xhY2tTZWFyY2hBZ2VudEFybjpcbiAgICAgIHNsYWNrU2VhcmNoQWdlbnRBcm5Gcm9tRW52IHx8IGNvbmZpZy5zbGFja1NlYXJjaEFnZW50QXJuLFxuICAgIGFyY2hpdmVBY2NvdW50SWQ6XG4gICAgICBwcm9jZXNzLmVudi5BUkNISVZFX0FDQ09VTlRfSUQ/LnRyaW0oKSB8fCBjb25maWcuYXJjaGl2ZUFjY291bnRJZCxcbiAgfTtcbn1cbiJdfQ==