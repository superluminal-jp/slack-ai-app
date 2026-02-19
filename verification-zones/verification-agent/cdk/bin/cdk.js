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
 * FILE_CREATOR_AGENT_ARN, DOCS_AGENT_ARN, TIME_AGENT_ARN (or combined EXECUTION_AGENT_ARNS JSON).
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
const log_retention_aspect_1 = require("../lib/aspects/log-retention-aspect");
const cost_allocation_tags_1 = require("../lib/utils/cost-allocation-tags");
const cdk_logger_1 = require("../lib/utils/cdk-logger");
const cdk_error_1 = require("../lib/utils/cdk-error");
// Constants
const VALID_ENVIRONMENTS = ["dev", "prod"];
const DEFAULT_ENVIRONMENT = "dev";
const DEFAULT_REGION = "ap-northeast-1";
// Outdir for cloud assembly (CLI sets CDK_OUTDIR; else default cdk.out)
const outdir = process.env.CDK_OUTDIR ||
    path.join(path.dirname(__dirname), "cdk.out");
const app = new cdk.App({ outdir });
(0, cdk_logger_1.logInfo)("Verification Zone CDK app starting", { phase: "config" });
// Apply synthesis-time validation aspects
aws_cdk_lib_1.Aspects.of(app).add(new log_retention_aspect_1.LogRetentionAspect());
aws_cdk_lib_1.Aspects.of(app).add(new cost_allocation_tags_1.CostAllocationTagAspect());
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
        cdk_error_1.CdkError.throw({
            message: `Invalid deployment environment '${deploymentEnvRaw}'. Must be one of: ${VALID_ENVIRONMENTS.join(", ")}.`,
            cause: "Invalid deployment environment",
            remediation: `Set DEPLOYMENT_ENV or use --context deploymentEnv to one of: ${VALID_ENVIRONMENTS.join(", ")}`,
            source: "app",
        });
    }
    if (!process.env.DEPLOYMENT_ENV && !app.node.tryGetContext("deploymentEnv")) {
        (0, cdk_logger_1.logWarn)(`DEPLOYMENT_ENV not set. Defaulting to '${DEFAULT_ENVIRONMENT}' environment.`, {
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
        (0, cdk_logger_1.logWarn)("Configuration file load failed; falling back to context or defaults.", {
            phase: "config",
            context: { step: "config load" },
        });
        return null;
    }
}
const config = loadConfiguration(deploymentEnv);
(0, cdk_logger_1.logInfo)(config
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
const bedrockModelId = getConfigString("bedrockModelId", "amazon.nova-pro-v1:0");
// Create Verification Stack
new verification_stack_1.VerificationStack(app, verificationStackName, {
    env: verificationEnv,
    executionAccountId: executionAccountId || undefined,
    verificationAgentName: verificationAgentName || undefined,
    executionAgentArns: Object.keys(executionAgentArns).length > 0
        ? executionAgentArns
        : undefined,
    bedrockModelId: bedrockModelId || undefined,
});
(0, cdk_logger_1.logInfo)("Verification stack created.", { phase: "stack", context: { stackName: verificationStackName } });
// Emit cloud assembly
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7OztHQWtCRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMsNkNBQXNDO0FBQ3RDLDJDQUE2QjtBQUM3QixrRUFBOEQ7QUFDOUQsd0RBSWlDO0FBQ2pDLDhFQUF5RTtBQUN6RSw0RUFBNEU7QUFDNUUsd0RBQTJEO0FBQzNELHNEQUFrRDtBQUVsRCxZQUFZO0FBQ1osTUFBTSxrQkFBa0IsR0FBRyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQVUsQ0FBQztBQUNwRCxNQUFNLG1CQUFtQixHQUFHLEtBQUssQ0FBQztBQUNsQyxNQUFNLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQUl4Qyx3RUFBd0U7QUFDeEUsTUFBTSxNQUFNLEdBQ1YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVO0lBQ3RCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNoRCxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUEsb0JBQU8sRUFBQyxvQ0FBb0MsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBRW5FLDBDQUEwQztBQUMxQyxxQkFBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSx5Q0FBa0IsRUFBRSxDQUFDLENBQUM7QUFDOUMscUJBQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUksOENBQXVCLEVBQUUsQ0FBQyxDQUFDO0FBRW5EOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLHdCQUF3QjtJQUMvQixNQUFNLGdCQUFnQixHQUNw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LElBQUksU0FBUztJQUN6RCxrQkFBa0IsRUFDaEIsTUFBTSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLE1BQU0sR0FBRyxDQUFDO1FBQ3hDLENBQUMsQ0FBQyxrQkFBa0I7UUFDcEIsQ0FBQyxDQUFDLFNBQVM7SUFDZixjQUFjLEVBQUUsY0FBYyxJQUFJLFNBQVM7Q0FDNUMsQ0FBQyxDQUFDO0FBQ0gsSUFBQSxvQkFBTyxFQUFDLDZCQUE2QixFQUFFLEVBQUUsS0FBSyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsRUFBRSxTQUFTLEVBQUUscUJBQXFCLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFFMUcsc0JBQXNCO0FBQ3RCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogVmVyaWZpY2F0aW9uIFpvbmUgQ0RLIEFwcGxpY2F0aW9uIEVudHJ5IFBvaW50XG4gKlxuICogVGhpcyBmaWxlIGRlZmluZXMgdGhlIHN0YW5kYWxvbmUgQ0RLIGFwcGxpY2F0aW9uIGZvciB0aGUgVmVyaWZpY2F0aW9uIFpvbmUuXG4gKiBJdCBpbnN0YW50aWF0ZXMgb25seSB0aGUgVmVyaWZpY2F0aW9uU3RhY2s7IGV4ZWN1dGlvbiBzdGFja3MgbGl2ZSBpbiBhIHNlcGFyYXRlIENESyBhcHAuXG4gKlxuICogQ29uZmlndXJhdGlvbiBwcmlvcml0eSAoaGlnaGVzdCBmaXJzdCk6ICgxKSBFbnZpcm9ubWVudCB2YXJpYWJsZXMgKGUuZy4gREVQTE9ZTUVOVF9FTlYsIFNMQUNLX0JPVF9UT0tFTiksXG4gKiAoMikgQ29tbWFuZC1saW5lIGNvbnRleHQgKC0tY29udGV4dCBrZXk9dmFsdWUpLCAoMykgRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlnIGZpbGUgKGNkay5jb25maWcue2Vudn0uanNvbiksXG4gKiAoNCkgRGVmYXVsdHMgaW4gY29kZS4gU2VlIGdldENvbmZpZ1ZhbHVlIC8gZ2V0Q29uZmlnU3RyaW5nIGFuZCBsb2FkQ29uZmlndXJhdGlvbi5cbiAqXG4gKiBFeGVjdXRpb24gYWdlbnQgQVJOcyBhcmUgc3VwcGxpZWQgdmlhIGNvbmZpZyBmaWxlIChleGVjdXRpb25BZ2VudEFybnMpIG9yIGluZGl2aWR1YWwgZW52IHZhcnM6XG4gKiBGSUxFX0NSRUFUT1JfQUdFTlRfQVJOLCBET0NTX0FHRU5UX0FSTiwgVElNRV9BR0VOVF9BUk4gKG9yIGNvbWJpbmVkIEVYRUNVVElPTl9BR0VOVF9BUk5TIEpTT04pLlxuICpcbiAqIERlcGxveSBvcmRlcjogMSkgRGVwbG95IGV4ZWN1dGlvbiBDREsgYXBwIChleGVjdXRpb24tem9uZXMvKSB0byBnZXQgcnVudGltZSBBUk5zLFxuICogICAgICAgICAgICAgICAyKSBTZXQgZXhlY3V0aW9uQWdlbnRBcm5zIGluIGNkay5jb25maWcue2Vudn0uanNvbiAob3IgZW52IHZhcnMpLFxuICogICAgICAgICAgICAgICAzKSBEZXBsb3kgdGhpcyBhcHA6IG5weCBjZGsgZGVwbG95XG4gKlxuICogQG1vZHVsZSB2ZXJpZmljYXRpb24tem9uZXMvdmVyaWZpY2F0aW9uLWFnZW50L2Nkay9iaW4vY2RrXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0IHsgQXNwZWN0cyB9IGZyb20gXCJhd3MtY2RrLWxpYlwiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHsgVmVyaWZpY2F0aW9uU3RhY2sgfSBmcm9tIFwiLi4vbGliL3ZlcmlmaWNhdGlvbi1zdGFja1wiO1xuaW1wb3J0IHtcbiAgbG9hZENka0NvbmZpZyxcbiAgYXBwbHlFbnZPdmVycmlkZXMsXG4gIENka0NvbmZpZyxcbn0gZnJvbSBcIi4uL2xpYi90eXBlcy9jZGstY29uZmlnXCI7XG5pbXBvcnQgeyBMb2dSZXRlbnRpb25Bc3BlY3QgfSBmcm9tIFwiLi4vbGliL2FzcGVjdHMvbG9nLXJldGVudGlvbi1hc3BlY3RcIjtcbmltcG9ydCB7IENvc3RBbGxvY2F0aW9uVGFnQXNwZWN0IH0gZnJvbSBcIi4uL2xpYi91dGlscy9jb3N0LWFsbG9jYXRpb24tdGFnc1wiO1xuaW1wb3J0IHsgbG9nSW5mbywgbG9nV2FybiB9IGZyb20gXCIuLi9saWIvdXRpbHMvY2RrLWxvZ2dlclwiO1xuaW1wb3J0IHsgQ2RrRXJyb3IgfSBmcm9tIFwiLi4vbGliL3V0aWxzL2Nkay1lcnJvclwiO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IFZBTElEX0VOVklST05NRU5UUyA9IFtcImRldlwiLCBcInByb2RcIl0gYXMgY29uc3Q7XG5jb25zdCBERUZBVUxUX0VOVklST05NRU5UID0gXCJkZXZcIjtcbmNvbnN0IERFRkFVTFRfUkVHSU9OID0gXCJhcC1ub3J0aGVhc3QtMVwiO1xuXG50eXBlIERlcGxveW1lbnRFbnZpcm9ubWVudCA9ICh0eXBlb2YgVkFMSURfRU5WSVJPTk1FTlRTKVtudW1iZXJdO1xuXG4vLyBPdXRkaXIgZm9yIGNsb3VkIGFzc2VtYmx5IChDTEkgc2V0cyBDREtfT1VURElSOyBlbHNlIGRlZmF1bHQgY2RrLm91dClcbmNvbnN0IG91dGRpciA9XG4gIHByb2Nlc3MuZW52LkNES19PVVRESVIgfHxcbiAgcGF0aC5qb2luKHBhdGguZGlybmFtZShfX2Rpcm5hbWUpLCBcImNkay5vdXRcIik7XG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7IG91dGRpciB9KTtcblxubG9nSW5mbyhcIlZlcmlmaWNhdGlvbiBab25lIENESyBhcHAgc3RhcnRpbmdcIiwgeyBwaGFzZTogXCJjb25maWdcIiB9KTtcblxuLy8gQXBwbHkgc3ludGhlc2lzLXRpbWUgdmFsaWRhdGlvbiBhc3BlY3RzXG5Bc3BlY3RzLm9mKGFwcCkuYWRkKG5ldyBMb2dSZXRlbnRpb25Bc3BlY3QoKSk7XG5Bc3BlY3RzLm9mKGFwcCkuYWRkKG5ldyBDb3N0QWxsb2NhdGlvblRhZ0FzcGVjdCgpKTtcblxuLyoqXG4gKiBHZXQgYW5kIHZhbGlkYXRlIGRlcGxveW1lbnQgZW52aXJvbm1lbnQuXG4gKlxuICogUHJpb3JpdHk6IDEuIERFUExPWU1FTlRfRU5WIGVudmlyb25tZW50IHZhcmlhYmxlLCAyLiBjZGsuanNvbiBjb250ZXh0LCAzLiBkZWZhdWx0XG4gKlxuICogQHJldHVybnMgVmFsaWRhdGVkIGRlcGxveW1lbnQgZW52aXJvbm1lbnRcbiAqIEB0aHJvd3Mge0Nka0Vycm9yfSBJZiBkZXBsb3ltZW50IGVudmlyb25tZW50IGlzIGludmFsaWRcbiAqL1xuZnVuY3Rpb24gZ2V0RGVwbG95bWVudEVudmlyb25tZW50KCk6IERlcGxveW1lbnRFbnZpcm9ubWVudCB7XG4gIGNvbnN0IGRlcGxveW1lbnRFbnZSYXcgPVxuICAgIHByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WIHx8XG4gICAgYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIikgfHxcbiAgICBERUZBVUxUX0VOVklST05NRU5UO1xuXG4gIGNvbnN0IGRlcGxveW1lbnRFbnYgPSBkZXBsb3ltZW50RW52UmF3XG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAudHJpbSgpIGFzIERlcGxveW1lbnRFbnZpcm9ubWVudDtcblxuICBpZiAoIVZBTElEX0VOVklST05NRU5UUy5pbmNsdWRlcyhkZXBsb3ltZW50RW52KSkge1xuICAgIENka0Vycm9yLnRocm93KHtcbiAgICAgIG1lc3NhZ2U6IGBJbnZhbGlkIGRlcGxveW1lbnQgZW52aXJvbm1lbnQgJyR7ZGVwbG95bWVudEVudlJhd30nLiBNdXN0IGJlIG9uZSBvZjogJHtWQUxJRF9FTlZJUk9OTUVOVFMuam9pbihcIiwgXCIpfS5gLFxuICAgICAgY2F1c2U6IFwiSW52YWxpZCBkZXBsb3ltZW50IGVudmlyb25tZW50XCIsXG4gICAgICByZW1lZGlhdGlvbjogYFNldCBERVBMT1lNRU5UX0VOViBvciB1c2UgLS1jb250ZXh0IGRlcGxveW1lbnRFbnYgdG8gb25lIG9mOiAke1ZBTElEX0VOVklST05NRU5UUy5qb2luKFwiLCBcIil9YCxcbiAgICAgIHNvdXJjZTogXCJhcHBcIixcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgJiYgIWFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpKSB7XG4gICAgbG9nV2FybihgREVQTE9ZTUVOVF9FTlYgbm90IHNldC4gRGVmYXVsdGluZyB0byAnJHtERUZBVUxUX0VOVklST05NRU5UfScgZW52aXJvbm1lbnQuYCwge1xuICAgICAgcGhhc2U6IFwiY29uZmlnXCIsXG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gZGVwbG95bWVudEVudjtcbn1cblxuY29uc3QgZGVwbG95bWVudEVudiA9IGdldERlcGxveW1lbnRFbnZpcm9ubWVudCgpO1xuXG4vKipcbiAqIExvYWQgY29uZmlndXJhdGlvbiBmcm9tIGZpbGVzIHdpdGggZmFsbGJhY2sgdG8gY29udGV4dC9kZWZhdWx0c1xuICpcbiAqIEBwYXJhbSBlbnYgLSBEZXBsb3ltZW50IGVudmlyb25tZW50XG4gKiBAcmV0dXJucyBDb25maWd1cmF0aW9uIG9iamVjdCBvciBudWxsIGlmIGxvYWRpbmcgZmFpbGVkXG4gKi9cbmZ1bmN0aW9uIGxvYWRDb25maWd1cmF0aW9uKGVudjogRGVwbG95bWVudEVudmlyb25tZW50KTogQ2RrQ29uZmlnIHwgbnVsbCB7XG4gIHRyeSB7XG4gICAgY29uc3QgY2RrRGlyID0gcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuLlwiKTtcbiAgICBjb25zdCBmaWxlQ29uZmlnID0gbG9hZENka0NvbmZpZyhlbnYsIGNka0Rpcik7XG4gICAgcmV0dXJuIGFwcGx5RW52T3ZlcnJpZGVzKGZpbGVDb25maWcpO1xuICB9IGNhdGNoIHtcbiAgICBsb2dXYXJuKFwiQ29uZmlndXJhdGlvbiBmaWxlIGxvYWQgZmFpbGVkOyBmYWxsaW5nIGJhY2sgdG8gY29udGV4dCBvciBkZWZhdWx0cy5cIiwge1xuICAgICAgcGhhc2U6IFwiY29uZmlnXCIsXG4gICAgICBjb250ZXh0OiB7IHN0ZXA6IFwiY29uZmlnIGxvYWRcIiB9LFxuICAgIH0pO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmNvbnN0IGNvbmZpZyA9IGxvYWRDb25maWd1cmF0aW9uKGRlcGxveW1lbnRFbnYpO1xuXG5sb2dJbmZvKFxuICBjb25maWdcbiAgICA/IFwiQ29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBmaWxlIG9yIGVudiBvdmVycmlkZXMuXCJcbiAgICA6IFwiVXNpbmcgY29udGV4dCBvciBkZWZhdWx0cyAobm8gY29uZmlnIGZpbGUpLlwiLFxuICB7IHBoYXNlOiBcImNvbmZpZ1wiLCBjb250ZXh0OiB7IGRlcGxveW1lbnRFbnYgfSB9XG4pO1xuXG4vKipcbiAqIEdldCBjb25maWd1cmF0aW9uIHZhbHVlIHdpdGggcHJpb3JpdHk6IGNvbnRleHQgPiBjb25maWcgZmlsZSA+IGRlZmF1bHRcbiAqL1xuZnVuY3Rpb24gZ2V0Q29uZmlnVmFsdWU8VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCk6IFQge1xuICBjb25zdCBjb250ZXh0VmFsdWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KGtleSk7XG4gIGlmIChjb250ZXh0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBjb250ZXh0VmFsdWUgYXMgVDtcbiAgfVxuICBpZiAoY29uZmlnICYmIGtleSBpbiBjb25maWcpIHtcbiAgICByZXR1cm4gKGNvbmZpZyBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrZXldIGFzIFQ7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbn1cblxuLyoqXG4gKiBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZSBhcyBzdHJpbmcgd2l0aCBlbXB0eSBzdHJpbmcgaGFuZGxpbmdcbiAqL1xuZnVuY3Rpb24gZ2V0Q29uZmlnU3RyaW5nKGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWUgPSBcIlwiKTogc3RyaW5nIHtcbiAgY29uc3QgdmFsdWUgPSBnZXRDb25maWdWYWx1ZTxzdHJpbmc+KGtleSwgZGVmYXVsdFZhbHVlKTtcbiAgcmV0dXJuIHZhbHVlIHx8IFwiXCI7XG59XG5cbi8qKlxuICogR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWUgYXMgb2JqZWN0LlxuICovXG5mdW5jdGlvbiBnZXRDb25maWdPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCk6IFQge1xuICBjb25zdCB2YWx1ZSA9IGdldENvbmZpZ1ZhbHVlPFQ+KGtleSwgZGVmYXVsdFZhbHVlKTtcbiAgcmV0dXJuIHZhbHVlIHx8IGRlZmF1bHRWYWx1ZTtcbn1cblxuLy8gR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG5jb25zdCByZWdpb24gPSBnZXRDb25maWdWYWx1ZShcImF3c1JlZ2lvblwiLCBERUZBVUxUX1JFR0lPTik7XG5cbi8vIFN0YWNrIG5hbWUgKHdpdGhvdXQgZW52aXJvbm1lbnQgc3VmZml4KVxuY29uc3QgYmFzZVZlcmlmaWNhdGlvblN0YWNrTmFtZSA9IGdldENvbmZpZ1ZhbHVlKFxuICBcInZlcmlmaWNhdGlvblN0YWNrTmFtZVwiLFxuICBcIlNsYWNrQUktVmVyaWZpY2F0aW9uXCJcbik7XG5cbi8vIEFkZCBlbnZpcm9ubWVudCBzdWZmaXhcbmNvbnN0IGVudmlyb25tZW50U3VmZml4ID0gZGVwbG95bWVudEVudiA9PT0gXCJwcm9kXCIgPyBcIlByb2RcIiA6IFwiRGV2XCI7XG5jb25zdCB2ZXJpZmljYXRpb25TdGFja05hbWUgPSBgJHtiYXNlVmVyaWZpY2F0aW9uU3RhY2tOYW1lfS0ke2Vudmlyb25tZW50U3VmZml4fWA7XG5cbi8vIENyb3NzLWFjY291bnQgY29uZmlndXJhdGlvblxuY29uc3QgdmVyaWZpY2F0aW9uQWNjb3VudElkID0gZ2V0Q29uZmlnU3RyaW5nKFwidmVyaWZpY2F0aW9uQWNjb3VudElkXCIpO1xuY29uc3QgZXhlY3V0aW9uQWNjb3VudElkID0gZ2V0Q29uZmlnU3RyaW5nKFwiZXhlY3V0aW9uQWNjb3VudElkXCIpO1xuXG4vLyBBZ2VudENvcmUgY29uZmlndXJhdGlvblxuY29uc3QgdmVyaWZpY2F0aW9uQWdlbnROYW1lID0gZ2V0Q29uZmlnU3RyaW5nKFxuICBcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiLFxuICBgU2xhY2tBSV9WZXJpZmljYXRpb25BZ2VudF8ke2Vudmlyb25tZW50U3VmZml4fWBcbik7XG5cbi8vIEV4ZWN1dGlvbiBhZ2VudCBBUk5zIChmcm9tIGNvbnRleHQsIGVudiB2YXJzLCBvciBjb25maWcgZmlsZSkuXG4vLyBDREsgLS1jb250ZXh0IGFsd2F5cyBwYXNzZXMgc3RyaW5nczsgSlNPTi1wYXJzZSB3aGVuIG5lZWRlZC5cbmNvbnN0IGV4ZWN1dGlvbkFnZW50QXJuczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9ICgoKSA9PiB7XG4gIGNvbnN0IGN0eFJhdyA9IGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIik7XG4gIGlmIChjdHhSYXcgIT09IHVuZGVmaW5lZCkge1xuICAgIGlmICh0eXBlb2YgY3R4UmF3ID09PSBcInN0cmluZ1wiKSB7XG4gICAgICB0cnkge1xuICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShjdHhSYXcpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgcmV0dXJuIHt9O1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAodHlwZW9mIGN0eFJhdyA9PT0gXCJvYmplY3RcIiAmJiBjdHhSYXcgIT09IG51bGwpIHtcbiAgICAgIHJldHVybiBjdHhSYXcgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvbmZpZz8uZXhlY3V0aW9uQWdlbnRBcm5zID8/IHt9O1xufSkoKTtcblxuLyoqXG4gKiBTZXQgbG9hZGVkIGNvbmZpZyB2YWx1ZXMgdG8gQ0RLIGNvbnRleHQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbiAqL1xuZnVuY3Rpb24gc2V0Q29udGV4dEZyb21Db25maWcoY29uZmlnOiBDZGtDb25maWcgfCBudWxsKTogdm9pZCB7XG4gIGlmICghY29uZmlnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImF3c1JlZ2lvblwiLCByZWdpb24pO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwiYmVkcm9ja01vZGVsSWRcIiwgY29uZmlnLmJlZHJvY2tNb2RlbElkKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIiwgZGVwbG95bWVudEVudik7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25TdGFja05hbWVcIiwgYmFzZVZlcmlmaWNhdGlvblN0YWNrTmFtZSk7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BY2NvdW50SWRcIiwgdmVyaWZpY2F0aW9uQWNjb3VudElkKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImV4ZWN1dGlvbkFjY291bnRJZFwiLCBleGVjdXRpb25BY2NvdW50SWQpO1xuXG4gIGlmIChjb25maWcuc2xhY2tCb3RUb2tlbikge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja0JvdFRva2VuXCIsIGNvbmZpZy5zbGFja0JvdFRva2VuKTtcbiAgfVxuICBpZiAoY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldCkge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJzbGFja1NpZ25pbmdTZWNyZXRcIiwgY29uZmlnLnNsYWNrU2lnbmluZ1NlY3JldCk7XG4gIH1cbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcInZlcmlmaWNhdGlvbkFnZW50TmFtZVwiLCB2ZXJpZmljYXRpb25BZ2VudE5hbWUpO1xuICBpZiAoT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwKSB7XG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dChcImV4ZWN1dGlvbkFnZW50QXJuc1wiLCBleGVjdXRpb25BZ2VudEFybnMpO1xuICB9XG59XG5cbnNldENvbnRleHRGcm9tQ29uZmlnKGNvbmZpZyk7XG5cbi8qKlxuICogR2V0IENESyBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gKi9cbmZ1bmN0aW9uIGdldERlZmF1bHRFbnYocmVnaW9uOiBzdHJpbmcpOiBjZGsuRW52aXJvbm1lbnQge1xuICByZXR1cm4ge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiByZWdpb24sXG4gIH07XG59XG5cbmNvbnN0IGRlZmF1bHRFbnYgPSBnZXREZWZhdWx0RW52KHJlZ2lvbik7XG5cbmZ1bmN0aW9uIGdldFN0YWNrRW52aXJvbm1lbnQoXG4gIGFjY291bnRJZDogc3RyaW5nLFxuICByZWdpb246IHN0cmluZyxcbiAgZGVmYXVsdEVudjogY2RrLkVudmlyb25tZW50XG4pOiBjZGsuRW52aXJvbm1lbnQge1xuICByZXR1cm4gYWNjb3VudElkID8geyBhY2NvdW50OiBhY2NvdW50SWQsIHJlZ2lvbjogcmVnaW9uIH0gOiBkZWZhdWx0RW52O1xufVxuXG5jb25zdCB2ZXJpZmljYXRpb25FbnYgPSBnZXRTdGFja0Vudmlyb25tZW50KFxuICB2ZXJpZmljYXRpb25BY2NvdW50SWQsXG4gIHJlZ2lvbixcbiAgZGVmYXVsdEVudlxuKTtcblxuY29uc3QgYmVkcm9ja01vZGVsSWQgPSBnZXRDb25maWdTdHJpbmcoXCJiZWRyb2NrTW9kZWxJZFwiLCBcImFtYXpvbi5ub3ZhLXByby12MTowXCIpO1xuXG4vLyBDcmVhdGUgVmVyaWZpY2F0aW9uIFN0YWNrXG5uZXcgVmVyaWZpY2F0aW9uU3RhY2soYXBwLCB2ZXJpZmljYXRpb25TdGFja05hbWUsIHtcbiAgZW52OiB2ZXJpZmljYXRpb25FbnYsXG4gIGV4ZWN1dGlvbkFjY291bnRJZDogZXhlY3V0aW9uQWNjb3VudElkIHx8IHVuZGVmaW5lZCxcbiAgdmVyaWZpY2F0aW9uQWdlbnROYW1lOiB2ZXJpZmljYXRpb25BZ2VudE5hbWUgfHwgdW5kZWZpbmVkLFxuICBleGVjdXRpb25BZ2VudEFybnM6XG4gICAgT2JqZWN0LmtleXMoZXhlY3V0aW9uQWdlbnRBcm5zKS5sZW5ndGggPiAwXG4gICAgICA/IGV4ZWN1dGlvbkFnZW50QXJuc1xuICAgICAgOiB1bmRlZmluZWQsXG4gIGJlZHJvY2tNb2RlbElkOiBiZWRyb2NrTW9kZWxJZCB8fCB1bmRlZmluZWQsXG59KTtcbmxvZ0luZm8oXCJWZXJpZmljYXRpb24gc3RhY2sgY3JlYXRlZC5cIiwgeyBwaGFzZTogXCJzdGFja1wiLCBjb250ZXh0OiB7IHN0YWNrTmFtZTogdmVyaWZpY2F0aW9uU3RhY2tOYW1lIH0gfSk7XG5cbi8vIEVtaXQgY2xvdWQgYXNzZW1ibHlcbmFwcC5zeW50aCgpO1xuIl19