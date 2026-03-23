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
    autoReplyChannelIds: zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.object({ id: zod_1.z.string(), label: zod_1.z.string().optional() })])).optional(),
    mentionChannelIds: zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.object({ id: zod_1.z.string(), label: zod_1.z.string().optional() })])).optional(),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLWNvbmZpZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImNkay1jb25maWcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQStLSCx3Q0FlQztBQVNELHNDQXVDQztBQVFELDhDQXlIQztBQTdXRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBQzdCLDZCQUF3QjtBQWlEeEI7O0dBRUc7QUFDSCxNQUFNLGVBQWUsR0FBRyxPQUFDLENBQUMsTUFBTSxDQUFDO0lBQy9CLFNBQVMsRUFBRSxPQUFDO1NBQ1QsTUFBTSxFQUFFO1NBQ1IsS0FBSyxDQUFDLHdCQUF3QixFQUFFLDJCQUEyQixDQUFDO0lBQy9ELGNBQWMsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSw0QkFBNEIsQ0FBQztJQUMvRCxhQUFhLEVBQUUsT0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsRUFBRTtRQUNyQyxRQUFRLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxDQUFDO0tBQ3ZFLENBQUM7SUFDRixxQkFBcUIsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxtQ0FBbUMsQ0FBQztJQUM3RSxxQkFBcUIsRUFBRSxPQUFDO1NBQ3JCLE1BQU0sRUFBRTtTQUNSLEtBQUssQ0FDSixVQUFVLEVBQ1YseURBQXlELENBQzFEO0lBQ0gsa0JBQWtCLEVBQUUsT0FBQztTQUNsQixNQUFNLEVBQUU7U0FDUixLQUFLLENBQUMsVUFBVSxFQUFFLHNEQUFzRCxDQUFDO0lBQzVFLGFBQWEsRUFBRSxPQUFDLENBQUMsTUFBTSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSwrQkFBK0IsQ0FBQyxDQUFDLFFBQVEsRUFBRTtJ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L0QsYUFBYSxFQUFFLFdBQVcsQ0FDeEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQzNCLE1BQU0sQ0FBQyxhQUFhLENBQ3JCO1FBQ0Qsa0JBQWtCLEVBQUUsV0FBVyxDQUM3QixPQUFPLENBQUMsR0FBRyxDQUFDLG9CQUFvQixFQUNoQyxNQUFNLENBQUMsa0JBQWtCLENBQzFCO1FBQ0Qsa0JBQWtCLEVBQUUsMEJBQTBCO1FBQzlDLG1CQUFtQixFQUNoQix3QkFBd0IsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFrQztZQUM5RixNQUFNLENBQUMsbUJBQW1CO1FBQzVCLGlCQUFpQixFQUNkLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CLENBQWtDO1lBQzNGLE1BQU0sQ0FBQyxpQkFBaUI7UUFDMUIsbUJBQW1CLEVBQ2pCLDBCQUEwQixJQUFJLE1BQU0sQ0FBQyxtQkFBbUI7UUFDMUQsZ0JBQWdCLEVBQ2QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLEVBQUUsSUFBSSxNQUFNLENBQUMsZ0JBQWdCO0tBQ3BFLENBQUM7QUFDSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBDREsgQ29uZmlndXJhdGlvbiBNYW5hZ2VtZW50IChWZXJpZmljYXRpb24gWm9uZSlcbiAqXG4gKiBUaGlzIG1vZHVsZSBwcm92aWRlcyB0eXBlLXNhZmUgY29uZmlndXJhdGlvbiBsb2FkaW5nIGFuZCB2YWxpZGF0aW9uIGZvciB0aGVcbiAqIFZlcmlmaWNhdGlvbiBab25lIENESyBkZXBsb3ltZW50LiBTdXBwb3J0cyBlbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uXG4gKiBmaWxlcyB3aXRoIHByaW9yaXR5LWJhc2VkIG1lcmdpbmcuXG4gKlxuICogQ29uZmlndXJhdGlvbiBQcmlvcml0eSAoaGlnaCB0byBsb3cpOlxuICogMS4gRW52aXJvbm1lbnQgdmFyaWFibGVzXG4gKiAyLiBDb21tYW5kLWxpbmUgYXJndW1lbnRzICgtLWNvbnRleHQga2V5PXZhbHVlKVxuICogMy4gRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlnIGZpbGUgKGNkay5jb25maWcue2Vudn0uanNvbilcbiAqIDQuIExvY2FsIGNvbmZpZyBmaWxlIChjZGsuY29uZmlnLmxvY2FsLmpzb24gLSBvcHRpb25hbClcbiAqIDUuIEJhc2UgY29uZmlnIGZpbGUgKGNkay5jb25maWcuanNvbiAtIG9wdGlvbmFsKVxuICogNi4gRGVmYXVsdCB2YWx1ZXMgKGluIGNvZGUpXG4gKlxuICogS2V5IHR5cGVzOiBDZGtDb25maWcgKHZhbGlkYXRlZCBzaGFwZSkuIEtleSBmdW5jdGlvbnM6IGxvYWRDZGtDb25maWcsIHZhbGlkYXRlQ29uZmlnLCBhcHBseUVudk92ZXJyaWRlcy5cbiAqL1xuXG5pbXBvcnQgKiBhcyBmcyBmcm9tIFwiZnNcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IHogfSBmcm9tIFwiem9kXCI7XG5cbi8qKlxuICogQSBjaGFubmVsIElEIGVudHJ5IOKAlCBlaXRoZXIgYSBwbGFpbiBTbGFjayBjaGFubmVsIElEIHN0cmluZyBvciBhbiBvYmplY3Qgd2l0aFxuICogYW4gaWQgYW5kIGFuIG9wdGlvbmFsIGh1bWFuLXJlYWRhYmxlIGxhYmVsIGZvciBtYW5hZ2VtZW50IHB1cnBvc2VzLlxuICogVGhlIGxhYmVsIGlzIG5ldmVyIHVzZWQgZm9yIGF1dGhvcml6YXRpb247IGl0IG9ubHkgYXBwZWFycyBpbiBsb2dzLlxuICovXG5leHBvcnQgdHlwZSBDaGFubmVsSWRFbnRyeSA9IHN0cmluZyB8IHsgaWQ6IHN0cmluZzsgbGFiZWw/OiBzdHJpbmcgfTtcblxuLyoqXG4gKiBWYWxpZGF0ZWQgQ0RLIGNvbmZpZ3VyYXRpb24gc2hhcGUgZm9yIHRoZSBWZXJpZmljYXRpb24gWm9uZS5cbiAqIEFsbCByZXF1aXJlZCBmaWVsZHMgYXJlIGVuZm9yY2VkIGJ5IENka0NvbmZpZ1NjaGVtYSAoWm9kKS5cbiAqIE9wdGlvbmFsIGZpZWxkcyAoZS5nLiBzbGFja0JvdFRva2VuLCBleGVjdXRpb25BZ2VudEFybnMpIG1heSBiZSBzZXQgdmlhIGVudiBvciBjb25maWcgZmlsZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDZGtDb25maWcge1xuICAvKiogQVdTIFJlZ2lvbiBmb3IgZGVwbG95bWVudCAqL1xuICBhd3NSZWdpb246IHN0cmluZztcbiAgLyoqIEJlZHJvY2sgbW9kZWwgSUQgdG8gdXNlIGZvciBBSSBwcm9jZXNzaW5nICovXG4gIGJlZHJvY2tNb2RlbElkOiBzdHJpbmc7XG4gIC8qKiBEZXBsb3ltZW50IGVudmlyb25tZW50OiBcImRldlwiIG9yIFwicHJvZFwiICovXG4gIGRlcGxveW1lbnRFbnY6IFwiZGV2XCIgfCBcInByb2RcIjtcbiAgLyoqIEJhc2UgbmFtZSBmb3IgVmVyaWZpY2F0aW9uIFN0YWNrICh3aXRob3V0IGVudmlyb25tZW50IHN1ZmZpeCkgKi9cbiAgdmVyaWZpY2F0aW9uU3RhY2tOYW1lOiBzdHJpbmc7XG4gIC8qKiBBV1MgQWNjb3VudCBJRCBmb3IgVmVyaWZpY2F0aW9uIFN0YWNrICovXG4gIHZlcmlmaWNhdGlvbkFjY291bnRJZDogc3RyaW5nO1xuICAvKiogQVdTIEFjY291bnQgSUQgZm9yIEV4ZWN1dGlvbiBTdGFjayAoZm9yIGNyb3NzLWFjY291bnQgQTJBKSAqL1xuICBleGVjdXRpb25BY2NvdW50SWQ6IHN0cmluZztcbiAgLyoqIFNsYWNrIEJvdCBUb2tlbiAob3B0aW9uYWwsIGNhbiBiZSBzZXQgdmlhIGVudmlyb25tZW50IHZhcmlhYmxlKSAqL1xuICBzbGFja0JvdFRva2VuPzogc3RyaW5nO1xuICAvKiogU2xhY2sgU2lnbmluZyBTZWNyZXQgKG9wdGlvbmFsLCBjYW4gYmUgc2V0IHZpYSBlbnZpcm9ubWVudCB2YXJpYWJsZSkgKi9cbiAgc2xhY2tTaWduaW5nU2VjcmV0Pzogc3RyaW5nO1xuICAvKiogTmFtZSBmb3IgdGhlIFZlcmlmaWNhdGlvbiBBZ2VudCBBZ2VudENvcmUgUnVudGltZSAob3B0aW9uYWwpICovXG4gIHZlcmlmaWNhdGlvbkFnZW50TmFtZT86IHN0cmluZztcbiAgLyoqIE1hcCBvZiBleGVjdXRpb24gYWdlbnQgSURzIHRvIHJ1bnRpbWUgQVJOcyBmb3IgQTJBIChvcHRpb25hbDsgZnJvbSBzdGFjayBvdXRwdXRzIG9yIGNvbmZpZykgKi9cbiAgZXhlY3V0aW9uQWdlbnRBcm5zPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgLyoqIENoYW5uZWwgSURzIHdoZXJlIHRoZSBib3QgYXV0by1yZXBsaWVzIHdpdGhvdXQgYSBtZW50aW9uIChvcHRpb25hbCkgKi9cbiAgYXV0b1JlcGx5Q2hhbm5lbElkcz86IENoYW5uZWxJZEVudHJ5W107XG4gIC8qKiBDaGFubmVsIElEcyB3aGVyZSBAbWVudGlvbiByZXNwb25zZXMgYXJlIGFsbG93ZWQgKG9wdGlvbmFsOyBlbXB0eSA9IGFsbCBjaGFubmVscykgKi9cbiAgbWVudGlvbkNoYW5uZWxJZHM/OiBDaGFubmVsSWRFbnRyeVtdO1xuICAvKiogQVJOIG9mIHRoZSBTbGFjayBTZWFyY2ggQWdlbnQgQWdlbnRDb3JlIFJ1bnRpbWUgKG9wdGlvbmFsKSAqL1xuICBzbGFja1NlYXJjaEFnZW50QXJuPzogc3RyaW5nO1xuICAvKipcbiAgICogQVdTIEFjY291bnQgSUQgZm9yIHRoZSBhcmNoaXZlIGJ1Y2tldCBkZXN0aW5hdGlvbiAob3B0aW9uYWwpLlxuICAgKiBXaGVuIHByb3ZpZGVkLCBVc2FnZUhpc3RvcnlSZXBsaWNhdGlvbiB1c2VzIGNyb3NzLWFjY291bnQgbW9kZS5cbiAgICogV2hlbiBhYnNlbnQgKGRlZmF1bHQpLCBzYW1lLWFjY291bnQgcmVwbGljYXRpb24gaXMgdXNlZC5cbiAgICovXG4gIGFyY2hpdmVBY2NvdW50SWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogWm9kIHNjaGVtYSBmb3IgQ0RLIGNvbmZpZ3VyYXRpb24gdmFsaWRhdGlvblxuICovXG5jb25zdCBDZGtDb25maWdTY2hlbWEgPSB6Lm9iamVjdCh7XG4gIGF3c1JlZ2lvbjogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleCgvXlthLXpdKy1bYS16XSstWzAtOV0rJC8sIFwiSW52YWxpZCBBV1MgcmVnaW9uIGZvcm1hdFwiKSxcbiAgYmVkcm9ja01vZGVsSWQ6IHouc3RyaW5nKCkubWluKDEsIFwiYmVkcm9ja01vZGVsSWQgaXMgcmVxdWlyZWRcIiksXG4gIGRlcGxveW1lbnRFbnY6IHouZW51bShbXCJkZXZcIiwgXCJwcm9kXCJdLCB7XG4gICAgZXJyb3JNYXA6ICgpID0+ICh7IG1lc3NhZ2U6IFwiZGVwbG95bWVudEVudiBtdXN0IGJlICdkZXYnIG9yICdwcm9kJ1wiIH0pLFxuICB9KSxcbiAgdmVyaWZpY2F0aW9uU3RhY2tOYW1lOiB6LnN0cmluZygpLm1pbigxLCBcInZlcmlmaWNhdGlvblN0YWNrTmFtZSBpcyByZXF1aXJlZFwiKSxcbiAgdmVyaWZpY2F0aW9uQWNjb3VudElkOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KFxuICAgICAgL15cXGR7MTJ9JC8sXG4gICAgICBcInZlcmlmaWNhdGlvbkFjY291bnRJZCBtdXN0IGJlIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSURcIlxuICAgICksXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleCgvXlxcZHsxMn0kLywgXCJleGVjdXRpb25BY2NvdW50SWQgbXVzdCBiZSBhIDEyLWRpZ2l0IEFXUyBhY2NvdW50IElEXCIpLFxuICBzbGFja0JvdFRva2VuOiB6LnN0cmluZygpLm1pbigxLCBcInNsYWNrQm90VG9rZW4gY2Fubm90IGJlIGVtcHR5XCIpLm9wdGlvbmFsKCksXG4gIHNsYWNrU2lnbmluZ1NlY3JldDogelxuICAgIC5zdHJpbmcoKVxuICAgIC5taW4oMSwgXCJzbGFja1NpZ25pbmdTZWNyZXQgY2Fubm90IGJlIGVtcHR5XCIpXG4gICAgLm9wdGlvbmFsKCksXG4gIHZlcmlmaWNhdGlvbkFnZW50TmFtZTogelxuICAgIC5zdHJpbmcoKVxuICAgIC5yZWdleChcbiAgICAgIC9eW2EtekEtWl1bYS16QS1aMC05X117MCw0N30kLyxcbiAgICAgIFwidmVyaWZpY2F0aW9uQWdlbnROYW1lIG11c3QgbWF0Y2ggcGF0dGVybiBbYS16QS1aXVthLXpBLVowLTlfXXswLDQ3fVwiXG4gICAgKVxuICAgIC5vcHRpb25hbCgpLFxuICBleGVjdXRpb25BZ2VudEFybnM6IHpcbiAgICAucmVjb3JkKFxuICAgICAgei5zdHJpbmcoKSxcbiAgICAgIHouc3RyaW5nKCkucmVnZXgoXG4gICAgICAgIC9eYXJuOmF3czpiZWRyb2NrLWFnZW50Y29yZTouKzpcXGR7MTJ9OnJ1bnRpbWVcXC8uKy8sXG4gICAgICAgIFwiZXhlY3V0aW9uQWdlbnRBcm5zIHZhbHVlcyBtdXN0IGJlIHZhbGlkIEFnZW50Q29yZSBSdW50aW1lIEFSTnNcIlxuICAgICAgKVxuICAgIClcbiAgICAub3B0aW9uYWwoKSxcbiAgYXV0b1JlcGx5Q2hhbm5lbElkczogei5hcnJheShcbiAgICB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm9iamVjdCh7IGlkOiB6LnN0cmluZygpLCBsYWJlbDogei5zdHJpbmcoKS5vcHRpb25hbCgpIH0pXSlcbiAgKS5vcHRpb25hbCgpLFxuICBtZW50aW9uQ2hhbm5lbElkczogei5hcnJheShcbiAgICB6LnVuaW9uKFt6LnN0cmluZygpLCB6Lm9iamVjdCh7IGlkOiB6LnN0cmluZygpLCBsYWJlbDogei5zdHJpbmcoKS5vcHRpb25hbCgpIH0pXSlcbiAgKS5vcHRpb25hbCgpLFxuICBzbGFja1NlYXJjaEFnZW50QXJuOiB6XG4gICAgLnN0cmluZygpXG4gICAgLnJlZ2V4KFxuICAgICAgL15hcm46YXdzOmJlZHJvY2stYWdlbnRjb3JlOi4rOlxcZHsxMn06cnVudGltZVxcLy4rLyxcbiAgICAgIFwic2xhY2tTZWFyY2hBZ2VudEFybiBtdXN0IGJlIGEgdmFsaWQgQWdlbnRDb3JlIFJ1bnRpbWUgQVJOXCJcbiAgICApXG4gICAgLm9wdGlvbmFsKCksXG4gIGFyY2hpdmVBY2NvdW50SWQ6IHpcbiAgICAuc3RyaW5nKClcbiAgICAucmVnZXgoL15cXGR7MTJ9JC8sIFwiYXJjaGl2ZUFjY291bnRJZCBtdXN0IGJlIGEgMTItZGlnaXQgQVdTIGFjY291bnQgSURcIilcbiAgICAub3B0aW9uYWwoKSxcbn0pO1xuXG4vKipcbiAqIFBhcnRpYWwgY29uZmlndXJhdGlvbiB0eXBlIGZvciBtZXJnaW5nXG4gKi9cbnR5cGUgUGFydGlhbENka0NvbmZpZyA9IFBhcnRpYWw8Q2RrQ29uZmlnPjtcblxuLyoqXG4gKiBMb2FkIEpTT04gY29uZmlndXJhdGlvbiBmaWxlXG4gKiBDb252ZXJ0cyBlbXB0eSBzdHJpbmdzIHRvIHVuZGVmaW5lZCBmb3Igb3B0aW9uYWwgZmllbGRzXG4gKi9cbmZ1bmN0aW9uIGxvYWRKc29uRmlsZShmaWxlUGF0aDogc3RyaW5nKTogUGFydGlhbENka0NvbmZpZyB8IG51bGwge1xuICB0cnkge1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhmaWxlUGF0aCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBjb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCBcInV0Zi04XCIpO1xuICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoY29udGVudCkgYXMgUGFydGlhbDxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj47XG5cbiAgICAvLyBDb252ZXJ0IGVtcHR5IHN0cmluZ3MgdG8gdW5kZWZpbmVkIGZvciBvcHRpb25hbCBmaWVsZHNcbiAgICBjb25zdCBjbGVhbmVkOiBQYXJ0aWFsQ2RrQ29uZmlnID0ge307XG4gICAgZm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocGFyc2VkKSkge1xuICAgICAgLy8gU2tpcCBlbXB0eSBzdHJpbmdzIGZvciBvcHRpb25hbCBmaWVsZHNcbiAgICAgIGlmIChcbiAgICAgICAgdmFsdWUgPT09IFwiXCIgJiZcbiAgICAgICAga2V5ID09PSBcImV4ZWN1dGlvbkFnZW50QXJuc1wiXG4gICAgICApIHtcbiAgICAgICAgY29udGludWU7IC8vIFNraXAgZW1wdHkgb3B0aW9uYWwgZmllbGRcbiAgICAgIH1cbiAgICAgIC8vIFR5cGUtc2FmZSBhc3NpZ25tZW50XG4gICAgICBpZiAoa2V5IGluIGNsZWFuZWQgfHwga2V5IGluIENka0NvbmZpZ1NjaGVtYS5zaGFwZSkge1xuICAgICAgICAoY2xlYW5lZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBjbGVhbmVkO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBGYWlsZWQgdG8gbG9hZCBjb25maWd1cmF0aW9uIGZpbGUgJHtmaWxlUGF0aH06ICR7XG4gICAgICAgIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKVxuICAgICAgfWBcbiAgICApO1xuICB9XG59XG5cbi8qKlxuICogTWVyZ2UgbXVsdGlwbGUgY29uZmlndXJhdGlvbiBvYmplY3RzIChsYXRlciBjb25maWdzIG92ZXJyaWRlIGVhcmxpZXIgb25lcylcbiAqL1xuZnVuY3Rpb24gbWVyZ2VDb25maWdzKFxuICAuLi5jb25maWdzOiAoUGFydGlhbENka0NvbmZpZyB8IG51bGwpW11cbik6IFBhcnRpYWxDZGtDb25maWcge1xuICBjb25zdCBtZXJnZWQ6IFBhcnRpYWxDZGtDb25maWcgPSB7fTtcbiAgZm9yIChjb25zdCBjb25maWcgb2YgY29uZmlncykge1xuICAgIGlmIChjb25maWcpIHtcbiAgICAgIE9iamVjdC5hc3NpZ24obWVyZ2VkLCBjb25maWcpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbWVyZ2VkO1xufVxuXG4vKipcbiAqIFZhbGlkYXRlIGNvbmZpZ3VyYXRpb24gdXNpbmcgWm9kIHNjaGVtYVxuICovXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVDb25maWcoY29uZmlnOiB1bmtub3duKTogQ2RrQ29uZmlnIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gQ2RrQ29uZmlnU2NoZW1hLnBhcnNlKGNvbmZpZyk7XG4gIH0gY2F0Y2ggKGVycm9yOiB1bmtub3duKSB7XG4gICAgaWYgKGVycm9yIGluc3RhbmNlb2Ygei5ab2RFcnJvcikge1xuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlcyA9IGVycm9yLmVycm9ycy5tYXAoKGU6IHouWm9kSXNzdWUpID0+IHtcbiAgICAgICAgY29uc3QgcGF0aCA9IGUucGF0aC5qb2luKFwiLlwiKTtcbiAgICAgICAgcmV0dXJuIGAgIC0gJHtwYXRofTogJHtlLm1lc3NhZ2V9YDtcbiAgICAgIH0pO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgQ29uZmlndXJhdGlvbiB2YWxpZGF0aW9uIGZhaWxlZDpcXG4ke2Vycm9yTWVzc2FnZXMuam9pbihcIlxcblwiKX1gXG4gICAgICApO1xuICAgIH1cbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vKipcbiAqIExvYWQgQ0RLIGNvbmZpZ3VyYXRpb24gZm9yIGEgc3BlY2lmaWMgZW52aXJvbm1lbnRcbiAqXG4gKiBAcGFyYW0gZW52IC0gRGVwbG95bWVudCBlbnZpcm9ubWVudCAoXCJkZXZcIiBvciBcInByb2RcIilcbiAqIEBwYXJhbSBjZGtEaXIgLSBDREsgZGlyZWN0b3J5IHBhdGggKGRlZmF1bHQ6IGN1cnJlbnQgZGlyZWN0b3J5KVxuICogQHJldHVybnMgVmFsaWRhdGVkIENESyBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2FkQ2RrQ29uZmlnKGVudjogXCJkZXZcIiB8IFwicHJvZFwiLCBjZGtEaXI/OiBzdHJpbmcpOiBDZGtDb25maWcge1xuICBjb25zdCBjb25maWdEaXIgPSBjZGtEaXJcbiAgICA/IHBhdGgucmVzb2x2ZShjZGtEaXIpXG4gICAgOiBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgXCJjZGtcIik7XG4gIGNvbnN0IGNvbmZpZ3M6IChQYXJ0aWFsQ2RrQ29uZmlnIHwgbnVsbClbXSA9IFtdO1xuXG4gIC8vIDEuIExvYWQgYmFzZSBjb25maWcgKG9wdGlvbmFsKVxuICBjb25zdCBiYXNlQ29uZmlnUGF0aCA9IHBhdGguam9pbihjb25maWdEaXIsIFwiY2RrLmNvbmZpZy5qc29uXCIpO1xuICBjb25zdCBiYXNlQ29uZmlnID0gbG9hZEpzb25GaWxlKGJhc2VDb25maWdQYXRoKTtcbiAgaWYgKGJhc2VDb25maWcpIHtcbiAgICBjb25maWdzLnB1c2goYmFzZUNvbmZpZyk7XG4gIH1cblxuICAvLyAyLiBMb2FkIGxvY2FsIGNvbmZpZyAob3B0aW9uYWwsIGZvciBwZXJzb25hbCBvdmVycmlkZXMpXG4gIGNvbnN0IGxvY2FsQ29uZmlnUGF0aCA9IHBhdGguam9pbihjb25maWdEaXIsIFwiY2RrLmNvbmZpZy5sb2NhbC5qc29uXCIpO1xuICBjb25zdCBsb2NhbENvbmZpZyA9IGxvYWRKc29uRmlsZShsb2NhbENvbmZpZ1BhdGgpO1xuICBpZiAobG9jYWxDb25maWcpIHtcbiAgICBjb25maWdzLnB1c2gobG9jYWxDb25maWcpO1xuICB9XG5cbiAgLy8gMy4gTG9hZCBlbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWcgKHJlcXVpcmVkKVxuICBjb25zdCBlbnZDb25maWdQYXRoID0gcGF0aC5qb2luKGNvbmZpZ0RpciwgYGNkay5jb25maWcuJHtlbnZ9Lmpzb25gKTtcbiAgY29uc3QgZW52Q29uZmlnID0gbG9hZEpzb25GaWxlKGVudkNvbmZpZ1BhdGgpO1xuICBpZiAoIWVudkNvbmZpZykge1xuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIGBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGZpbGUgbm90IGZvdW5kOiAke2VudkNvbmZpZ1BhdGh9XFxuYCArXG4gICAgICAgIGBQbGVhc2UgY3JlYXRlIGNkay5jb25maWcuJHtlbnZ9Lmpzb24gb3IgdXNlIGNkay5jb25maWcuanNvbi5leGFtcGxlIGFzIGEgdGVtcGxhdGUuYFxuICAgICk7XG4gIH1cbiAgY29uZmlncy5wdXNoKGVudkNvbmZpZyk7XG5cbiAgLy8gTWVyZ2UgYWxsIGNvbmZpZ3MgKGxhdGVyIGNvbmZpZ3Mgb3ZlcnJpZGUgZWFybGllciBvbmVzKVxuICBjb25zdCBtZXJnZWRDb25maWcgPSBtZXJnZUNvbmZpZ3MoLi4uY29uZmlncyk7XG5cbiAgLy8gRW5zdXJlIGRlcGxveW1lbnRFbnYgbWF0Y2hlcyB0aGUgcmVxdWVzdGVkIGVudmlyb25tZW50XG4gIG1lcmdlZENvbmZpZy5kZXBsb3ltZW50RW52ID0gZW52O1xuXG4gIC8vIFZhbGlkYXRlIGFuZCByZXR1cm5cbiAgcmV0dXJuIHZhbGlkYXRlQ29uZmlnKG1lcmdlZENvbmZpZyk7XG59XG5cbi8qKlxuICogQXBwbHkgZW52aXJvbm1lbnQgdmFyaWFibGUgb3ZlcnJpZGVzIHRvIGNvbmZpZ3VyYXRpb25cbiAqXG4gKiBAcGFyYW0gY29uZmlnIC0gQmFzZSBjb25maWd1cmF0aW9uXG4gKiBAcmV0dXJucyBDb25maWd1cmF0aW9uIHdpdGggZW52aXJvbm1lbnQgdmFyaWFibGUgb3ZlcnJpZGVzIGFwcGxpZWRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5RW52T3ZlcnJpZGVzKGNvbmZpZzogQ2RrQ29uZmlnKTogQ2RrQ29uZmlnIHtcbiAgLy8gSGVscGVyIHRvIGNvbnZlcnQgZW1wdHkgc3RyaW5nIHRvIHVuZGVmaW5lZFxuICBjb25zdCBlbnZPckNvbmZpZyA9IChcbiAgICBlbnZWYXI6IHN0cmluZyB8IHVuZGVmaW5lZCxcbiAgICBjb25maWdWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG4gICAgY29uc3QgZW52ID0gZW52VmFyPy50cmltKCk7XG4gICAgY29uc3QgY2ZnID0gY29uZmlnVmFsdWU/LnRyaW0oKTtcbiAgICBjb25zdCB2YWx1ZSA9IGVudiB8fCBjZmc7XG4gICAgcmV0dXJuIHZhbHVlICYmIHZhbHVlICE9PSBcIlwiID8gdmFsdWUgOiB1bmRlZmluZWQ7XG4gIH07XG5cbiAgY29uc3QgcGFyc2VBdXRvUmVwbHlDaGFubmVsSWRzID0gKFxuICAgIHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkXG4gICk6IENoYW5uZWxJZEVudHJ5W10gfCB1bmRlZmluZWQgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcmF3Py50cmltKCk7XG4gICAgaWYgKCF2YWx1ZSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICBjb25zdCBpZHMgPSB2YWx1ZS5zcGxpdChcIixcIikubWFwKChzKSA9PiBzLnRyaW0oKSkuZmlsdGVyKChzKSA9PiBzLmxlbmd0aCA+IDApO1xuICAgIHJldHVybiBpZHMubGVuZ3RoID4gMCA/IGlkcyA6IHVuZGVmaW5lZDtcbiAgfTtcblxuICBjb25zdCBwYXJzZUV4ZWN1dGlvbkFnZW50QXJucyA9IChcbiAgICByYXc6IHN0cmluZyB8IHVuZGVmaW5lZFxuICApOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHJhdz8udHJpbSgpO1xuICAgIGlmICghdmFsdWUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHZhbHVlKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgICAgIGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQgIT09IFwib2JqZWN0XCIgfHwgQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICAgIGZvciAoY29uc3QgW2tleSwgYXJuXSBvZiBPYmplY3QuZW50cmllcyhwYXJzZWQpKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYXJuID09PSBcInN0cmluZ1wiICYmIGFybi50cmltKCkgIT09IFwiXCIpIHtcbiAgICAgICAgICBvdXRba2V5XSA9IGFybi50cmltKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBPYmplY3Qua2V5cyhvdXQpLmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWQ7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCBub3JtYWxpemVFeGVjdXRpb25BZ2VudEFybnMgPSAoXG4gICAgcmF3OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkXG4gICk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQgPT4ge1xuICAgIGlmICghcmF3IHx8IE9iamVjdC5rZXlzKHJhdykubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3JtYWxpemVkID0geyAuLi5yYXcgfTtcbiAgICAvLyBCYWNrd2FyZCBjb21wYXRpYmlsaXR5OiBsZWdhY3kga2V5IFwid2ViLWZldGNoXCIgaXMgbm9ybWFsaXplZCB0byBcImZldGNoLXVybFwiLlxuICAgIGlmIChub3JtYWxpemVkW1wid2ViLWZldGNoXCJdICYmICFub3JtYWxpemVkW1wiZmV0Y2gtdXJsXCJdKSB7XG4gICAgICBub3JtYWxpemVkW1wiZmV0Y2gtdXJsXCJdID0gbm9ybWFsaXplZFtcIndlYi1mZXRjaFwiXTtcbiAgICB9XG4gICAgZGVsZXRlIG5vcm1hbGl6ZWRbXCJ3ZWItZmV0Y2hcIl07XG4gICAgcmV0dXJuIE9iamVjdC5rZXlzKG5vcm1hbGl6ZWQpLmxlbmd0aCA+IDAgPyBub3JtYWxpemVkIDogdW5kZWZpbmVkO1xuICB9O1xuXG4gIGNvbnN0IG1lcmdlZEV4ZWN1dGlvbkFnZW50QXJucyA9IChcbiAgICBjb25maWcuZXhlY3V0aW9uQWdlbnRBcm5zICYmIE9iamVjdC5rZXlzKGNvbmZpZy5leGVjdXRpb25BZ2VudEFybnMpLmxlbmd0aCA+IDBcbiAgICAgID8geyAuLi5jb25maWcuZXhlY3V0aW9uQWdlbnRBcm5zIH1cbiAgICAgIDogdW5kZWZpbmVkXG4gICk7XG4gIGNvbnN0IGZyb21Kc29uID0gcGFyc2VFeGVjdXRpb25BZ2VudEFybnMocHJvY2Vzcy5lbnYuRVhFQ1VUSU9OX0FHRU5UX0FSTlMpO1xuICBjb25zdCBmcm9tU2luZ2xlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuICBjb25zdCBmaWxlQ3JlYXRvckFybiA9IHByb2Nlc3MuZW52LkZJTEVfQ1JFQVRPUl9BR0VOVF9BUk4/LnRyaW0oKTtcbiAgaWYgKGZpbGVDcmVhdG9yQXJuKSB7XG4gICAgZnJvbVNpbmdsZXNbXCJmaWxlLWNyZWF0b3JcIl0gPSBmaWxlQ3JlYXRvckFybjtcbiAgfVxuICBjb25zdCBkb2NzQXJuID0gcHJvY2Vzcy5lbnYuRE9DU19BR0VOVF9BUk4/LnRyaW0oKTtcbiAgaWYgKGRvY3NBcm4pIHtcbiAgICBmcm9tU2luZ2xlcy5kb2NzID0gZG9jc0FybjtcbiAgfVxuICBjb25zdCB0aW1lQXJuID0gcHJvY2Vzcy5lbnYuVElNRV9BR0VOVF9BUk4/LnRyaW0oKTtcbiAgaWYgKHRpbWVBcm4pIHtcbiAgICBmcm9tU2luZ2xlcy50aW1lID0gdGltZUFybjtcbiAgfVxuICBjb25zdCB3ZWJGZXRjaEFybiA9IHByb2Nlc3MuZW52LldFQl9GRVRDSF9BR0VOVF9BUk4/LnRyaW0oKTtcbiAgaWYgKHdlYkZldGNoQXJuKSB7XG4gICAgZnJvbVNpbmdsZXNbXCJmZXRjaC11cmxcIl0gPSB3ZWJGZXRjaEFybjtcbiAgfVxuICBjb25zdCBmcm9tU2luZ2xlTWFwID1cbiAgICBPYmplY3Qua2V5cyhmcm9tU2luZ2xlcykubGVuZ3RoID4gMCA/IGZyb21TaW5nbGVzIDogdW5kZWZpbmVkO1xuXG4gIGNvbnN0IHJlc29sdmVkRXhlY3V0aW9uQWdlbnRBcm5zID1cbiAgICBub3JtYWxpemVFeGVjdXRpb25BZ2VudEFybnMoXG4gICAgICBmcm9tSnNvbiA/PyBmcm9tU2luZ2xlTWFwID8/IG1lcmdlZEV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICk7XG5cbiAgY29uc3Qgc2xhY2tTZWFyY2hBZ2VudEFybkZyb21FbnYgPSBwcm9jZXNzLmVudi5TTEFDS19TRUFSQ0hfQUdFTlRfQVJOPy50cmltKCk7XG5cbiAgcmV0dXJuIHtcbiAgICAuLi5jb25maWcsXG4gICAgYXdzUmVnaW9uOiBwcm9jZXNzLmVudi5BV1NfUkVHSU9OIHx8IGNvbmZpZy5hd3NSZWdpb24sXG4gICAgYmVkcm9ja01vZGVsSWQ6IHByb2Nlc3MuZW52LkJFRFJPQ0tfTU9ERUxfSUQgfHwgY29uZmlnLmJlZHJvY2tNb2RlbElkLFxuICAgIHZlcmlmaWNhdGlvbkFjY291bnRJZDpcbiAgICAgIHByb2Nlc3MuZW52LlZFUklGSUNBVElPTl9BQ0NPVU5UX0lEIHx8IGNvbmZpZy52ZXJpZmljYXRpb25BY2NvdW50SWQsXG4gICAgZXhlY3V0aW9uQWNjb3VudElkOlxuICAgICAgcHJvY2Vzcy5lbnYuRVhFQ1VUSU9OX0FDQ09VTlRfSUQgfHwgY29uZmlnLmV4ZWN1dGlvbkFjY291bnRJZCxcbiAgICBzbGFja0JvdFRva2VuOiBlbnZPckNvbmZpZyhcbiAgICAgIHByb2Nlc3MuZW52LlNMQUNLX0JPVF9UT0tFTixcbiAgICAgIGNvbmZpZy5zbGFja0JvdFRva2VuXG4gICAgKSxcbiAgICBzbGFja1NpZ25pbmdTZWNyZXQ6IGVudk9yQ29uZmlnKFxuICAgICAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0lHTklOR19TRUNSRVQsXG4gICAgICBjb25maWcuc2xhY2tTaWduaW5nU2VjcmV0XG4gICAgKSxcbiAgICBleGVjdXRpb25BZ2VudEFybnM6IHJlc29sdmVkRXhlY3V0aW9uQWdlbnRBcm5zLFxuICAgIGF1dG9SZXBseUNoYW5uZWxJZHM6XG4gICAgICAocGFyc2VBdXRvUmVwbHlDaGFubmVsSWRzKHByb2Nlc3MuZW52LkFVVE9fUkVQTFlfQ0hBTk5FTF9JRFMpIGFzIENoYW5uZWxJZEVudHJ5W10gfCB1bmRlZmluZWQpID8/XG4gICAgICBjb25maWcuYXV0b1JlcGx5Q2hhbm5lbElkcyxcbiAgICBtZW50aW9uQ2hhbm5lbElkczpcbiAgICAgIChwYXJzZUF1dG9SZXBseUNoYW5uZWxJZHMocHJvY2Vzcy5lbnYuTUVOVElPTl9DSEFOTkVMX0lEUykgYXMgQ2hhbm5lbElkRW50cnlbXSB8IHVuZGVmaW5lZCkgPz9cbiAgICAgIGNvbmZpZy5tZW50aW9uQ2hhbm5lbElkcyxcbiAgICBzbGFja1NlYXJjaEFnZW50QXJuOlxuICAgICAgc2xhY2tTZWFyY2hBZ2VudEFybkZyb21FbnYgfHwgY29uZmlnLnNsYWNrU2VhcmNoQWdlbnRBcm4sXG4gICAgYXJjaGl2ZUFjY291bnRJZDpcbiAgICAgIHByb2Nlc3MuZW52LkFSQ0hJVkVfQUNDT1VOVF9JRD8udHJpbSgpIHx8IGNvbmZpZy5hcmNoaXZlQWNjb3VudElkLFxuICB9O1xufVxuIl19