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
/**
 * Parse a context value into a ChannelIdEntry[].
 * Supports plain string CSV, JSON string arrays, and JSON object arrays.
 * Each element may be a plain channel ID string or {"id": "...", "label": "..."}.
 */
const parseChannelIdContext = (ctxRaw, fallback) => {
    if (ctxRaw === undefined)
        return fallback;
    if (typeof ctxRaw === "string") {
        try {
            const parsed = JSON.parse(ctxRaw);
            if (Array.isArray(parsed)) {
                return parsed.flatMap((item) => {
                    if (typeof item === "string" && item.trim() !== "")
                        return [item.trim()];
                    if (item !== null &&
                        typeof item === "object" &&
                        "id" in item &&
                        typeof item.id === "string") {
                        const entry = item;
                        if (entry.id.trim() !== "") {
                            return [{ id: entry.id.trim(), label: (entry.label ?? "").trim() }];
                        }
                    }
                    return [];
                });
            }
        }
        catch {
            // Not JSON — treat as comma-separated plain IDs
        }
        return ctxRaw.split(",").map((s) => s.trim()).filter((s) => s !== "");
    }
    if (Array.isArray(ctxRaw)) {
        return ctxRaw.flatMap((item) => {
            if (typeof item === "string" && item.trim() !== "")
                return [item.trim()];
            if (item !== null &&
                typeof item === "object" &&
                "id" in item &&
                typeof item.id === "string") {
                const entry = item;
                if (entry.id.trim() !== "") {
                    return [{ id: entry.id.trim(), label: (entry.label ?? "").trim() }];
                }
            }
            return [];
        });
    }
    return fallback;
};
// Auto-reply channel IDs (from context, config file, or env var).
// --context autoReplyChannelIds=C123,C456  OR  [{"id":"C123","label":"#general"}] JSON array
const autoReplyChannelIds = parseChannelIdContext(app.node.tryGetContext("autoReplyChannelIds"), config?.autoReplyChannelIds ?? []);
// Mention-allowed channel IDs (from context, config file, or env var).
// When set, app_mention events from other channels are silently ignored.
// --context mentionChannelIds=C123,C456  OR  [{"id":"C123","label":"#general"}] JSON array
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
(0, cdk_tooling_1.applyNagPacks)(app);
// Emit cloud assembly
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLDZDQUFzQztBQUN0QywyQ0FBNkI7QUFDN0Isa0VBQThEO0FBQzlELHdEQUtpQztBQUNqQywyREFPbUM7QUFFbkMsWUFBWTtBQUNaLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFVLENBQUM7QUFDcEQsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7QUFDbEMsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFJeEMsd0VBQXdFO0FBQ3hFLE1BQU0sTUFBTSxHQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMxRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUEscUJBQU8sRUFBQyxvQ0FBb0MsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBRW5FLDBDQUEwQztBQUMxQyxxQkFBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQ0FBa0IsRUFBRSxDQUFDLENBQUM7QUFDOUMscUJBQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUkscUNBQXVCLEVBQUUsQ0FBQyxDQUFDO0FBRW5EOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLHdCQUF3QjtJQUMvQixNQUFNLGdCQUFnQixHQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7UUFDMUIsR0FBRyxD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QUFFLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxTQUFTO0lBQ3JGLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxTQUFTO0lBQy9FLG1CQUFtQixFQUFFLG1CQUFtQixJQUFJLFNBQVM7SUFDckQsZ0JBQWdCLEVBQUUsZ0JBQWdCLElBQUksU0FBUztDQUNoRCxDQUFDLENBQUM7QUFDSCxJQUFBLHFCQUFPLEVBQUMsNkJBQTZCLEVBQUU7SUFDckMsS0FBSyxFQUFFLE9BQU87SUFDZCxPQUFPLEVBQUUsRUFBRSxTQUFTLEVBQUUscUJBQXFCLEVBQUU7Q0FDOUMsQ0FBQyxDQUFDO0FBRUgsSUFBQSwyQkFBYSxFQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ25CLHNCQUFzQjtBQUN0QixHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG4vKipcbiAqIFZlcmlmaWNhdGlvbiBab25lIENESyBBcHBsaWNhdGlvbiBFbnRyeSBQb2ludFxuICpcbiAqIFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBzdGFuZGFsb25lIENESyBhcHBsaWNhdGlvbiBmb3IgdGhlIFZlcmlmaWNhdGlvbiBab25lLlxuICogSXQgaW5zdGFudGlhdGVzIG9ubHkgdGhlIFZlcmlmaWNhdGlvblN0YWNrOyBleGVjdXRpb24gc3RhY2tzIGxpdmUgaW4gYSBzZXBhcmF0ZSBDREsgYXBwLlxuICpcbiAqIENvbmZpZ3VyYXRpb24gcHJpb3JpdHkgKGhpZ2hlc3QgZmlyc3QpOiAoMSkgRW52aXJvbm1lbnQgdmFyaWFibGVzIChlLmcuIERFUExPWU1FTlRfRU5WLCBTTEFDS19CT1RfVE9LRU4pLFxuICogKDIpIENvbW1hbmQtbGluZSBjb250ZXh0ICgtLWNvbnRleHQga2V5PXZhbHVlKSwgKDMpIEVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZyBmaWxlIChjZGsuY29uZmlnLntlbnZ9Lmpzb24pLFxuICogKDQpIERlZmF1bHRzIGluIGNvZGUuIFNlZSBnZXRDb25maWdWYWx1ZSAvIGdldENvbmZpZ1N0cmluZyBhbmQgbG9hZENvbmZpZ3VyYXRpb24uXG4gKlxuICogRXhlY3V0aW9uIGFnZW50IEFSTnMgYXJlIHN1cHBsaWVkIHZpYSBjb25maWcgZmlsZSAoZXhlY3V0aW9uQWdlbnRBcm5zKSBvciBpbmRpdmlkdWFsIGVudiB2YXJzOlxuICogRklMRV9DUkVBVE9SX0FHRU5UX0FSTiwgRE9DU19BR0VOVF9BUk4sIFRJTUVfQUdFTlRfQVJOLCBXRUJfRkVUQ0hfQUdFTlRfQVJOXG4gKiAob3IgY29tYmluZWQgRVhFQ1VUSU9OX0FHRU5UX0FSTlMgSlNPTikuXG4gKlxuICogRGVwbG95IG9yZGVyOiAxKSBEZXBsb3kgZXhlY3V0aW9uIENESyBhcHAgKGV4ZWN1dGlvbi16b25lcy8pIHRvIGdldCBydW50aW1lIEFSTnMsXG4gKiAgICAgICAgICAgICAgIDIpIFNldCBleGVjdXRpb25BZ2VudEFybnMgaW4gY2RrLmNvbmZpZy57ZW52fS5qc29uIChvciBlbnYgdmFycyksXG4gKiAgICAgICAgICAgICAgIDMpIERlcGxveSB0aGlzIGFwcDogbnB4IGNkayBkZXBsb3lcbiAqXG4gKiBAbW9kdWxlIHZlcmlmaWNhdGlvbi16b25lcy92ZXJpZmljYXRpb24tYWdlbnQvY2RrL2Jpbi9jZGtcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBBc3BlY3RzIH0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBWZXJpZmljYXRpb25TdGFjayB9IGZyb20gXCIuLi9saWIvdmVyaWZpY2F0aW9uLXN0YWNrXCI7XG5pbXBvcnQge1xuICBsb2FkQ2RrQ29uZmlnLFxuICBhcHBseUVudk92ZXJyaWRlcyxcbiAgQ2RrQ29uZmlnLFxuICBDaGFubmVsSWRFbnRyeSxcbn0gZnJvbSBcIi4uL2xpYi90eXBlcy9jZGstY29uZmlnXCI7XG5pbXBvcnQge1xuICBMb2dSZXRlbnRpb25Bc3BlY3QsXG4gIENvc3RBbGxvY2F0aW9uVGFnQXNwZWN0LFxuICBsb2dJbmZvLFxuICBsb2dXYXJuLFxuICBDZGtFcnJvcixcbiAgYXBwbHlOYWdQYWNrcyxcbn0gZnJvbSBcIkBzbGFjay1haS1hcHAvY2RrLXRvb2xpbmdcIjtcblxuLy8gQ29uc3RhbnRzXG5jb25zdCBWQUxJRF9FTlZJUk9OTUVOVFMgPSBbXCJkZXZcIiwgXCJwcm9kXCJdIGFzIGNvbnN0O1xuY29uc3QgREVGQVVMVF9FTlZJUk9OTUVOVCA9IFwiZGV2XCI7XG5jb25zdCBERUZBVUxUX1JFR0lPTiA9IFwiYXAtbm9ydGhlYXN0LTFcIjtcblxudHlwZSBEZXBsb3ltZW50RW52aXJvbm1lbnQgPSAodHlwZW9mIFZBTElEX0VOVklST05NRU5UUylbbnVtYmVyXTtcblxuLy8gT3V0ZGlyIGZvciBjbG91ZCBhc3NlbWJseSAoQ0xJIHNldHMgQ0RLX09VVERJUjsgZWxzZSBkZWZhdWx0IGNkay5vdXQpXG5jb25zdCBvdXRkaXIgPVxuICBwcm9jZXNzLmVudi5DREtfT1VURElSIHx8IHBhdGguam9pbihwYXRoLmRpcm5hbWUoX19kaXJuYW1lKSwgXCJjZGsub3V0XCIpO1xuY29uc3QgYXBwID0gbmV3IGNkay5BcHAoeyBvdXRkaXIgfSk7XG5cbmxvZ0luZm8oXCJWZXJpZmljYXRpb24gWm9uZSBDREsgYXBwIHN0YXJ0aW5nXCIsIHsgcGhhc2U6IFwiY29uZmlnXCIgfSk7XG5cbi8vIEFwcGx5IHN5bnRoZXNpcy10aW1lIHZhbGlkYXRpb24gYXNwZWN0c1xuQXNwZWN0cy5vZihhcHApLmFkZChuZXcgTG9nUmV0ZW50aW9uQXNwZWN0KCkpO1xuQXNwZWN0cy5vZihhcHApLmFkZChuZXcgQ29zdEFsbG9jYXRpb25UYWdBc3BlY3QoKSk7XG5cbi8qKlxuICogR2V0IGFuZCB2YWxpZGF0ZSBkZXBsb3ltZW50IGVudmlyb25tZW50LlxuICpcbiAqIFByaW9yaXR5OiAxLiBERVBMT1lNRU5UX0VOViBlbnZpcm9ubWVudCB2YXJpYWJsZSwgMi4gY2RrLmpzb24gY29udGV4dCwgMy4gZGVmYXVsdFxuICpcbiAqIEByZXR1cm5zIFZhbGlkYXRlZCBkZXBsb3ltZW50IGVudmlyb25tZW50XG4gKiBAdGhyb3dzIHtDZGtFcnJvcn0gSWYgZGVwbG95bWVudCBlbnZpcm9ubWVudCBpcyBpbnZhbGlkXG4gKi9cbmZ1bmN0aW9uIGdldERlcGxveW1lbnRFbnZpcm9ubWVudCgpOiBEZXBsb3ltZW50RW52aXJvbm1lbnQge1xuICBjb25zdCBkZXBsb3ltZW50RW52UmF3ID1cbiAgICBwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViB8fFxuICAgIGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpIHx8XG4gICAgREVGQVVMVF9FTlZJUk9OTUVOVDtcblxuICBjb25zdCBkZXBsb3ltZW50RW52ID0gZGVwbG95bWVudEVudlJhd1xuICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgLnRyaW0oKSBhcyBEZXBsb3ltZW50RW52aXJvbm1lbnQ7XG5cbiAgaWYgKCFWQUxJRF9FTlZJUk9OTUVOVFMuaW5jbHVkZXMoZGVwbG95bWVudEVudikpIHtcbiAgICBDZGtFcnJvci50aHJvdyh7XG4gICAgICBtZXNzYWdlOiBgSW52YWxpZCBkZXBsb3ltZW50IGVudmlyb25tZW50ICcke2RlcGxveW1lbnRFbnZSYXd9Jy4gTXVzdCBiZSBvbmUgb2Y6ICR7VkFMSURfRU5WSVJPTk1FTlRTLmpvaW4oXCIsIFwiKX0uYCxcbiAgICAgIGNhdXNlOiBcIkludmFsaWQgZGVwbG95bWVudCBlbnZpcm9ubWVudFwiLFxuICAgICAgcmVtZWRpYXRpb246IGBTZXQgREVQTE9ZTUVOVF9FTlYgb3IgdXNlIC0tY29udGV4dCBkZXBsb3ltZW50RW52IHRvIG9uZSBvZjogJHtWQUxJRF9FTlZJUk9OTUVOVFMuam9pbihcIiwgXCIpfWAsXG4gICAgICBzb3VyY2U6IFwiYXBwXCIsXG4gICAgfSk7XG4gIH1cblxuICBpZiAoIXByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WICYmICFhcHAubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSkge1xuICAgIGxvZ1dhcm4oXG4gICAgICBgREVQTE9ZTUVOVF9FTlYgbm90IHNldC4gRGVmYXVsdGluZyB0byAnJHtERUZBVUxUX0VOVklST05NRU5UfScgZW52aXJvbm1lbnQuYCxcbiAgICAgIHtcbiAgICAgICAgcGhhc2U6IFwiY29uZmlnXCIsXG4gICAgICB9LFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gZGVwbG95bWVudEVudjtcbn1cblxuY29uc3QgZGVwbG95bWVudEVudiA9IGdldERlcGxveW1lbnRFbnZpcm9ubWVudCgpO1xuXG4vKipcbiAqIExvYWQgY29uZmlndXJhdGlvbiBmcm9tIGZpbGVzIHdpdGggZmFsbGJhY2sgdG8gY29udGV4dC9kZWZhdWx0c1xuICpcbiAqIEBwYXJhbSBlbnYgLSBEZXBsb3ltZW50IGVudmlyb25tZW50XG4gKiBAcmV0dXJucyBDb25maWd1cmF0aW9uIG9iamVjdCBvciBudWxsIGlmIGxvYWRpbmcgZmFpbGVkXG4gKi9cbmZ1bmN0aW9uIGxvYWRDb25maWd1cmF0aW9uKGVudjogRGVwbG95bWVudEVudmlyb25tZW50KTogQ2RrQ29uZmlnIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgY2RrRGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLlwiKTtcbiAgICBjb25zdCBmaWxlQ29uZmlnID0gbG9hZENka0NvbmZpZyhlbnYsIGNka0Rpcik7XG4gICAgcmV0dXJuIGFwcGx5RW52T3ZlcnJpZGVzKGZpbGVDb25maWcpO1xuICB9IGNhdGNoIHtcbiAgICBsb2dXYXJuKFxuICAgICAgXCJDb25maWd1cmF0aW9uIGZpbGUgbG9hZCBmYWlsZWQ7IGZhbGxpbmcgYmFjayB0byBjb250ZXh0IG9yIGRlZmF1bHRzLlwiLFxuICAgICAge1xuICAgICAgICBwaGFzZTogXCJjb25maWdcIixcbiAgICAgICAgY29udGV4dDogeyBzdGVwOiBcImNvbmZpZyBsb2FkXCIgfSxcbiAgICAgIH0sXG4gICAgKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5jb25zdCBjb25maWcgPSBsb2FkQ29uZmlndXJhdGlvbihkZXBsb3ltZW50RW52KTtcblxubG9nSW5mbyhcbiAgY29uZmlnXG4gICAgPyBcIkNvbmZpZ3VyYXRpb24gbG9hZGVkIGZyb20gZmlsZSBvciBlbnYgb3ZlcnJpZGVzLlwiXG4gICAgOiBcIlVzaW5nIGNvbnRleHQgb3IgZGVmYXVsdHMgKG5vIGNvbmZpZyBmaWxlKS5cIixcbiAgeyBwaGFzZTogXCJjb25maWdcIiwgY29udGV4dDogeyBkZXBsb3ltZW50RW52IH0gfSxcbik7XG5cbi8qKlxuICogR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWUgd2l0aCBwcmlvcml0eTogY29udGV4dCA+IGNvbmZpZyBmaWxlID4gZGVmYXVsdFxuICovXG5mdW5jdGlvbiBnZXRDb25maWdWYWx1ZTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogVCB7XG4gIGNvbnN0IGNvbnRleHRWYWx1ZSA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoa2V5KTtcbiAgaWYgKGNvbnRleHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgcmV0dXJuIGNvbnRleHRWYWx1ZSBhcyBUO1xuICB9XG4gIGlmIChjb25maWcgJiYga2V5IGluIGNvbmZpZykge1xuICAgIHJldHVybiAoY29uZmlnIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0gYXMgVDtcbiAgfVxuICByZXR1cm4gZGVmYXVsdFZhbHVlO1xufVxuXG4vKipcbiAqIEdldCBjb25maWd1cmF0aW9uIHZhbHVlIGFzIHN0cmluZyB3aXRoIGVtcHR5IHN0cmluZyBoYW5kbGluZ1xuICovXG5mdW5jdGlvbiBnZXRDb25maWdTdHJpbmcoa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZSA9IFwiXCIpOiBzdHJpbmcge1xuICBjb25zdCB2YWx1ZSA9IGdldENvbmZpZ1ZhbHVlPHN0cmluZz4oa2V5LCBkZWZhdWx0VmFsdWUpO1xuICByZXR1cm4gdmFsdWUgfHwgXCJcIjtcbn1cblxuLyoqXG4gKiBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZSBhcyBvYmplY3QuXG4gKi9cbmZ1bmN0aW9uIGdldENvbmZpZ09iamVjdDxUIGV4dGVuZHMgb2JqZWN0PihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogVCB7XG4gIGNvbnN0IHZhbHVlID0gZ2V0Q29uZmlnVmFsdWU8VD4oa2V5LCBkZWZhdWx0VmFsdWUpO1xuICByZXR1cm4gdmFsdWUgfHwgZGVmYXVsdFZhbHVlO1xufVxuXG4vLyBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZXNcbmNvbnN0IHJlZ2lvbiA9IGdldENvbmZpZ1ZhbHVlKFwiYXdzUmVnaW9uXCIsIERFRkFVTFRfUkVHSU9OKTtcblxuLy8gU3RhY2sgbmFtZSAod2l0aG91dCBlbnZpcm9ubWVudCBzdWZmaXgpXG5jb25zdCBiYXNlVmVyaWZpY2F0aW9uU3RhY2tOYW1lID0gZ2V0Q29uZmlnVmFsdWUoXG4gIFwidmVyaWZpY2F0aW9uU3RhY2tOYW1lXCIsXG4gIFwiU2xhY2tBSS1WZXJpZmljYXRpb25cIixcbik7XG5cbi8vIEFkZCBlbnZpcm9ubWVudCBzdWZmaXhcbmNvbnN0IGVudmlyb25tZW50U3VmZml4ID0gZGVwbG95bWVudEVudiA9PT0gXCJwcm9kXCIgPyBcIlByb2RcIiA6IFwiRGV2XCI7XG5jb25zdCB2ZXJpZmljYXRpb25TdGFja05hbWUgPSBgJHtiYXNlVmVyaWZpY2F0aW9uU3RhY2tOYW1lfS0ke2Vudmlyb25tZW50U3VmZml4fWA7XG5cbi8vIENyb3NzLWFjY291bnQgY29uZmlndXJhdGlvblxuY29uc3QgdmVyaWZpY2F0aW9uQWNjb3VudElkID0gZ2V0Q29uZmlnU3RyaW5nKFwidmVyaWZpY2F0aW9uQWNjb3VudElkXCIpO1xuY29uc3QgZXhlY3V0aW9uQWNjb3VudElkID0gZ2V0Q29uZmlnU3RyaW5nKFwiZXhlY3V0aW9uQWNjb3VudElkXCIpO1xuXG4vLyBBZ2VudENvcmUgY29uZmlndXJhdGlvblxuY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID0gZ2V0Q29uZmlnU3RyaW5nKFxuICBcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiLFxuICBgU2xhY2tBSV9WZXJpZmljYXRpb25BZ2VudF8ke2Vudmlyb25tZW50U3VmZml4fWAsXG4pO1xuXG4vKipcbiAqIFBhcnNlIGEgY29udGV4dCB2YWx1ZSBpbnRvIGEgQ2hhbm5lbElkRW50cnlbXS5cbiAqIFN1cHBvcnRzIHBsYWluIHN0cmluZyBDU1YsIEpTT04gc3RyaW5nIGFycmF5cywgYW5kIEpTT04gb2JqZWN0IGFycmF5cy5cbiAqIEVhY2ggZWxlbWVudCBtYXkgYmUgYSBwbGFpbiBjaGFubmVsIElEIHN0cmluZyBvciB7XCJpZFwiOiBcIi4uLlwiLCBcImxhYmVsXCI6IFwiLi4uXCJ9LlxuICovXG5jb25zdCBwYXJzZUNoYW5uZWxJZENvbnRleHQgPSAoY3R4UmF3OiB1bmtub3duLCBmYWxsYmFjazogQ2hhbm5lbElkRW50cnlbXSk6IENoYW5uZWxJZEVudHJ5W10gPT4ge1xuICBpZiAoY3R4UmF3ID09PSB1bmRlZmluZWQpIHJldHVybiBmYWxsYmFjaztcbiAgaWYgKHR5cGVvZiBjdHhSYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShjdHhSYXcpIGFzIHVua25vd247XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG4gICAgICAgIHJldHVybiAocGFyc2VkIGFzIHVua25vd25bXSkuZmxhdE1hcCgoaXRlbSk6IENoYW5uZWxJZEVudHJ5W10gPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSA9PT0gXCJzdHJpbmdcIiAmJiBpdGVtLnRyaW0oKSAhPT0gXCJcIikgcmV0dXJuIFtpdGVtLnRyaW0oKV07XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgaXRlbSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgdHlwZW9mIGl0ZW0gPT09IFwib2JqZWN0XCIgJiZcbiAgICAgICAgICAgIFwiaWRcIiBpbiAoaXRlbSBhcyBvYmplY3QpICYmXG4gICAgICAgICAgICB0eXBlb2YgKGl0ZW0gYXMgeyBpZDogdW5rbm93biB9KS5pZCA9PT0gXCJzdHJpbmdcIlxuICAgICAgICAgICkge1xuICAgICAgICAgICAgY29uc3QgZW50cnkgPSBpdGVtIGFzIHsgaWQ6IHN0cmluZzsgbGFiZWw/OiBzdHJpbmcgfTtcbiAgICAgICAgICAgIGlmIChlbnRyeS5pZC50cmltKCkgIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFt7IGlkOiBlbnRyeS5pZC50cmltKCksIGxhYmVsOiAoZW50cnkubGFiZWwgPz8gXCJcIikudHJpbSgpIH1dO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gTm90IEpTT04g4oCUIHRyZWF0IGFzIGNvbW1hLXNlcGFyYXRlZCBwbGFpbiBJRHNcbiAgICB9XG4gICAgcmV0dXJuIGN0eFJhdy5zcGxpdChcIixcIikubWFwKChzKSA9PiBzLnRyaW0oKSkuZmlsdGVyKChzKSA9PiBzICE9PSBcIlwiKTtcbiAgfVxuICBpZiAoQXJyYXkuaXNBcnJheShjdHhSYXcpKSB7XG4gICAgcmV0dXJuIChjdHhSYXcgYXMgdW5rbm93bltdKS5mbGF0TWFwKChpdGVtKTogQ2hhbm5lbElkRW50cnlbXSA9PiB7XG4gICAgICBpZiAodHlwZW9mIGl0ZW0gPT09IFwic3RyaW5nXCIgJiYgaXRlbS50cmltKCkgIT09IFwiXCIpIHJldHVybiBbaXRlbS50cmltKCldO1xuICAgICAgaWYgKFxuICAgICAgICBpdGVtICE9PSBudWxsICYmXG4gICAgICAgIHR5cGVvZiBpdGVtID09PSBcIm9iamVjdFwiICYmXG4gICAgICAgIFwiaWRcIiBpbiAoaXRlbSBhcyBvYmplY3QpICYmXG4gICAgICAgIHR5cGVvZiAoaXRlbSBhcyB7IGlkOiB1bmtub3duIH0pLmlkID09PSBcInN0cmluZ1wiXG4gICAgICApIHtcbiAgICAgICAgY29uc3QgZW50cnkgPSBpdGVtIGFzIHsgaWQ6IHN0cmluZzsgbGFiZWw/OiBzdHJpbmcgfTtcbiAgICAgICAgaWYgKGVudHJ5LmlkLnRyaW0oKSAhPT0gXCJcIikge1xuICAgICAgICAgIHJldHVybiBbeyBpZDogZW50cnkuaWQudHJpbSgpLCBsYWJlbDogKGVudHJ5LmxhYmVsID8/IFwiXCIpLnRyaW0oKSB9XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIFtdO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBmYWxsYmFjaztcbn07XG5cbi8vIEF1dG8tcmVwbHkgY2hhbm5lbCBJRHMgKGZyb20gY29udGV4dCwgY29uZmlnIGZpbGUsIG9yIGVudiB2YXIpLlxuLy8gLS1jb250ZXh0IGF1dG9SZXBseUNoYW5uZWxJZHM9QzEyMyxDNDU2ICBPUiAgW3tcImlkXCI6XCJDMTIzXCIsXCJsYWJlbFwiOlwiI2dlbmVyYWxcIn1dIEpTT04gYXJyYXlcbmNvbnN0IGF1dG9SZXBseUNoYW5uZWxJZHM6IENoYW5uZWxJZEVudHJ5W10gPSBwYXJzZUNoYW5uZWxJZENvbnRleHQoXG4gIGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJhdXRvUmVwbHlDaGFubmVsSWRzXCIpLFxuICBjb25maWc/LmF1dG9SZXBseUNoYW5uZWxJZHMgPz8gW11cbik7XG5cbi8vIE1lbnRpb24tYWxsb3dlZCBjaGFubmVsIElEcyAoZnJvbSBjb250ZXh0LCBjb25maWcgZmlsZSwgb3IgZW52IHZhcikuXG4vLyBXaGVuIHNldCwgYXBwX21lbnRpb24gZXZlbnRzIGZyb20gb3RoZXIgY2hhbm5lbHMgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4vLyAtLWNvbnRleHQgbWVudGlvbkNoYW5uZWxJZHM9QzEyMyxDNDU2ICBPUiAgW3tcImlkXCI6XCJDMTIzXCIsXCJsYWJlbFwiOlwiI2dlbmVyYWxcIn1dIEpTT04gYXJyYXlcbmNvbnN0IG1lbnRpb25DaGFubmVsSWRzOiBDaGFubmVsSWRFbnRyeVtdID0gcGFyc2VDaGFubmVsSWRDb250ZXh0KFxuICBhcHAubm9kZS50cnlHZXRDb250ZXh0KFwibWVudGlvbkNoYW5uZWxJZHNcIiksXG4gIGNvbmZpZz8ubWVudGlvbkNoYW5uZWxJZHMgPz8gW11cbik7XG5cbi8vIEV4ZWN1dGlvbiBhZ2VudCBBUk5zIChmcm9tIGNvbnRleHQsIGVudiB2YXJzLCBvciBjb25maWcgZmlsZSkuXG4vLyBDREsgLS1jb250ZXh0IGFsd2F5cyBwYXNzZXMgc3RyaW5nczsgSlNPTi1wYXJzZSB3aGVuIG5lZWRlZC5cbmNvbnN0IGV4ZWN1dGlvbkFnZW50QXJuczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9ICgoKSA9PiB7XG4gIGNvbnN0IGN0eFJhdyA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gIGlmIChjdHhSYXcgIT09IHVuZGVmaW5lZCkge1xuICAgIGlmICh0eXBlb2YgY3R4UmF3ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjdHhSYXcpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAodHlwZW9mIGN0eFJhdyA9PT0gXCJvYmplY3RcIiAmJiBjdHhSYXcgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBjdHhSYXcgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbmZpZz8uZXhlY3V0aW9uQWdlbnRBcm5zID8/IHt9O1xufSkoKTtcblxuLyoqXG4gKiBTZXQgbG9hZGVkIGNvbmZpZyB2YWx1ZXMgdG8gQ0RLIGNvbnRleHQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAqL1xuZnVuY3Rpb24gc2V0Q29udGV4dEZyb21Db25maWcoY29uZmlnOiBDZGtDb25maWcgfCBudWxsKTogdm9pZCB7XG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImF3c1JlZ2lvblwiLCByZWdpb24pO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwiYmVkcm9ja01vZGVsSWRcIiwgY29uZmlnLmJlZHJvY2tNb2RlbElkKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIiwgZGVwbG95bWVudEVudik7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25TdGFja05hbWVcIiwgYmFzZVZlcmlmaWNhdGlvblN0YWNrTmFtZSk7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BY2NvdW50SWRcIiwgdmVyaWZpY2F0aW9uQWNjb3VudElkKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImV4ZWN1dGlvbkFjY291bnRJZFwiLCBleGVjdXRpb25BY2NvdW50SWQpO1xuXG4gIGlmIChjb25maWcuc2xhY2tCb3RUb2tlbikge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIsIGNvbmZpZy5zbGFja0JvdFRva2VuKTtcbiAgfVxuICBpZiAoY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldCkge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIiwgY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldCk7XG4gIH1cbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiLCB2ZXJpZmljYXRpb25BZ2VudE5hbWUpO1xuICBpZiAoT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwKSB7XG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dChcImV4ZWN1dGlvbkFnZW50QXJuc1wiLCBleGVjdXRpb25BZ2VudEFybnMpO1xuICB9XG4gIGlmIChhdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDApIHtcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KFwiYXV0b1JlcGx5Q2hhbm5lbElkc1wiLCBhdXRvUmVwbHlDaGFubmVsSWRzKTtcbiAgfVxufVxuXG5zZXRDb250ZXh0RnJvbUNvbmZpZyhjb25maWcpO1xuXG4vKipcbiAqIEdldCBDREsgZW52aXJvbm1lbnQgY29uZmlndXJhdGlvblxuICovXG5mdW5jdGlvbiBnZXREZWZhdWx0RW52KHJlZ2lvbjogc3RyaW5nKTogY2RrLkVudmlyb25tZW50IHtcbiAgcmV0dXJuIHtcbiAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgIHJlZ2lvbjogcmVnaW9uLFxuICB9O1xufVxuXG5jb25zdCBkZWZhdWx0RW52ID0gZ2V0RGVmYXVsdEVudihyZWdpb24pO1xuXG5mdW5jdGlvbiBnZXRTdGFja0Vudmlyb25tZW50KFxuICBhY2NvdW50SWQ6IHN0cmluZyxcbiAgcmVnaW9uOiBzdHJpbmcsXG4gIGRlZmF1bHRFbnY6IGNkay5FbnZpcm9ubWVudCxcbik6IGNkay5FbnZpcm9ubWVudCB7XG4gIHJldHVybiBhY2NvdW50SWQgPyB7IGFjY291bnQ6IGFjY291bnRJZCwgcmVnaW9uOiByZWdpb24gfSA6IGRlZmF1bHRFbnY7XG59XG5cbmNvbnN0IHZlcmlmaWNhdGlvbkVudiA9IGdldFN0YWNrRW52aXJvbm1lbnQoXG4gIHZlcmlmaWNhdGlvbkFjY291bnRJZCxcbiAgcmVnaW9uLFxuICBkZWZhdWx0RW52LFxuKTtcblxuY29uc3QgYmVkcm9ja01vZGVsSWQgPSBnZXRDb25maWdTdHJpbmcoXG4gIFwiYmVkcm9ja01vZGVsSWRcIixcbiAgXCJqcC5hbnRocm9waWMuY2xhdWRlLXNvbm5ldC00LTUtMjAyNTA5MjktdjE6MFwiLFxuKTtcblxuLy8gU2xhY2sgU2VhcmNoIEFnZW50IEFSTiAob3B0aW9uYWw7IHNldCBhZnRlciBkZXBsb3lpbmcgc2xhY2stc2VhcmNoLWFnZW50IHN0YWNrKVxuY29uc3Qgc2xhY2tTZWFyY2hBZ2VudEFybiA9XG4gIHByb2Nlc3MuZW52LlNMQUNLX1NFQVJDSF9BR0VOVF9BUk4/LnRyaW0oKSB8fFxuICBnZXRDb25maWdTdHJpbmcoXCJzbGFja1NlYXJjaEFnZW50QXJuXCIpIHx8XG4gIHVuZGVmaW5lZDtcbmlmIChzbGFja1NlYXJjaEFnZW50QXJuKSB7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja1NlYXJjaEFnZW50QXJuXCIsIHNsYWNrU2VhcmNoQWdlbnRBcm4pO1xufVxuXG4vLyBBcmNoaXZlIGFjY291bnQgSUQgZm9yIGNyb3NzLWFjY291bnQgUzMgcmVwbGljYXRpb24gKG9wdGlvbmFsOyBzYW1lLWFjY291bnQgaWYgYWJzZW50KVxuY29uc3QgYXJjaGl2ZUFjY291bnRJZCA9XG4gIHByb2Nlc3MuZW52LkFSQ0hJVkVfQUNDT1VOVF9JRD8udHJpbSgpIHx8XG4gIGdldENvbmZpZ1N0cmluZyhcImFyY2hpdmVBY2NvdW50SWRcIikgfHxcbiAgdW5kZWZpbmVkO1xuXG4vLyBDcmVhdGUgVmVyaWZpY2F0aW9uIFN0YWNrXG5uZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwLCB2ZXJpZmljYXRpb25TdGFja05hbWUsIHtcbiAgZW52OiB2ZXJpZmljYXRpb25FbnYsXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogZXhlY3V0aW9uQWNjb3VudElkIHx8IHVuZGVmaW5lZCxcbiAgdmVyaWZpY2F0aW9uQWdlbnROYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUgfHwgdW5kZWZpbmVkLFxuICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwID8gZXhlY3V0aW9uQWdlbnRBcm5zIDogdW5kZWZpbmVkLFxuICBiZWRyb2NrTW9kZWxJZDogYmVkcm9ja01vZGVsSWQgfHwgdW5kZWZpbmVkLFxuICBhdXRvUmVwbHlDaGFubmVsSWRzOiBhdXRvUmVwbHlDaGFubmVsSWRzLmxlbmd0aCA+IDAgPyBhdXRvUmVwbHlDaGFubmVsSWRzIDogdW5kZWZpbmVkLFxuICBtZW50aW9uQ2hhbm5lbElkczogbWVudGlvbkNoYW5uZWxJZHMubGVuZ3RoID4gMCA/IG1lbnRpb25DaGFubmVsSWRzIDogdW5kZWZpbmVkLFxuICBzbGFja1NlYXJjaEFnZW50QXJuOiBzbGFja1NlYXJjaEFnZW50QXJuIHx8IHVuZGVmaW5lZCxcbiAgYXJjaGl2ZUFjY291bnRJZDogYXJjaGl2ZUFjY291bnRJZCB8fCB1bmRlZmluZWQsXG59KTtcbmxvZ0luZm8oXCJWZXJpZmljYXRpb24gc3RhY2sgY3JlYXRlZC5cIiwge1xuICBwaGFzZTogXCJzdGFja1wiLFxuICBjb250ZXh0OiB7IHN0YWNrTmFtZTogdmVyaWZpY2F0aW9uU3RhY2tOYW1lIH0sXG59KTtcblxuYXBwbHlOYWdQYWNrcyhhcHApO1xuLy8gRW1pdCBjbG91ZCBhc3NlbWJseVxuYXBwLnN5bnRoKCk7XG4iXX0=