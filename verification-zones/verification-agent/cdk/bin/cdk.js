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
(0, cdk_tooling_1.applyNagPacks)(app);
// Emit cloud assembly
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLDZDQUFzQztBQUN0QywyQ0FBNkI7QUFDN0Isa0VBQThEO0FBQzlELHdEQUlpQztBQUNqQywyREFPbUM7QUFFbkMsWUFBWTtBQUNaLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFVLENBQUM7QUFDcEQsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7QUFDbEMsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFJeEMsd0VBQXdFO0FBQ3hFLE1BQU0sTUFBTSxHQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMxRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUEscUJBQU8sRUFBQyxvQ0FBb0MsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBRW5FLDBDQUEwQztBQUMxQyxxQkFBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQ0FBa0IsRUFBRSxDQUFDLENBQUM7QUFDOUMscUJBQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUkscUNBQXVCLEVBQUUsQ0FBQyxDQUFDO0FBRW5EOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLHdCQUF3QjtJQUMvQixNQUFNLGdCQUFnQixHQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7UUFDMUIsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDO1FBQ3ZDLG1CQUFtQixDQUFDO0lBRXRCLE1BQU0sYUFBYSxHQUFHLGdCQUFnQjtTQUNuQyxXQUFXLEVBQUU7U0FDYixJQUFJLEVBQTJCLENBQUM7SUFFbkMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ2hELHNCQUFRLENBQUMsS0FBSyxDQUFDO1lBQ2IsT0FBTyxFQUFFLG1DQUFtQyxnQkFBZ0Isc0JBQXNCLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRztZQUNsSCxLQUFLLEVBQUUsZ0NBQWdDO1lBQ3ZDLFdBQVcsRUFBRSxnRUFBZ0Usa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzVHLE1BQU0sRUFBRSxLQUFLO1NBQ2QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDNUUsSUFBQSxxQkFBTyxFQUNMLDBDQUEwQyxtQkFBbUIsZ0JBQWdCLEVBQzdFO1lBQ0UsS0FBSyxFQUFFLFFBQVE7U0FDaEIsQ0FDRixDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sYUFBYSxDQUFDO0FBQ3ZCLENBQUM7QUFFRCxNQUFNLGFBQWEsR0FBRyx3QkFBd0IsRUFBRSxDQUFDO0FBRWpEOzs7OztHQUtHO0FBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxHQUEwQjtJQUNuRCxJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLFVBQVUsR0FBRyxJQUFBLDBCQUFhLEVBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzlDLE9BQU8sSUFBQSw4QkFBaUIsRUFBQyxVQUFVLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsSUFBQSxxQkFBTyxFQUNMLHNFQUFzRSxFQUN0RTtZQUNFLEtBQUssRUFBRSxRQUFRO1lBQ2YsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRTtTQUNqQyxDQUNGLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFFaEQsSUFBQSxxQkFBTyxFQUNMLE1BQU07SUFDSixDQUFDLENBQUMsa0RBQWtEO0lBQ3BELENBQUMsQ0FBQyw2Q0FBNkMsRUFDakQsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxFQUFFLENBQ2hELENBQUM7QUFFRjs7R0FFRztBQUNILFNBQVMsY0FBYyxDQUFJLEdBQVcsRUFBRSxZQUFlO0lBQ3JELE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2pELElBQUksWUFBWSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQy9CLE9BQU8sWUFBaUIsQ0FBQztJQUMzQixDQUFDO0lBQ0QsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzVCLE9BQVEsTUFBNkMsQ0FBQyxHQUFHLENBQU0sQ0FBQztJQUNsRSxDQUFDO0lBQ0QsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxlQUFlLENBQUMsR0FBVyxFQUFFLFlBQVksR0FBRyxFQUFFO0lBQ3JELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBUyxHQUFHLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDeEQsT0FBTyxLQUFLLElBQUksRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsZUFBZSxDQUFtQixHQUFXLEVBQUUsWUFBZTtJQUNyRSxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUksR0FBRyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ25ELE9BQU8sS0FBSyxJQUFJLFlBQVksQ0FBQztBQUMvQixDQUFDO0FBRUQsMkJBQTJCO0FBQzNCLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFFM0QsMENBQTBDO0FBQzFDLE1BQU0seUJBQXlCLEdBQUcsY0FBYyxDQUM5Qyx1QkFBdUIsRUFDdkIsc0JBQXNCLENBQ3ZCLENBQUM7QUFFRix5QkFBeUI7QUFDekIsTUFBTSxpQkFBaUIsR0FBRyxhQUFhLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNwRSxNQUFNLHFCQUFxQixHQUFHLEdBQUcseUJBQXlCLElBQUksaUJBQWlCLEVBQUUsQ0FBQztBQUVsRiw4QkFBOEI7QUFDOUIsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUN2RSxNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRWpFLDBCQUEwQjtBQUMxQixNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FDM0MsdUJBQXVCLEVBQ3ZCLDZCQUE2QixpQkFBaUIsRUFBRSxDQUNqRCxDQUFDO0FBRUYsNkVBQTZFO0FBQzdFLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxNQUFlLEVBQUUsUUFBa0IsRUFBWSxFQUFFO0lBQzlFLElBQUksTUFBTSxLQUFLLFNBQVM7UUFBRSxPQUFPLFFBQVEsQ0FBQztJQUMxQyxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFZLENBQUM7WUFDN0MsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE9BQVEsTUFBb0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDMUUsQ0FBQztRQUNILENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUCxzQ0FBc0M7UUFDeEMsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUMxQixPQUFRLE1BQW9CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDLENBQUM7QUFFRixrRUFBa0U7QUFDbEUsMEVBQTBFO0FBQzFFLE1BQU0sbUJBQW1CLEdBQWEscUJBQXFCLENBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLEVBQzdDLE1BQU0sRUFBRSxtQkFBbUIsSUFBSSxFQUFFLENBQ2xDLENBQUM7QUFFRix1RUFBdUU7QUFDdkUseUVBQXlFO0FBQ3pFLHdFQUF3RTtBQUN4RSxNQUFNLGlCQUFpQixHQUFhLHFCQUFxQixDQUN2RCxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxFQUMzQyxNQUFNLEVBQUUsaUJBQWlCLElBQUksRUFBRSxDQUNoQyxDQUFDO0FBRUYsaUVBQWlFO0FBQ2pFLCtEQUErRDtBQUMvRCxNQUFNLGtCQUFrQixHQUEyQixDQUFDLEdBQUcsRUFBRTtJQUN2RCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBQzVELElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ3pCLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDO2dCQUNILE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQTJCLENBQUM7WUFDdEQsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxPQUFPLEVBQUUsQ0FBQztZQUNaLENBQUM7UUFDSCxDQUFDO1FBQ0QsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ2xELE9BQU8sTUFBZ0MsQ0FBQztRQUMxQyxDQUFDO0lBQ0gsQ0FBQztJQUNELE9BQU8sTUFBTSxFQUFFLGtCQUFrQixJQUFJLEVBQUUsQ0FBQztBQUMxQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBRUw7O0dBRUc7QUFDSCxTQUFTLG9CQUFvQixDQUFDLE1BQXdCO0lBQ3BELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNaLE9BQU87SUFDVCxDQUFDO0lBRUQsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUM3RCxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDcEQsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsdUJBQXVCLEVBQUUseUJBQXlCLENBQUMsQ0FBQztJQUN4RSxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0lBQ3BFLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLG9CQUFvQixFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFFOUQsSUFBSSxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBQ0QsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUM5QixHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBQ0QsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsdUJBQXVCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUNwRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDL0MsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBQ0QsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbkMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMscUJBQXFCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztJQUNsRSxDQUFDO0FBQ0gsQ0FBQztBQUVELG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRTdCOztHQUVHO0FBQ0gsU0FBUyxhQUFhLENBQUMsTUFBYztJQUNuQyxPQUFPO1FBQ0wsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxNQUFNO0tBQ2YsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFekMsU0FBUyxtQkFBbUIsQ0FDMUIsU0FBaUIsRUFDakIsTUFBYyxFQUNkLFVBQTJCO0lBRTNCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7QUFDekUsQ0FBQztBQUVELE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUN6QyxxQkFBcUIsRUFDckIsTUFBTSxFQUNOLFVBQVUsQ0FDWCxDQUFDO0FBRUYsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUNwQyxnQkFBZ0IsRUFDaEIsOENBQThDLENBQy9DLENBQUM7QUFFRixrRkFBa0Y7QUFDbEYsTUFBTSxtQkFBbUIsR0FDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLEVBQUU7SUFDMUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDO0lBQ3RDLFNBQVMsQ0FBQztBQUNaLElBQUksbUJBQW1CLEVBQUUsQ0FBQztJQUN4QixHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ2xFLENBQUM7QUFFRCx5RkFBeUY7QUFDekYsTUFBTSxnQkFBZ0IsR0FDcEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLEVBQUU7SUFDdEMsZUFBZSxDQUFDLGtCQUFrQixDQUFDO0lBQ25DLFNBQVMsQ0FBQztBQUVaLDRCQUE0QjtBQUM1QixJQUFJLHNDQUFpQixDQUFDLEdBQUcsRUFBRSxxQkFBcUIsRUFBRTtJQUNoRCxHQUFHLEVBQUUsZUFBZTtJQUNwQixrQkFBa0IsRUFBRSxrQkFBa0IsSUFBSSxTQUFTO0lBQ25ELHFCQUFxQixFQUFFLHFCQUFxQixJQUFJLFNBQVM7SUFDekQsa0JBQWtCLEVBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsU0FBUztJQUM3RSxjQUFjLEVBQUUsY0FBYyxJQUFJLFNBQVM7SUFDM0MsbUJBQW1CLEVBQUUsbUJBQW1CLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDLFNBQVM7SUFDckYsaUJBQWlCLEVBQUUsaUJBQWlCLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFNBQVM7SUFDL0UsbUJBQW1CLEVBQUUsbUJBQW1CLElBQUksU0FBUztJQUNyRCxnQkFBZ0IsRUFBRSxnQkFBZ0IsSUFBSSxTQUFTO0NBQ2hELENBQUMsQ0FBQztBQUNILElBQUEscUJBQU8sRUFBQyw2QkFBNkIsRUFBRTtJQUNyQyxLQUFLLEVBQUUsT0FBTztJQUNkLE9BQU8sRUFBRSxFQUFFLFNBQVMsRUFBRSxxQkFBcUIsRUFBRTtDQUM5QyxDQUFDLENBQUM7QUFFSCxJQUFBLDJCQUFhLEVBQUMsR0FBRyxDQUFDLENBQUM7QUFDbkIsc0JBQXNCO0FBQ3RCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbi8qKlxuICogVmVyaWZpY2F0aW9uIFpvbmUgQ0RLIEFwcGxpY2F0aW9uIEVudHJ5IFBvaW50XG4gKlxuICogVGhpcyBmaWxlIGRlZmluZXMgdGhlIHN0YW5kYWxvbmUgQ0RLIGFwcGxpY2F0aW9uIGZvciB0aGUgVmVyaWZpY2F0aW9uIFpvbmUuXG4gKiBJdCBpbnN0YW50aWF0ZXMgb25seSB0aGUgVmVyaWZpY2F0aW9uU3RhY2s7IGV4ZWN1dGlvbiBzdGFja3MgbGl2ZSBpbiBhIHNlcGFyYXRlIENESyBhcHAuXG4gKlxuICogQ29uZmlndXJhdGlvbiBwcmlvcml0eSAoaGlnaGVzdCBmaXJzdCk6ICgxKSBFbnZpcm9ubWVudCB2YXJpYWJsZXMgKGUuZy4gREVQTE9ZTUVOVF9FTlYsIFNMQUNLX0JPVF9UT0tFTiksXG4gKiAoMikgQ29tbWFuZC1saW5lIGNvbnRleHQgKC0tY29udGV4dCBrZXk9dmFsdWUpLCAoMykgRW52aXJvbm1lbnQtc3BlY2lmaWMgY29uZmlnIGZpbGUgKGNkay5jb25maWcue2Vudn0uanNvbiksXG4gKiAoNCkgRGVmYXVsdHMgaW4gY29kZS4gU2VlIGdldENvbmZpZ1ZhbHVlIC8gZ2V0Q29uZmlnU3RyaW5nIGFuZCBsb2FkQ29uZmlndXJhdGlvbi5cbiAqXG4gKiBFeGVjdXRpb24gYWdlbnQgQVJOcyBhcmUgc3VwcGxpZWQgdmlhIGNvbmZpZyBmaWxlIChleGVjdXRpb25BZ2VudEFybnMpIG9yIGluZGl2aWR1YWwgZW52IHZhcnM6XG4gKiBGSUxFX0NSRUFUT1JfQUdFTlRfQVJOLCBET0NTX0FHRU5UX0FSTiwgVElNRV9BR0VOVF9BUk4sIFdFQl9GRVRDSF9BR0VOVF9BUk5cbiAqIChvciBjb21iaW5lZCBFWEVDVVRJT05fQUdFTlRfQVJOUyBKU09OKS5cbiAqXG4gKiBEZXBsb3kgb3JkZXI6IDEpIERlcGxveSBleGVjdXRpb24gQ0RLIGFwcCAoZXhlY3V0aW9uLXpvbmVzLykgdG8gZ2V0IHJ1bnRpbWUgQVJOcyxcbiAqICAgICAgICAgICAgICAgMikgU2V0IGV4ZWN1dGlvbkFnZW50QXJucyBpbiBjZGsuY29uZmlnLntlbnZ9Lmpzb24gKG9yIGVudiB2YXJzKSxcbiAqICAgICAgICAgICAgICAgMykgRGVwbG95IHRoaXMgYXBwOiBucHggY2RrIGRlcGxveVxuICpcbiAqIEBtb2R1bGUgdmVyaWZpY2F0aW9uLXpvbmVzL3ZlcmlmaWNhdGlvbi1hZ2VudC9jZGsvYmluL2Nka1xuICovXG5cbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCB7IEFzcGVjdHMgfSBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIHBhdGggZnJvbSBcInBhdGhcIjtcbmltcG9ydCB7IFZlcmlmaWNhdGlvblN0YWNrIH0gZnJvbSBcIi4uL2xpYi92ZXJpZmljYXRpb24tc3RhY2tcIjtcbmltcG9ydCB7XG4gIGxvYWRDZGtDb25maWcsXG4gIGFwcGx5RW52T3ZlcnJpZGVzLFxuICBDZGtDb25maWcsXG59IGZyb20gXCIuLi9saWIvdHlwZXMvY2RrLWNvbmZpZ1wiO1xuaW1wb3J0IHtcbiAgTG9nUmV0ZW50aW9uQXNwZWN0LFxuICBDb3N0QWxsb2NhdGlvblRhZ0FzcGVjdCxcbiAgbG9nSW5mbyxcbiAgbG9nV2FybixcbiAgQ2RrRXJyb3IsXG4gIGFwcGx5TmFnUGFja3MsXG59IGZyb20gXCJAc2xhY2stYWktYXBwL2Nkay10b29saW5nXCI7XG5cbi8vIENvbnN0YW50c1xuY29uc3QgVkFMSURfRU5WSVJPTk1FTlRTID0gW1wiZGV2XCIsIFwicHJvZFwiXSBhcyBjb25zdDtcbmNvbnN0IERFRkFVTFRfRU5WSVJPTk1FTlQgPSBcImRldlwiO1xuY29uc3QgREVGQVVMVF9SRUdJT04gPSBcImFwLW5vcnRoZWFzdC0xXCI7XG5cbnR5cGUgRGVwbG95bWVudEVudmlyb25tZW50ID0gKHR5cGVvZiBWQUxJRF9FTlZJUk9OTUVOVFMpW251bWJlcl07XG5cbi8vIE91dGRpciBmb3IgY2xvdWQgYXNzZW1ibHkgKENMSSBzZXRzIENES19PVVRESVI7IGVsc2UgZGVmYXVsdCBjZGsub3V0KVxuY29uc3Qgb3V0ZGlyID1cbiAgcHJvY2Vzcy5lbnYuQ0RLX09VVERJUiB8fCBwYXRoLmpvaW4ocGF0aC5kaXJuYW1lKF9fZGlybmFtZSksIFwiY2RrLm91dFwiKTtcbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKHsgb3V0ZGlyIH0pO1xuXG5sb2dJbmZvKFwiVmVyaWZpY2F0aW9uIFpvbmUgQ0RLIGFwcCBzdGFydGluZ1wiLCB7IHBoYXNlOiBcImNvbmZpZ1wiIH0pO1xuXG4vLyBBcHBseSBzeW50aGVzaXMtdGltZSB2YWxpZGF0aW9uIGFzcGVjdHNcbkFzcGVjdHMub2YoYXBwKS5hZGQobmV3IExvZ1JldGVudGlvbkFzcGVjdCgpKTtcbkFzcGVjdHMub2YoYXBwKS5hZGQobmV3IENvc3RBbGxvY2F0aW9uVGFnQXNwZWN0KCkpO1xuXG4vKipcbiAqIEdldCBhbmQgdmFsaWRhdGUgZGVwbG95bWVudCBlbnZpcm9ubWVudC5cbiAqXG4gKiBQcmlvcml0eTogMS4gREVQTE9ZTUVOVF9FTlYgZW52aXJvbm1lbnQgdmFyaWFibGUsIDIuIGNkay5qc29uIGNvbnRleHQsIDMuIGRlZmF1bHRcbiAqXG4gKiBAcmV0dXJucyBWYWxpZGF0ZWQgZGVwbG95bWVudCBlbnZpcm9ubWVudFxuICogQHRocm93cyB7Q2RrRXJyb3J9IElmIGRlcGxveW1lbnQgZW52aXJvbm1lbnQgaXMgaW52YWxpZFxuICovXG5mdW5jdGlvbiBnZXREZXBsb3ltZW50RW52aXJvbm1lbnQoKTogRGVwbG95bWVudEVudmlyb25tZW50IHtcbiAgY29uc3QgZGVwbG95bWVudEVudlJhdyA9XG4gICAgcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgfHxcbiAgICBhcHAubm9kZS50cnlHZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiKSB8fFxuICAgIERFRkFVTFRfRU5WSVJPTk1FTlQ7XG5cbiAgY29uc3QgZGVwbG95bWVudEVudiA9IGRlcGxveW1lbnRFbnZSYXdcbiAgICAudG9Mb3dlckNhc2UoKVxuICAgIC50cmltKCkgYXMgRGVwbG95bWVudEVudmlyb25tZW50O1xuXG4gIGlmICghVkFMSURfRU5WSVJPTk1FTlRTLmluY2x1ZGVzKGRlcGxveW1lbnRFbnYpKSB7XG4gICAgQ2RrRXJyb3IudGhyb3coe1xuICAgICAgbWVzc2FnZTogYEludmFsaWQgZGVwbG95bWVudCBlbnZpcm9ubWVudCAnJHtkZXBsb3ltZW50RW52UmF3fScuIE11c3QgYmUgb25lIG9mOiAke1ZBTElEX0VOVklST05NRU5UUy5qb2luKFwiLCBcIil9LmAsXG4gICAgICBjYXVzZTogXCJJbnZhbGlkIGRlcGxveW1lbnQgZW52aXJvbm1lbnRcIixcbiAgICAgIHJlbWVkaWF0aW9uOiBgU2V0IERFUExPWU1FTlRfRU5WIG9yIHVzZSAtLWNvbnRleHQgZGVwbG95bWVudEVudiB0byBvbmUgb2Y6ICR7VkFMSURfRU5WSVJPTk1FTlRTLmpvaW4oXCIsIFwiKX1gLFxuICAgICAgc291cmNlOiBcImFwcFwiLFxuICAgIH0pO1xuICB9XG5cbiAgaWYgKCFwcm9jZXNzLmVudi5ERVBMT1lNRU5UX0VOViAmJiAhYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIikpIHtcbiAgICBsb2dXYXJuKFxuICAgICAgYERFUExPWU1FTlRfRU5WIG5vdCBzZXQuIERlZmF1bHRpbmcgdG8gJyR7REVGQVVMVF9FTlZJUk9OTUVOVH0nIGVudmlyb25tZW50LmAsXG4gICAgICB7XG4gICAgICAgIHBoYXNlOiBcImNvbmZpZ1wiLFxuICAgICAgfSxcbiAgICApO1xuICB9XG5cbiAgcmV0dXJuIGRlcGxveW1lbnRFbnY7XG59XG5cbmNvbnN0IGRlcGxveW1lbnRFbnYgPSBnZXREZXBsb3ltZW50RW52aXJvbm1lbnQoKTtcblxuLyoqXG4gKiBMb2FkIGNvbmZpZ3VyYXRpb24gZnJvbSBmaWxlcyB3aXRoIGZhbGxiYWNrIHRvIGNvbnRleHQvZGVmYXVsdHNcbiAqXG4gKiBAcGFyYW0gZW52IC0gRGVwbG95bWVudCBlbnZpcm9ubWVudFxuICogQHJldHVybnMgQ29uZmlndXJhdGlvbiBvYmplY3Qgb3IgbnVsbCBpZiBsb2FkaW5nIGZhaWxlZFxuICovXG5mdW5jdGlvbiBsb2FkQ29uZmlndXJhdGlvbihlbnY6IERlcGxveW1lbnRFbnZpcm9ubWVudCk6IENka0NvbmZpZyB8IG51bGwge1xuICB0cnkge1xuICAgIGNvbnN0IGNka0RpciA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwiLi5cIik7XG4gICAgY29uc3QgZmlsZUNvbmZpZyA9IGxvYWRDZGtDb25maWcoZW52LCBjZGtEaXIpO1xuICAgIHJldHVybiBhcHBseUVudk92ZXJyaWRlcyhmaWxlQ29uZmlnKTtcbiAgfSBjYXRjaCB7XG4gICAgbG9nV2FybihcbiAgICAgIFwiQ29uZmlndXJhdGlvbiBmaWxlIGxvYWQgZmFpbGVkOyBmYWxsaW5nIGJhY2sgdG8gY29udGV4dCBvciBkZWZhdWx0cy5cIixcbiAgICAgIHtcbiAgICAgICAgcGhhc2U6IFwiY29uZmlnXCIsXG4gICAgICAgIGNvbnRleHQ6IHsgc3RlcDogXCJjb25maWcgbG9hZFwiIH0sXG4gICAgICB9LFxuICAgICk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuY29uc3QgY29uZmlnID0gbG9hZENvbmZpZ3VyYXRpb24oZGVwbG95bWVudEVudik7XG5cbmxvZ0luZm8oXG4gIGNvbmZpZ1xuICAgID8gXCJDb25maWd1cmF0aW9uIGxvYWRlZCBmcm9tIGZpbGUgb3IgZW52IG92ZXJyaWRlcy5cIlxuICAgIDogXCJVc2luZyBjb250ZXh0IG9yIGRlZmF1bHRzIChubyBjb25maWcgZmlsZSkuXCIsXG4gIHsgcGhhc2U6IFwiY29uZmlnXCIsIGNvbnRleHQ6IHsgZGVwbG95bWVudEVudiB9IH0sXG4pO1xuXG4vKipcbiAqIEdldCBjb25maWd1cmF0aW9uIHZhbHVlIHdpdGggcHJpb3JpdHk6IGNvbnRleHQgPiBjb25maWcgZmlsZSA+IGRlZmF1bHRcbiAqL1xuZnVuY3Rpb24gZ2V0Q29uZmlnVmFsdWU8VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCk6IFQge1xuICBjb25zdCBjb250ZXh0VmFsdWUgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KGtleSk7XG4gIGlmIChjb250ZXh0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBjb250ZXh0VmFsdWUgYXMgVDtcbiAgfVxuICBpZiAoY29uZmlnICYmIGtleSBpbiBjb25maWcpIHtcbiAgICByZXR1cm4gKGNvbmZpZyBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrZXldIGFzIFQ7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbn1cblxuLyoqXG4gKiBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZSBhcyBzdHJpbmcgd2l0aCBlbXB0eSBzdHJpbmcgaGFuZGxpbmdcbiAqL1xuZnVuY3Rpb24gZ2V0Q29uZmlnU3RyaW5nKGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWUgPSBcIlwiKTogc3RyaW5nIHtcbiAgY29uc3QgdmFsdWUgPSBnZXRDb25maWdWYWx1ZTxzdHJpbmc+KGtleSwgZGVmYXVsdFZhbHVlKTtcbiAgcmV0dXJuIHZhbHVlIHx8IFwiXCI7XG59XG5cbi8qKlxuICogR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWUgYXMgb2JqZWN0LlxuICovXG5mdW5jdGlvbiBnZXRDb25maWdPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCk6IFQge1xuICBjb25zdCB2YWx1ZSA9IGdldENvbmZpZ1ZhbHVlPFQ+KGtleSwgZGVmYXVsdFZhbHVlKTtcbiAgcmV0dXJuIHZhbHVlIHx8IGRlZmF1bHRWYWx1ZTtcbn1cblxuLy8gR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWVzXG5jb25zdCByZWdpb24gPSBnZXRDb25maWdWYWx1ZShcImF3c1JlZ2lvblwiLCBERUZBVUxUX1JFR0lPTik7XG5cbi8vIFN0YWNrIG5hbWUgKHdpdGhvdXQgZW52aXJvbm1lbnQgc3VmZml4KVxuY29uc3QgYmFzZVZlcmlmaWNhdGlvblN0YWNrTmFtZSA9IGdldENvbmZpZ1ZhbHVlKFxuICBcInZlcmlmaWNhdGlvblN0YWNrTmFtZVwiLFxuICBcIlNsYWNrQUktVmVyaWZpY2F0aW9uXCIsXG4pO1xuXG4vLyBBZGQgZW52aXJvbm1lbnQgc3VmZml4XG5jb25zdCBlbnZpcm9ubWVudFN1ZmZpeCA9IGRlcGxveW1lbnRFbnYgPT09IFwicHJvZFwiID8gXCJQcm9kXCIgOiBcIkRldlwiO1xuY29uc3QgdmVyaWZpY2F0aW9uU3RhY2tOYW1lID0gYCR7YmFzZVZlcmlmaWNhdGlvblN0YWNrTmFtZX0tJHtlbnZpcm9ubWVudFN1ZmZpeH1gO1xuXG4vLyBDcm9zcy1hY2NvdW50IGNvbmZpZ3VyYXRpb25cbmNvbnN0IHZlcmlmaWNhdGlvbkFjY291bnRJZCA9IGdldENvbmZpZ1N0cmluZyhcInZlcmlmaWNhdGlvbkFjY291bnRJZFwiKTtcbmNvbnN0IGV4ZWN1dGlvbkFjY291bnRJZCA9IGdldENvbmZpZ1N0cmluZyhcImV4ZWN1dGlvbkFjY291bnRJZFwiKTtcblxuLy8gQWdlbnRDb3JlIGNvbmZpZ3VyYXRpb25cbmNvbnN0IHZlcmlmaWNhdGlvbkFnZW50TmFtZSA9IGdldENvbmZpZ1N0cmluZyhcbiAgXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWVcIixcbiAgYFNsYWNrQUlfVmVyaWZpY2F0aW9uQWdlbnRfJHtlbnZpcm9ubWVudFN1ZmZpeH1gLFxuKTtcblxuLyoqIFBhcnNlIGEgY29udGV4dCB2YWx1ZSAoc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpIGludG8gYSBzdHJpbmdbXS4gKi9cbmNvbnN0IHBhcnNlQ2hhbm5lbElkQ29udGV4dCA9IChjdHhSYXc6IHVua25vd24sIGZhbGxiYWNrOiBzdHJpbmdbXSk6IHN0cmluZ1tdID0+IHtcbiAgaWYgKGN0eFJhdyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gZmFsbGJhY2s7XG4gIGlmICh0eXBlb2YgY3R4UmF3ID09PSBcInN0cmluZ1wiKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoY3R4UmF3KSBhcyB1bmtub3duO1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuICAgICAgICByZXR1cm4gKHBhcnNlZCBhcyB1bmtub3duW10pLm1hcChTdHJpbmcpLmZpbHRlcigocykgPT4gcy50cmltKCkgIT09IFwiXCIpO1xuICAgICAgfVxuICAgIH0gY2F0Y2gge1xuICAgICAgLy8gTm90IEpTT04g4oCUIHRyZWF0IGFzIGNvbW1hLXNlcGFyYXRlZFxuICAgIH1cbiAgICByZXR1cm4gY3R4UmF3LnNwbGl0KFwiLFwiKS5tYXAoKHMpID0+IHMudHJpbSgpKS5maWx0ZXIoKHMpID0+IHMgIT09IFwiXCIpO1xuICB9XG4gIGlmIChBcnJheS5pc0FycmF5KGN0eFJhdykpIHtcbiAgICByZXR1cm4gKGN0eFJhdyBhcyB1bmtub3duW10pLm1hcChTdHJpbmcpLmZpbHRlcigocykgPT4gcy50cmltKCkgIT09IFwiXCIpO1xuICB9XG4gIHJldHVybiBmYWxsYmFjaztcbn07XG5cbi8vIEF1dG8tcmVwbHkgY2hhbm5lbCBJRHMgKGZyb20gY29udGV4dCwgY29uZmlnIGZpbGUsIG9yIGVudiB2YXIpLlxuLy8gLS1jb250ZXh0IGF1dG9SZXBseUNoYW5uZWxJZHM9QzEyMyxDNDU2ICBPUiAgW1wiQzEyM1wiLFwiQzQ1NlwiXSBKU09OIGFycmF5XG5jb25zdCBhdXRvUmVwbHlDaGFubmVsSWRzOiBzdHJpbmdbXSA9IHBhcnNlQ2hhbm5lbElkQ29udGV4dChcbiAgYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcImF1dG9SZXBseUNoYW5uZWxJZHNcIiksXG4gIGNvbmZpZz8uYXV0b1JlcGx5Q2hhbm5lbElkcyA/PyBbXVxuKTtcblxuLy8gTWVudGlvbi1hbGxvd2VkIGNoYW5uZWwgSURzIChmcm9tIGNvbnRleHQsIGNvbmZpZyBmaWxlLCBvciBlbnYgdmFyKS5cbi8vIFdoZW4gc2V0LCBhcHBfbWVudGlvbiBldmVudHMgZnJvbSBvdGhlciBjaGFubmVscyBhcmUgc2lsZW50bHkgaWdub3JlZC5cbi8vIC0tY29udGV4dCBtZW50aW9uQ2hhbm5lbElkcz1DMTIzLEM0NTYgIE9SICBbXCJDMTIzXCIsXCJDNDU2XCJdIEpTT04gYXJyYXlcbmNvbnN0IG1lbnRpb25DaGFubmVsSWRzOiBzdHJpbmdbXSA9IHBhcnNlQ2hhbm5lbElkQ29udGV4dChcbiAgYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcIm1lbnRpb25DaGFubmVsSWRzXCIpLFxuICBjb25maWc/Lm1lbnRpb25DaGFubmVsSWRzID8/IFtdXG4pO1xuXG4vLyBFeGVjdXRpb24gYWdlbnQgQVJOcyAoZnJvbSBjb250ZXh0LCBlbnYgdmFycywgb3IgY29uZmlnIGZpbGUpLlxuLy8gQ0RLIC0tY29udGV4dCBhbHdheXMgcGFzc2VzIHN0cmluZ3M7IEpTT04tcGFyc2Ugd2hlbiBuZWVkZWQuXG5jb25zdCBleGVjdXRpb25BZ2VudEFybnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSAoKCkgPT4ge1xuICBjb25zdCBjdHhSYXcgPSBhcHAubm9kZS50cnlHZXRDb250ZXh0KFwiZXhlY3V0aW9uQWdlbnRBcm5zXCIpO1xuICBpZiAoY3R4UmF3ICE9PSB1bmRlZmluZWQpIHtcbiAgICBpZiAodHlwZW9mIGN0eFJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY3R4UmF3KSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgICAgfSBjYXRjaCB7XG4gICAgICAgIHJldHVybiB7fTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHR5cGVvZiBjdHhSYXcgPT09IFwib2JqZWN0XCIgJiYgY3R4UmF3ICE9PSBudWxsKSB7XG4gICAgICByZXR1cm4gY3R4UmF3IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG4gICAgfVxuICB9XG4gIHJldHVybiBjb25maWc/LmV4ZWN1dGlvbkFnZW50QXJucyA/PyB7fTtcbn0pKCk7XG5cbi8qKlxuICogU2V0IGxvYWRlZCBjb25maWcgdmFsdWVzIHRvIENESyBjb250ZXh0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gKi9cbmZ1bmN0aW9uIHNldENvbnRleHRGcm9tQ29uZmlnKGNvbmZpZzogQ2RrQ29uZmlnIHwgbnVsbCk6IHZvaWQge1xuICBpZiAoIWNvbmZpZykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJhd3NSZWdpb25cIiwgcmVnaW9uKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcImJlZHJvY2tNb2RlbElkXCIsIGNvbmZpZy5iZWRyb2NrTW9kZWxJZCk7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIsIGRlcGxveW1lbnRFbnYpO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwidmVyaWZpY2F0aW9uU3RhY2tOYW1lXCIsIGJhc2VWZXJpZmljYXRpb25TdGFja05hbWUpO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwidmVyaWZpY2F0aW9uQWNjb3VudElkXCIsIHZlcmlmaWNhdGlvbkFjY291bnRJZCk7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJleGVjdXRpb25BY2NvdW50SWRcIiwgZXhlY3V0aW9uQWNjb3VudElkKTtcblxuICBpZiAoY29uZmlnLnNsYWNrQm90VG9rZW4pIHtcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KFwic2xhY2tCb3RUb2tlblwiLCBjb25maWcuc2xhY2tCb3RUb2tlbik7XG4gIH1cbiAgaWYgKGNvbmZpZy5zbGFja1NpZ25pbmdTZWNyZXQpIHtcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KFwic2xhY2tTaWduaW5nU2VjcmV0XCIsIGNvbmZpZy5zbGFja1NpZ25pbmdTZWNyZXQpO1xuICB9XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJ2ZXJpZmljYXRpb25BZ2VudE5hbWVcIiwgdmVyaWZpY2F0aW9uQWdlbnROYW1lKTtcbiAgaWYgKE9iamVjdC5rZXlzKGV4ZWN1dGlvbkFnZW50QXJucykubGVuZ3RoID4gMCkge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJleGVjdXRpb25BZ2VudEFybnNcIiwgZXhlY3V0aW9uQWdlbnRBcm5zKTtcbiAgfVxuICBpZiAoYXV0b1JlcGx5Q2hhbm5lbElkcy5sZW5ndGggPiAwKSB7XG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dChcImF1dG9SZXBseUNoYW5uZWxJZHNcIiwgYXV0b1JlcGx5Q2hhbm5lbElkcyk7XG4gIH1cbn1cblxuc2V0Q29udGV4dEZyb21Db25maWcoY29uZmlnKTtcblxuLyoqXG4gKiBHZXQgQ0RLIGVudmlyb25tZW50IGNvbmZpZ3VyYXRpb25cbiAqL1xuZnVuY3Rpb24gZ2V0RGVmYXVsdEVudihyZWdpb246IHN0cmluZyk6IGNkay5FbnZpcm9ubWVudCB7XG4gIHJldHVybiB7XG4gICAgYWNjb3VudDogcHJvY2Vzcy5lbnYuQ0RLX0RFRkFVTFRfQUNDT1VOVCxcbiAgICByZWdpb246IHJlZ2lvbixcbiAgfTtcbn1cblxuY29uc3QgZGVmYXVsdEVudiA9IGdldERlZmF1bHRFbnYocmVnaW9uKTtcblxuZnVuY3Rpb24gZ2V0U3RhY2tFbnZpcm9ubWVudChcbiAgYWNjb3VudElkOiBzdHJpbmcsXG4gIHJlZ2lvbjogc3RyaW5nLFxuICBkZWZhdWx0RW52OiBjZGsuRW52aXJvbm1lbnQsXG4pOiBjZGsuRW52aXJvbm1lbnQge1xuICByZXR1cm4gYWNjb3VudElkID8geyBhY2NvdW50OiBhY2NvdW50SWQsIHJlZ2lvbjogcmVnaW9uIH0gOiBkZWZhdWx0RW52O1xufVxuXG5jb25zdCB2ZXJpZmljYXRpb25FbnYgPSBnZXRTdGFja0Vudmlyb25tZW50KFxuICB2ZXJpZmljYXRpb25BY2NvdW50SWQsXG4gIHJlZ2lvbixcbiAgZGVmYXVsdEVudixcbik7XG5cbmNvbnN0IGJlZHJvY2tNb2RlbElkID0gZ2V0Q29uZmlnU3RyaW5nKFxuICBcImJlZHJvY2tNb2RlbElkXCIsXG4gIFwianAuYW50aHJvcGljLmNsYXVkZS1zb25uZXQtNC01LTIwMjUwOTI5LXYxOjBcIixcbik7XG5cbi8vIFNsYWNrIFNlYXJjaCBBZ2VudCBBUk4gKG9wdGlvbmFsOyBzZXQgYWZ0ZXIgZGVwbG95aW5nIHNsYWNrLXNlYXJjaC1hZ2VudCBzdGFjaylcbmNvbnN0IHNsYWNrU2VhcmNoQWdlbnRBcm4gPVxuICBwcm9jZXNzLmVudi5TTEFDS19TRUFSQ0hfQUdFTlRfQVJOPy50cmltKCkgfHxcbiAgZ2V0Q29uZmlnU3RyaW5nKFwic2xhY2tTZWFyY2hBZ2VudEFyblwiKSB8fFxuICB1bmRlZmluZWQ7XG5pZiAoc2xhY2tTZWFyY2hBZ2VudEFybikge1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwic2xhY2tTZWFyY2hBZ2VudEFyblwiLCBzbGFja1NlYXJjaEFnZW50QXJuKTtcbn1cblxuLy8gQXJjaGl2ZSBhY2NvdW50IElEIGZvciBjcm9zcy1hY2NvdW50IFMzIHJlcGxpY2F0aW9uIChvcHRpb25hbDsgc2FtZS1hY2NvdW50IGlmIGFic2VudClcbmNvbnN0IGFyY2hpdmVBY2NvdW50SWQgPVxuICBwcm9jZXNzLmVudi5BUkNISVZFX0FDQ09VTlRfSUQ/LnRyaW0oKSB8fFxuICBnZXRDb25maWdTdHJpbmcoXCJhcmNoaXZlQWNjb3VudElkXCIpIHx8XG4gIHVuZGVmaW5lZDtcblxuLy8gQ3JlYXRlIFZlcmlmaWNhdGlvbiBTdGFja1xubmV3IFZlcmlmaWNhdGlvblN0YWNrKGFwcCwgdmVyaWZpY2F0aW9uU3RhY2tOYW1lLCB7XG4gIGVudjogdmVyaWZpY2F0aW9uRW52LFxuICBleGVjdXRpb25BY2NvdW50SWQ6IGV4ZWN1dGlvbkFjY291bnRJZCB8fCB1bmRlZmluZWQsXG4gIHZlcmlmaWNhdGlvbkFnZW50TmFtZTogdmVyaWZpY2F0aW9uQWdlbnROYW1lIHx8IHVuZGVmaW5lZCxcbiAgZXhlY3V0aW9uQWdlbnRBcm5zOlxuICAgIE9iamVjdC5rZXlzKGV4ZWN1dGlvbkFnZW50QXJucykubGVuZ3RoID4gMCA/IGV4ZWN1dGlvbkFnZW50QXJucyA6IHVuZGVmaW5lZCxcbiAgYmVkcm9ja01vZGVsSWQ6IGJlZHJvY2tNb2RlbElkIHx8IHVuZGVmaW5lZCxcbiAgYXV0b1JlcGx5Q2hhbm5lbElkczogYXV0b1JlcGx5Q2hhbm5lbElkcy5sZW5ndGggPiAwID8gYXV0b1JlcGx5Q2hhbm5lbElkcyA6IHVuZGVmaW5lZCxcbiAgbWVudGlvbkNoYW5uZWxJZHM6IG1lbnRpb25DaGFubmVsSWRzLmxlbmd0aCA+IDAgPyBtZW50aW9uQ2hhbm5lbElkcyA6IHVuZGVmaW5lZCxcbiAgc2xhY2tTZWFyY2hBZ2VudEFybjogc2xhY2tTZWFyY2hBZ2VudEFybiB8fCB1bmRlZmluZWQsXG4gIGFyY2hpdmVBY2NvdW50SWQ6IGFyY2hpdmVBY2NvdW50SWQgfHwgdW5kZWZpbmVkLFxufSk7XG5sb2dJbmZvKFwiVmVyaWZpY2F0aW9uIHN0YWNrIGNyZWF0ZWQuXCIsIHtcbiAgcGhhc2U6IFwic3RhY2tcIixcbiAgY29udGV4dDogeyBzdGFja05hbWU6IHZlcmlmaWNhdGlvblN0YWNrTmFtZSB9LFxufSk7XG5cbmFwcGx5TmFnUGFja3MoYXBwKTtcbi8vIEVtaXQgY2xvdWQgYXNzZW1ibHlcbmFwcC5zeW50aCgpO1xuIl19