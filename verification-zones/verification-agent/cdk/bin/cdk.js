#!/usr/bin/env node
"use strict";
/**
 * Verification Zone CDK Application Entry Point
 *
 * This file defines the standalone CDK application for the Verification Zone.
 * It instantiates only the VerificationStack; execution stacks live in a separate CDK app.
 *
 * Configuration priority (highest first): (1) Environment variables (e.g. DEPLOYMENT_ENV, SLACK_BOT_TOKEN),
 * (2) Command-line context (--context key=value), (3) Environment-specific config file (cdk.config.{env}.json),
 * (4) Defaults in code. See getConfigValue / getConfigString and loadConfiguration.
 *
 * Execution agent ARNs are supplied via config file (executionAgentArns) or individual env vars:
 * FILE_CREATOR_AGENT_ARN, DOCS_AGENT_ARN, TIME_AGENT_ARN, WEB_FETCH_AGENT_ARN
 * (or combined EXECUTION_AGENT_ARNS JSON).
 *
 * Deploy order: 1) Deploy execution CDK app (execution-zones/) to get runtime ARNs,
 *               2) Set executionAgentArns in cdk.config.{env}.json (or env vars),
 *               3) Deploy this app: npx cdk deploy
 *
 * @module verification-zones/verification-agent/cdk/bin/cdk
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
const cdk = __importStar(require("aws-cdk-lib"));
const aws_cdk_lib_1 = require("aws-cdk-lib");
const path = __importStar(require("path"));
const verification_stack_1 = require("../lib/verification-stack");
const cdk_config_1 = require("../lib/types/cdk-config");
const cdk_tooling_1 = require("@slack-ai-app/cdk-tooling");
// Constants
const VALID_ENVIRONMENTS = ["dev", "prod"];
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";
// Outdir for cloud assembly (CLI sets CDK_OUTDIR; else default cdk.out)
const outdir = process.env.CDK_OUTDIR || path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });
(0, cdk_tooling_1.logInfo)("Verification Zone CDK app starting", { phase: "config" });
// Apply synthesis-time validation aspects
aws_cdk_lib_1.Aspects.of(app).add(new cdk_tooling_1.LogRetentionAspect());
aws_cdk_lib_1.Aspects.of(app).add(new cdk_tooling_1.CostAllocationTagAspect());
/**
 * Get and validate deployment environment.
 *
 * Priority: 1. DEPLOYMENT_ENV environment variable, 2. cdk.json context, 3. default
 *
 * @returns Validated deployment environment
 * @throws {CdkError} If deployment environment is invalid
 */
function getDeploymentEnvironment() {
    const deploymentEnvRaw = process.env.DEPLOYMENT_ENV ||
        app.node.tryGetContext("deploymentEnv") ||
        DEFAULT_ENVIRONMENT;
    const deploymentEnv = deploymentEnvRaw
        .toLowerCase()
        .trim();
    if (!VALID_ENVIRONMENTS.includes(deploymentEnv)) {
        cdk_tooling_1.CdkError.throw({
            message: `Invalid deployment environment '${deploymentEnvRaw}'. Must be one of: ${VALID_ENVIRONMENTS.join(", ")}.`,
            cause: "Invalid deployment environment",
            remediation: `Set DEPLOYMENT_ENV or use --context deploymentEnv to one of: ${VALID_ENVIRONMENTS.join(", ")}`,
            source: "app",
        });
    }
    if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
        (0, cdk_tooling_1.logWarn)(`DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}' environment.`, {
            phase: "config",
        });
    }
    return deploymentEnv;
}
const deploymentEnv = getDeploymentEnvironment();
/**
 * Load configuration from files with fallback to context/defaults
 *
 * @param env - Deployment environment
 * @returns Configuration object or null if loading failed
 */
function loadConfiguration(env) {
    try {
        const cdkDir = path.resolve(__dirname, "..");
        const fileConfig = (0, cdk_config_1.loadCdkConfig)(env, cdkDir);
        return (0, cdk_config_1.applyEnvOverrides)(fileConfig);
    }
    catch {
        (0, cdk_tooling_1.logWarn)("Configuration file load failed; falling back to context or defaults.", {
            phase: "config",
            context: { step: "config load" },
        });
        return null;
    }
}
const config = loadConfiguration(deploymentEnv);
(0, cdk_tooling_1.logInfo)(config
    ? "Configuration loaded from file or env overrides."
    : "Using context or defaults (no config file).", { phase: "config", context: { deploymentEnv } });
/**
 * Get configuration value with priority: context > config file > default
 */
function getConfigValue(key, defaultValue) {
    const contextValue = app.node.tryGetContext(key);
    if (contextValue !== undefined) {
        return contextValue;
    }
    if (config && key in config) {
        return config[key];
    }
    return defaultValue;
}
/**
 * Get configuration value as string with empty string handling
 */
function getConfigString(key, defaultValue = "") {
    const value = getConfigValue(key, defaultValue);
    return value || "";
}
/**
 * Get configuration value as object.
 */
function getConfigObject(key, defaultValue) {
    const value = getConfigValue(key, defaultValue);
    return value || defaultValue;
}
// Get configuration values
const region = getConfigValue("awsRegion", DEFAULT_REGION);
// Stack name (without environment suffix)
const baseVerificationStackName = getConfigValue("verificationStackName", "SlackAI-Verification");
// Add environment suffix
const environmentSuffix = deploymentEnv === "prod" ? "Prod" : "Dev";
const verificationStackName = `${baseVerificationStackName}-${environmentSuffix}`;
// Cross-account configuration
const verificationAccountId = getConfigString("verificationAccountId");
const executionAccountId = getConfigString("executionAccountId");
// AgentCore configuration
const verificationAgentName = getConfigString("verificationAgentName", `SlackAI_VerificationAgent_${environmentSuffix}`);
/** Parse a context value (string | string[] | undefined) into a string[]. */
const parseChannelIdContext = (ctxRaw, fallback) => {
    if (ctxRaw === undefined)
        return fallback;
    if (typeof ctxRaw === "string") {
        try {
            const parsed = JSON.parse(ctxRaw);
            if (Array.isArray(parsed)) {
                return parsed.map(String).filter((s) => s.trim() !== "");
            }
        }
        catch {
            // Not JSON — treat as comma-separated
        }
        return ctxRaw.split(",").map((s) => s.trim()).filter((s) => s !== "");
    }
    if (Array.isArray(ctxRaw)) {
        return ctxRaw.map(String).filter((s) => s.trim() !== "");
    }
    return fallback;
};
// Auto-reply channel IDs (from context, config file, or env var).
// --context autoReplyChannelIds=C123,C456  OR  ["C123","C456"] JSON array
const autoReplyChannelIds = parseChannelIdContext(app.node.tryGetContext("autoReplyChannelIds"), config?.autoReplyChannelIds ?? []);
// Mention-allowed channel IDs (from context, config file, or env var).
// When set, app_mention events from other channels are silently ignored.
// --context mentionChannelIds=C123,C456  OR  ["C123","C456"] JSON array
const mentionChannelIds = parseChannelIdContext(app.node.tryGetContext("mentionChannelIds"), config?.mentionChannelIds ?? []);
// Execution agent ARNs (from context, env vars, or config file).
// CDK --context always passes strings; JSON-parse when needed.
const executionAgentArns = (() => {
    const ctxRaw = app.node.tryGetContext("executionAgentArns");
    if (ctxRaw !== undefined) {
        if (typeof ctxRaw === "string") {
            try {
                return JSON.parse(ctxRaw);
            }
            catch {
                return {};
            }
        }
        if (typeof ctxRaw === "object" && ctxRaw !== null) {
            return ctxRaw;
        }
    }
    return config?.executionAgentArns ?? {};
})();
/**
 * Set loaded config values to CDK context for backward compatibility
 */
function setContextFromConfig(config) {
    if (!config) {
        return;
    }
    app.node.setContext("awsRegion", region);
    app.node.setContext("bedrockModelId", config.bedrockModelId);
    app.node.setContext("deploymentEnv", deploymentEnv);
    app.node.setContext("verificationStackName", baseVerificationStackName);
    app.node.setContext("verificationAccountId", verificationAccountId);
    app.node.setContext("executionAccountId", executionAccountId);
    if (config.slackBotToken) {
        app.node.setContext("slackBotToken", config.slackBotToken);
    }
    if (config.slackSigningSecret) {
        app.node.setContext("slackSigningSecret", config.slackSigningSecret);
    }
    app.node.setContext("verificationAgentName", verificationAgentName);
    if (Object.keys(executionAgentArns).length > 0) {
        app.node.setContext("executionAgentArns", executionAgentArns);
    }
    if (autoReplyChannelIds.length > 0) {
        app.node.setContext("autoReplyChannelIds", autoReplyChannelIds);
    }
}
setContextFromConfig(config);
/**
 * Get CDK environment configuration
 */
function getDefaultEnv(region) {
    return {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: region,
    };
}
const defaultEnv = getDefaultEnv(region);
function getStackEnvironment(accountId, region, defaultEnv) {
    return accountId ? { account: accountId, region: region } : defaultEnv;
}
const verificationEnv = getStackEnvironment(verificationAccountId, region, defaultEnv);
const bedrockModelId = getConfigString("bedrockModelId", "jp.anthropic.claude-sonnet-4-5-20250929-v1:0");
// Slack Search Agent ARN (optional; set after deploying slack-search-agent stack)
const slackSearchAgentArn = process.env.SLACK_SEARCH_AGENT_ARN?.trim() ||
    getConfigString("slackSearchAgentArn") ||
    undefined;
if (slackSearchAgentArn) {
    app.node.setContext("slackSearchAgentArn", slackSearchAgentArn);
}
// Archive account ID for cross-account S3 replication (optional; same-account if absent)
const archiveAccountId = process.env.ARCHIVE_ACCOUNT_ID?.trim() ||
    getConfigString("archiveAccountId") ||
    undefined;
// Create Verification Stack
new verification_stack_1.VerificationStack(app, verificationStackName, {
    env: verificationEnv,
    executionAccountId: executionAccountId || undefined,
    verificationAgentName: verificationAgentName || undefined,
    executionAgentArns: Object.keys(executionAgentArns).length > 0 ? executionAgentArns : undefined,
    bedrockModelId: bedrockModelId || undefined,
    autoReplyChannelIds: autoReplyChannelIds.length > 0 ? autoReplyChannelIds : undefined,
    mentionChannelIds: mentionChannelIds.length > 0 ? mentionChannelIds : undefined,
    slackSearchAgentArn: slackSearchAgentArn || undefined,
    archiveAccountId: archiveAccountId || undefined,
});
(0, cdk_tooling_1.logInfo)("Verification stack created.", {
    phase: "stack",
    context: { stackName: verificationStackName },
});
// Emit cloud assembly
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLDZDQUFzQztBQUN0QywyQ0FBNkI7QUFDN0Isa0VBQThEO0FBQzlELHdEQUlpQztBQUNqQywyREFNbUM7QUFFbkMsWUFBWTtBQUNaLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFVLENBQUM7QUFDcEQsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7QUFDbEMsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFJeEMsd0VBQXdFO0FBQ3hFLE1BQU0sTUFBTSxHQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMxRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUEscUJBQU8sRUFBQyxvQ0FBb0MsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBRW5FLDBDQUEwQztBQUMxQyxxQkFBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQ0FBa0IsRUFBRSxDQUFDLENBQUM7QUFDOUMscUJBQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUkscUNBQXVCLEVBQUUsQ0FBQyxDQUFDO0FBRW5EOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLHdCQUF3QjtJQUMvQixNQUFNLGdCQUFnQixHQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7UUFDMUIsR0FBRyxD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QyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLFNBQVM7SUFDckYsaUJBQWlCLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFNBQVM7SUFDL0UsbUJBQW1CLEVBQUUsbUJBQW1CLElBQUksU0FBUztJQUNyRCxnQkFBZ0IsRUFBRSxnQkFBZ0IsSUFBSSxTQUFTO0NBQ2hELENBQUMsQ0FBQztBQUNILElBQUEscUJBQU8sRUFBQyw2QkFBNkIsRUFBRTtJQUNyQyxLQUFLLEVBQUUsT0FBTztJQUNkLE9BQU8sRUFBRSxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRTtDQUM5QyxDQUFDLENBQUM7QUFFSCxzQkFBc0I7QUFDdEIsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuLyoqXG4gKiBWZXJpZmljYXRpb24gWm9uZSBDREsgQXBwbGljYXRpb24gRW50cnkgUG9pbnRcbiAqXG4gKiBUaGlzIGZpbGUgZGVmaW5lcyB0aGUgc3RhbmRhbG9uZSBDREsgYXBwbGljYXRpb24gZm9yIHRoZSBWZXJpZmljYXRpb24gWm9uZS5cbiAqIEl0IGluc3RhbnRpYXRlcyBvbmx5IHRoZSBWZXJpZmljYXRpb25TdGFjazsgZXhlY3V0aW9uIHN0YWNrcyBsaXZlIGluIGEgc2VwYXJhdGUgQ0RLIGFwcC5cbiAqXG4gKiBDb25maWd1cmF0aW9uIHByaW9yaXR5IChoaWdoZXN0IGZpcnN0KTogKDEpIEVudmlyb25tZW50IHZhcmlhYmxlcyAoZS5nLiBERVBMT1lNRU5UX0VOViwgU0xBQ0tfQk9UX1RPS0VOKSxcbiAqICgyKSBDb21tYW5kLWxpbmUgY29udGV4dCAoLS1jb250ZXh0IGtleT12YWx1ZSksICgzKSBFbnZpcm9ubWVudC1zcGVjaWZpYyBjb25maWcgZmlsZSAoY2RrLmNvbmZpZy57ZW52fS5qc29uKSxcbiAqICg0KSBEZWZhdWx0cyBpbiBjb2RlLiBTZWUgZ2V0Q29uZmlnVmFsdWUgLyBnZXRDb25maWdTdHJpbmcgYW5kIGxvYWRDb25maWd1cmF0aW9uLlxuICpcbiAqIEV4ZWN1dGlvbiBhZ2VudCBBUk5zIGFyZSBzdXBwbGllZCB2aWEgY29uZmlnIGZpbGUgKGV4ZWN1dGlvbkFnZW50QXJucykgb3IgaW5kaXZpZHVhbCBlbnYgdmFyczpcbiAqIEZJTEVfQ1JFQVRPUl9BR0VOVF9BUk4sIERPQ1NfQUdFTlRfQVJOLCBUSU1FX0FHRU5UX0FSTiwgV0VCX0ZFVENIX0FHRU5UX0FSTlxuICogKG9yIGNvbWJpbmVkIEVYRUNVVElPTl9BR0VOVF9BUk5TIEpTT04pLlxuICpcbiAqIERlcGxveSBvcmRlcjogMSkgRGVwbG95IGV4ZWN1dGlvbiBDREsgYXBwIChleGVjdXRpb24tem9uZXMvKSB0byBnZXQgcnVudGltZSBBUk5zLFxuICogICAgICAgICAgICAgICAyKSBTZXQgZXhlY3V0aW9uQWdlbnRBcm5zIGluIGNkay5jb25maWcue2Vudn0uanNvbiAob3IgZW52IHZhcnMpLFxuICogICAgICAgICAgICAgICAzKSBEZXBsb3kgdGhpcyBhcHA6IG5weCBjZGsgZGVwbG95XG4gKlxuICogQG1vZHVsZSB2ZXJpZmljYXRpb24tem9uZXMvdmVyaWZpY2F0aW9uLWFnZW50L2Nkay9iaW4vY2RrXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgQXNwZWN0cyB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uU3RhY2sgfSBmcm9tIFwiLi4vbGliL3ZlcmlmaWNhdGlvbi1zdGFja1wiO1xuaW1wb3J0IHtcbiAgbG9hZENka0NvbmZpZyxcbiAgYXBwbHlFbnZPdmVycmlkZXMsXG4gIENka0NvbmZpZyxcbn0gZnJvbSBcIi4uL2xpYi90eXBlcy9jZGstY29uZmlnXCI7XG5pbXBvcnQge1xuICBMb2dSZXRlbnRpb25Bc3BlY3QsXG4gIENvc3RBbGxvY2F0aW9uVGFnQXNwZWN0LFxuICBsb2dJbmZvLFxuICBsb2dXYXJuLFxuICBDZGtFcnJvcixcbn0gZnJvbSBcIkBzbGFjay1haS1hcHAvY2RrLXRvb2xpbmdcIjtcblxuLy8gQ29uc3RhbnRzXG5jb25zdCBWQUxJRF9FTlZJUk9OTUVOVFMgPSBbXCJkZXZcIiwgXCJwcm9kXCJdIGFzIGNvbnN0O1xuY29uc3QgREVGQVVMVF9FTlZJUk9OTUVOVCA9IFwiZGV2XCI7XG5jb25zdCBERUZBVUxUX1JFR0lPTiA9IFwiYXAtbm9ydGhlYXN0LTFcIjtcblxudHlwZSBEZXBsb3ltZW50RW52aXJvbm1lbnQgPSAodHlwZW9mIFZBTElEX0VOVklST05NRU5UUylbbnVtYmVyXTtcblxuLy8gT3V0ZGlyIGZvciBjbG91ZCBhc3NlbWJseSAoQ0xJIHNldHMgQ0RLX09VVERJUjsgZWxzZSBkZWZhdWx0IGNkay5vdXQpXG5jb25zdCBvdXRkaXIgPVxuICBwcm9jZXNzLmVudi5DREtfT1VURElSIHx8IHBhdGguam9pbihwYXRoLmRpcm5hbWUoX19kaXJuYW1lKSwgXCJjZGsub3V0XCIpO1xuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoeyBvdXRkaXIgfSk7XG5cbmxvZ0luZm8oXCJWZXJpZmljYXRpb24gWm9uZSBDREsgYXBwIHN0YXJ0aW5nXCIsIHsgcGhhc2U6IFwiY29uZmlnXCIgfSk7XG5cbi8vIEFwcGx5IHN5bnRoZXNpcy10aW1lIHZhbGlkYXRpb24gYXNwZWN0c1xuQXNwZWN0cy5vZihhcHApLmFkZChuZXcgTG9nUmV0ZW50aW9uQXNwZWN0KCkpO1xuQXNwZWN0cy5vZihhcHApLmFkZChuZXcgQ29zdEFsbG9jYXRpb25UYWdBc3BlY3QoKSk7XG5cbi8qKlxuICogR2V0IGFuZCB2YWxpZGF0ZSBkZXBsb3ltZW50IGVudmlyb25tZW50LlxuICpcbiAqIFByaW9yaXR5OiAxLiBERVBMT1lNRU5UX0VOViBlbnZpcm9ubWVudCB2YXJpYWJsZSwgMi4gY2RrLmpzb24gY29udGV4dCwgMy4gZGVmYXVsdFxuICpcbiAqIEByZXR1cm5zIFZhbGlkYXRlZCBkZXBsb3ltZW50IGVudmlyb25tZW50XG4gKiBAdGhyb3dzIHtDZGtFcnJvcn0gSWYgZGVwbG95bWVudCBlbnZpcm9ubWVudCBpcyBpbnZhbGlkXG4gKi9cbmZ1bmN0aW9uIGdldERlcGxveW1lbnRFbnZpcm9ubWVudCgpOiBEZXBsb3ltZW50RW52aXJvbm1lbnQge1xuICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViB8fFxuICAgIGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpIHx8XG4gICAgREVGQVVMVF9FTlZJUk9OTUVOVDtcblxuICBjb25zdCBkZXBsb3ltZW50RW52ID0gZGVwbG95bWVudEVudlJhd1xuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnRyaW0oKSBhcyBEZXBsb3ltZW50RW52aXJvbm1lbnQ7XG5cbiAgaWYgKCFWQUxJRF9FTlZJUk9OTUVOVFMuaW5jbHVkZXMoZGVwbG95bWVudEVudikpIHtcbiAgICBDZGtFcnJvci50aHJvdyh7XG4gICAgICBtZXNzYWdlOiBgSW52YWxpZCBkZXBsb3ltZW50IGVudmlyb25tZW50ICcke2RlcGxveW1lbnRFbnZSYXd9Jy4gTXVzdCBiZSBvbmUgb2Y6ICR7VkFMSURfRU5WSVJPTk1FTlRTLmpvaW4oXCIsIFwiKX0uYCxcbiAgICAgIGNhdXNlOiBcIkludmFsaWQgZGVwbG95bWVudCBlbnZpcm9ubWVudFwiLFxuICAgICAgcmVtZWRpYXRpb246IGBTZXQgREVQTE9ZTUVOVF9FTlYgb3IgdXNlIC0tY29udGV4dCBkZXBsb3ltZW50RW52IHRvIG9uZSBvZjogJHtWQUxJRF9FTlZJUk9OTUVOVFMuam9pbihcIiwgXCIpfWAsXG4gICAgICBzb3VyY2U6IFwiYXBwXCIsXG4gICAgfSk7XG4gIH1cblxuICBpZiAoIXByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WICYmICFhcHAubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSkge1xuICAgIGxvZ1dhcm4oXG4gICAgICBgREVQTE9ZTUVOVF9FTlYgbm90IHNldC4gRGVmYXVsdGluZyB0byAnJHtERUZBVUxUX0VOVklST05NRU5UfScgZW52aXJvbm1lbnQuYCxcbiAgICAgIHtcbiAgICAgICAgcGhhc2U6IFwiY29uZmlnXCIsXG4gICAgICB9LFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gZGVwbG95bWVudEVudjtcbn1cblxuY29uc3QgZGVwbG95bWVudEVudiA9IGdldERlcGxveW1lbnRFbnZpcm9ubWVudCgpO1xuXG4vKipcbiAqIExvYWQgY29uZmlndXJhdGlvbiBmcm9tIGZpbGVzIHdpdGggZmFsbGJhY2sgdG8gY29udGV4dC9kZWZhdWx0c1xuICpcbiAqIEBwYXJhbSBlbnYgLSBEZXBsb3ltZW50IGVudmlyb25tZW50XG4gKiBAcmV0dXJucyBDb25maWd1cmF0aW9uIG9iamVjdCBvciBudWxsIGlmIGxvYWRpbmcgZmFpbGVkXG4gKi9cbmZ1bmN0aW9uIGxvYWRDb25maWd1cmF0aW9uKGVudjogRGVwbG95bWVudEVudmlyb25tZW50KTogQ2RrQ29uZmlnIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgY2RrRGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLlwiKTtcbiAgICBjb25zdCBmaWxlQ29uZmlnID0gbG9hZENka0NvbmZpZyhlbnYsIGNka0Rpcik7XG4gICAgcmV0dXJuIGFwcGx5RW52T3ZlcnJpZGVzKGZpbGVDb25maWcpO1xuICB9IGNhdGNoIHtcbiAgICBsb2dXYXJuKFxuICAgICAgXCJDb25maWd1cmF0aW9uIGZpbGUgbG9hZCBmYWlsZWQ7IGZhbGxpbmcgYmFjayB0byBjb250ZXh0IG9yIGRlZmF1bHRzLlwiLFxuICAgICAge1xuICAgICAgICBwaGFzZTogXCJjb25maWdcIixcbiAgICAgICAgY29udGV4dDogeyBzdGVwOiBcImNvbmZpZyBsb2FkXCIgfSxcbiAgICAgIH0sXG4gICAgKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5jb25zdCBjb25maWcgPSBsb2FkQ29uZmlndXJhdGlvbihkZXBsb3ltZW50RW52KTtcblxubG9nSW5mbyhcbiAgY29uZmlnXG4gICAgPyBcIkNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZmlsZSBvciBlbnYgb3ZlcnJpZGVzLlwiXG4gICAgOiBcIlVzaW5nIGNvbnRleHQgb3IgZGVmYXVsdHMgKG5vIGNvbmZpZyBmaWxlKS5cIixcbiAgeyBwaGFzZTogXCJjb25maWdcIiwgY29udGV4dDogeyBkZXBsb3ltZW50RW52IH0gfSxcbik7XG5cbi8qKlxuICogR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWUgd2l0aCBwcmlvcml0eTogY29udGV4dCA+IGNvbmZpZyBmaWxlID4gZGVmYXVsdFxuICovXG5mdW5jdGlvbiBnZXRDb25maWdWYWx1ZTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogVCB7XG4gIGNvbnN0IGNvbnRleHRWYWx1ZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoa2V5KTtcbiAgaWYgKGNvbnRleHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGNvbnRleHRWYWx1ZSBhcyBUO1xuICB9XG4gIGlmIChjb25maWcgJiYga2V5IGluIGNvbmZpZykge1xuICAgIHJldHVybiAoY29uZmlnIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0gYXMgVDtcbiAgfVxuICByZXR1cm4gZGVmYXVsdFZhbHVlO1xufVxuXG4vKipcbiAqIEdldCBjb25maWd1cmF0aW9uIHZhbHVlIGFzIHN0cmluZyB3aXRoIGVtcHR5IHN0cmluZyBoYW5kbGluZ1xuICovXG5mdW5jdGlvbiBnZXRDb25maWdTdHJpbmcoa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZSA9IFwiXCIpOiBzdHJpbmcge1xuICBjb25zdCB2YWx1ZSA9IGdldENvbmZpZ1ZhbHVlPHN0cmluZz4oa2V5LCBkZWZhdWx0VmFsdWUpO1xuICByZXR1cm4gdmFsdWUgfHwgXCJcIjtcbn1cblxuLyoqXG4gKiBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZSBhcyBvYmplY3QuXG4gKi9cbmZ1bmN0aW9uIGdldENvbmZpZ09iamVjdDxUIGV4dGVuZHMgb2JqZWN0PihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogVCB7XG4gIGNvbnN0IHZhbHVlID0gZ2V0Q29uZmlnVmFsdWU8VD4oa2V5LCBkZWZhdWx0VmFsdWUpO1xuICByZXR1cm4gdmFsdWUgfHwgZGVmYXVsdFZhbHVlO1xufVxuXG4vLyBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZXNcbmNvbnN0IHJlZ2lvbiA9IGdldENvbmZpZ1ZhbHVlKFwiYXdzUmVnaW9uXCIsIERFRkFVTFRfUkVHSU9OKTtcblxuLy8gU3RhY2sgbmFtZSAod2l0aG91dCBlbnZpcm9ubWVudCBzdWZmaXgpXG5jb25zdCBiYXNlVmVyaWZpY2F0aW9uU3RhY2tOYW1lID0gZ2V0Q29uZmlnVmFsdWUoXG4gIFwidmVyaWZpY2F0aW9uU3RhY2tOYW1lXCIsXG4gIFwiU2xhY2tBSS1WZXJpZmljYXRpb25cIixcbik7XG5cbi8vIEFkZCBlbnZpcm9ubWVudCBzdWZmaXhcbmNvbnN0IGVudmlyb25tZW50U3VmZml4ID0gZGVwbG95bWVudEVudiA9PT0gXCJwcm9kXCIgPyBcIlByb2RcIiA6IFwiRGV2XCI7XG5jb25zdCB2ZXJpZmljYXRpb25TdGFja05hbWUgPSBgJHtiYXNlVmVyaWZpY2F0aW9uU3RhY2tOYW1lfS0ke2Vudmlyb25tZW50U3VmZml4fWA7XG5cbi8vIENyb3NzLWFjY291bnQgY29uZmlndXJhdGlvblxuY29uc3QgdmVyaWZpY2F0aW9uQWNjb3VudElkID0gZ2V0Q29uZmlnU3RyaW5nKFwidmVyaWZpY2F0aW9uQWNjb3VudElkXCIpO1xuY29uc3QgZXhlY3V0aW9uQWNjb3VudElkID0gZ2V0Q29uZmlnU3RyaW5nKFwiZXhlY3V0aW9uQWNjb3VudElkXCIpO1xuXG4vLyBBZ2VudENvcmUgY29uZmlndXJhdGlvblxuY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID0gZ2V0Q29uZmlnU3RyaW5nKFxuICBcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiLFxuICBgU2xhY2tBSV9WZXJpZmljYXRpb25BZ2VudF8ke2Vudmlyb25tZW50U3VmZml4fWAsXG4pO1xuXG4vKiogUGFyc2UgYSBjb250ZXh0IHZhbHVlIChzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCkgaW50byBhIHN0cmluZ1tdLiAqL1xuY29uc3QgcGFyc2VDaGFubmVsSWRDb250ZXh0ID0gKGN0eFJhdzogdW5rbm93biwgZmFsbGJhY2s6IHN0cmluZ1tdKTogc3RyaW5nW10gPT4ge1xuICBpZiAoY3R4UmF3ID09PSB1bmRlZmluZWQpIHJldHVybiBmYWxsYmFjaztcbiAgaWYgKHR5cGVvZiBjdHhSYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShjdHhSYXcpIGFzIHVua25vd247XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiAocGFyc2VkIGFzIHVua25vd25bXSkubWFwKFN0cmluZykuZmlsdGVyKChzKSA9PiBzLnRyaW0oKSAhPT0gXCJcIik7XG4gICAgICB9XG4gICAgfSBjYXRjaCB7XG4gICAgICAvLyBOb3QgSlNPTiDigJQgdHJlYXQgYXMgY29tbWEtc2VwYXJhdGVkXG4gICAgfVxuICAgIHJldHVybiBjdHhSYXcuc3BsaXQoXCIsXCIpLm1hcCgocykgPT4gcy50cmltKCkpLmZpbHRlcigocykgPT4gcyAhPT0gXCJcIik7XG4gIH1cbiAgaWYgKEFycmF5LmlzQXJyYXkoY3R4UmF3KSkge1xuICAgIHJldHVybiAoY3R4UmF3IGFzIHVua25vd25bXSkubWFwKFN0cmluZykuZmlsdGVyKChzKSA9PiBzLnRyaW0oKSAhPT0gXCJcIik7XG4gIH1cbiAgcmV0dXJuIGZhbGxiYWNrO1xufTtcblxuLy8gQXV0by1yZXBseSBjaGFubmVsIElEcyAoZnJvbSBjb250ZXh0LCBjb25maWcgZmlsZSwgb3IgZW52IHZhcikuXG4vLyAtLWNvbnRleHQgYXV0b1JlcGx5Q2hhbm5lbElkcz1DMTIzLEM0NTYgIE9SICBbXCJDMTIzXCIsXCJDNDU2XCJdIEpTT04gYXJyYXlcbmNvbnN0IGF1dG9SZXBseUNoYW5uZWxJZHM6IHN0cmluZ1tdID0gcGFyc2VDaGFubmVsSWRDb250ZXh0KFxuICBhcHAubm9kZS50cnlHZXRDb250ZXh0KFwiYXV0b1JlcGx5Q2hhbm5lbElkc1wiKSxcbiAgY29uZmlnPy5hdXRvUmVwbHlDaGFubmVsSWRzID8/IFtdXG4pO1xuXG4vLyBNZW50aW9uLWFsbG93ZWQgY2hhbm5lbCBJRHMgKGZyb20gY29udGV4dCwgY29uZmlnIGZpbGUsIG9yIGVudiB2YXIpLlxuLy8gV2hlbiBzZXQsIGFwcF9tZW50aW9uIGV2ZW50cyBmcm9tIG90aGVyIGNoYW5uZWxzIGFyZSBzaWxlbnRseSBpZ25vcmVkLlxuLy8gLS1jb250ZXh0IG1lbnRpb25DaGFubmVsSWRzPUMxMjMsQzQ1NiAgT1IgIFtcIkMxMjNcIixcIkM0NTZcIl0gSlNPTiBhcnJheVxuY29uc3QgbWVudGlvbkNoYW5uZWxJZHM6IHN0cmluZ1tdID0gcGFyc2VDaGFubmVsSWRDb250ZXh0KFxuICBhcHAubm9kZS50cnlHZXRDb250ZXh0KFwibWVudGlvbkNoYW5uZWxJZHNcIiksXG4gIGNvbmZpZz8ubWVudGlvbkNoYW5uZWxJZHMgPz8gW11cbik7XG5cbi8vIEV4ZWN1dGlvbiBhZ2VudCBBUk5zIChmcm9tIGNvbnRleHQsIGVudiB2YXJzLCBvciBjb25maWcgZmlsZSkuXG4vLyBDREsgLS1jb250ZXh0IGFsd2F5cyBwYXNzZXMgc3RyaW5nczsgSlNPTi1wYXJzZSB3aGVuIG5lZWRlZC5cbmNvbnN0IGV4ZWN1dGlvbkFnZW50QXJuczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9ICgoKSA9PiB7XG4gIGNvbnN0IGN0eFJhdyA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gIGlmIChjdHhSYXcgIT09IHVuZGVmaW5lZCkge1xuICAgIGlmICh0eXBlb2YgY3R4UmF3ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjdHhSYXcpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAodHlwZW9mIGN0eFJhdyA9PT0gXCJvYmplY3RcIiAmJiBjdHhSYXcgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBjdHhSYXcgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbmZpZz8uZXhlY3V0aW9uQWdlbnRBcm5zID8/IHt9O1xufSkoKTtcblxuLyoqXG4gKiBTZXQgbG9hZGVkIGNvbmZpZyB2YWx1ZXMgdG8gQ0RLIGNvbnRleHQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAqL1xuZnVuY3Rpb24gc2V0Q29udGV4dEZyb21Db25maWcoY29uZmlnOiBDZGtDb25maWcgfCBudWxsKTogdm9pZCB7XG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImF3c1JlZ2lvblwiLCByZWdpb24pO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwiYmVkcm9ja01vZGVsSWRcIiwgY29uZmlnLmJlZHJvY2tNb2RlbElkKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIiwgZGVwbG95bWVudEVudik7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25TdGFja05hbWVcIiwgYmFzZVZlcmlmaWNhdGlvblN0YWNrTmFtZSk7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BY2NvdW50SWRcIiwgdmVyaWZpY2F0aW9uQWNjb3VudElkKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImV4ZWN1dGlvbkFjY291bnRJZFwiLCBleGVjdXRpb25BY2NvdW50SWQpO1xuXG4gIGlmIChjb25maWcuc2xhY2tCb3RUb2tlbikge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIsIGNvbmZpZy5zbGFja0JvdFRva2VuKTtcbiAgfVxuICBpZiAoY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldCkge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIiwgY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldCk7XG4gIH1cbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiLCB2ZXJpZmljYXRpb25BZ2VudE5hbWUpO1xuICBpZiAoT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwKSB7XG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dChcImV4ZWN1dGlvbkFnZW50QXJuc1wiLCBleGVjdXRpb25BZ2VudEFybnMpO1xuICB9XG4gIGlmIChhdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDApIHtcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KFwiYXV0b1JlcGx5Q2hhbm5lbElkc1wiLCBhdXRvUmVwbHlDaGFubmVsSWRzKTtcbiAgfVxufVxuXG5zZXRDb250ZXh0RnJvbUNvbmZpZyhjb25maWcpO1xuXG4vKipcbiAqIEdldCBDREsgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICovXG5mdW5jdGlvbiBnZXREZWZhdWx0RW52KHJlZ2lvbjogc3RyaW5nKTogY2RrLkVudmlyb25tZW50IHtcbiAgcmV0dXJuIHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcmVnaW9uLFxuICB9O1xufVxuXG5jb25zdCBkZWZhdWx0RW52ID0gZ2V0RGVmYXVsdEVudihyZWdpb24pO1xuXG5mdW5jdGlvbiBnZXRTdGFja0Vudmlyb25tZW50KFxuICBhY2NvdW50SWQ6IHN0cmluZyxcbiAgcmVnaW9uOiBzdHJpbmcsXG4gIGRlZmF1bHRFbnY6IGNkay5FbnZpcm9ubWVudCxcbik6IGNkay5FbnZpcm9ubWVudCB7XG4gIHJldHVybiBhY2NvdW50SWQgPyB7IGFjY291bnQ6IGFjY291bnRJZCwgcmVnaW9uOiByZWdpb24gfSA6IGRlZmF1bHRFbnY7XG59XG5cbmNvbnN0IHZlcmlmaWNhdGlvbkVudiA9IGdldFN0YWNrRW52aXJvbm1lbnQoXG4gIHZlcmlmaWNhdGlvbkFjY291bnRJZCxcbiAgcmVnaW9uLFxuICBkZWZhdWx0RW52LFxuKTtcblxuY29uc3QgYmVkcm9ja01vZGVsSWQgPSBnZXRDb25maWdTdHJpbmcoXG4gIFwiYmVkcm9ja01vZGVsSWRcIixcbiAgXCJqcC5hbnRocm9waWMuY2xhdWRlLXNvbm5ldC00LTUtMjAyNTA5MjktdjE6MFwiLFxuKTtcblxuLy8gU2xhY2sgU2VhcmNoIEFnZW50IEFSTiAob3B0aW9uYWw7IHNldCBhZnRlciBkZXBsb3lpbmcgc2xhY2stc2VhcmNoLWFnZW50IHN0YWNrKVxuY29uc3Qgc2xhY2tTZWFyY2hBZ2VudEFybiA9XG4gIHByb2Nlc3MuZW52LlNMQUNLX1NFQVJDSF9BR0VOVF9BUk4/LnRyaW0oKSB8fFxuICBnZXRDb25maWdTdHJpbmcoXCJzbGFja1NlYXJjaEFnZW50QXJuXCIpIHx8XG4gIHVuZGVmaW5lZDtcbmlmIChzbGFja1NlYXJjaEFnZW50QXJuKSB7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja1NlYXJjaEFnZW50QXJuXCIsIHNsYWNrU2VhcmNoQWdlbnRBcm4pO1xufVxuXG4vLyBBcmNoaXZlIGFjY291bnQgSUQgZm9yIGNyb3NzLWFjY291bnQgUzMgcmVwbGljYXRpb24gKG9wdGlvbmFsOyBzYW1lLWFjY291bnQgaWYgYWJzZW50KVxuY29uc3QgYXJjaGl2ZUFjY291bnRJZCA9XG4gIHByb2Nlc3MuZW52LkFSQ0hJVkVfQUNDT1VOVF9JRD8udHJpbSgpIHx8XG4gIGdldENvbmZpZ1N0cmluZyhcImFyY2hpdmVBY2NvdW50SWRcIikgfHxcbiAgdW5kZWZpbmVkO1xuXG4vLyBDcmVhdGUgVmVyaWZpY2F0aW9uIFN0YWNrXG5uZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwLCB2ZXJpZmljYXRpb25TdGFja05hbWUsIHtcbiAgZW52OiB2ZXJpZmljYXRpb25FbnYsXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogZXhlY3V0aW9uQWNjb3VudElkIHx8IHVuZGVmaW5lZCxcbiAgdmVyaWZpY2F0aW9uQWdlbnROYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUgfHwgdW5kZWZpbmVkLFxuICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwID8gZXhlY3V0aW9uQWdlbnRBcm5zIDogdW5kZWZpbmVkLFxuICBiZWRyb2NrTW9kZWxJZDogYmVkcm9ja01vZGVsSWQgfHwgdW5kZWZpbmVkLFxuICBhdXRvUmVwbHlDaGFubmVsSWRzOiBhdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDAgPyBhdXRvUmVwbHlDaGFubmVsSWRzIDogdW5kZWZpbmVkLFxuICBtZW50aW9uQ2hhbm5lbElkczogbWVudGlvbkNoYW5uZWxJZHMubGVuZ3RoID4gMCA/IG1lbnRpb25DaGFubmVsSWRzIDogdW5kZWZpbmVkLFxuICBzbGFja1NlYXJjaEFnZW50QXJuOiBzbGFja1NlYXJjaEFnZW50QXJuIHx8IHVuZGVmaW5lZCxcbiAgYXJjaGl2ZUFjY291bnRJZDogYXJjaGl2ZUFjY291bnRJZCB8fCB1bmRlZmluZWQsXG59KTtcbmxvZ0luZm8oXCJWZXJpZmljYXRpb24gc3RhY2sgY3JlYXRlZC5cIiwge1xuICBwaGFzZTogXCJzdGFja1wiLFxuICBjb250ZXh0OiB7IHN0YWNrTmFtZTogdmVyaWZpY2F0aW9uU3RhY2tOYW1lIH0sXG59KTtcblxuLy8gRW1pdCBjbG91ZCBhc3NlbWJseVxuYXBwLnN5bnRoKCk7XG4iXX0=