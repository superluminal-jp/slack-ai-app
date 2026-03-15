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
});
(0, cdk_tooling_1.logInfo)("Verification stack created.", {
    phase: "stack",
    context: { stackName: verificationStackName },
});
// Emit cloud assembly
app.synth();
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7R0FtQkc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsaURBQW1DO0FBQ25DLDZDQUFzQztBQUN0QywyQ0FBNkI7QUFDN0Isa0VBQThEO0FBQzlELHdEQUlpQztBQUNqQywyREFNbUM7QUFFbkMsWUFBWTtBQUNaLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxLQUFLLEVBQUUsTUFBTSxDQUFVLENBQUM7QUFDcEQsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7QUFDbEMsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFJeEMsd0VBQXdFO0FBQ3hFLE1BQU0sTUFBTSxHQUNWLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUMxRSxNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUEscUJBQU8sRUFBQyxvQ0FBb0MsRUFBRSxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBRW5FLDBDQUEwQztBQUMxQyxxQkFBTyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxnQ0FBa0IsRUFBRSxDQUFDLENBQUM7QUFDOUMscUJBQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLElBQUkscUNBQXVCLEVBQUUsQ0FBQyxDQUFDO0FBRW5EOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLHdCQUF3QjtJQUMvQixNQUFNLGdCQUFnQixHQUNwQixPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWM7UUFDMUIsR0FBRyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsZUFBZSxDQUFDO1FBQ3ZDLG1CQUFtQixDQUFDO0lBRXRCLE1BQU0sYUFBYSxHQUFHLGdCQUFnQjtTQUNuQyxXQUFXLEVBQUU7U0FDYixJQUFJLEVBQTJCLENBQUM7SUFFbkMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO1FBQ2hELHNCQUFRLENBQUMsS0FBSyxDQUFDO1lBQ2IsT0FBTyxFQUFFLG1DQUFtQyxnQkFBZ0Isc0JBQXNCLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRztZQUNsSCxLQUFLLEVBQUUsZ0NBQWdDO1lBQ3ZDLFdBQVcsRUFBRSxnRUFBZ0Usa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQzVHLE1BQU0sRUFBRSxLQUFLO1NBQ2QsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUM7UUFDNUUsSUFBQSxxQkFBTyxFQUNMLDBDQUEwQyxtQkFBbUIsZ0JBQWdCLEVBQzdFO1lBQ0UsS0FBSyxFQUFFLFFBQVE7U0FDaEIsQ0FDRixDQUFDO0lBQ0osQ0FBQztJQUVELE9BQU8sYUFBYSxDQUFDO0FBQ3ZCLENBQUM7QUFFRCxNQUFNLGFBQWEsR0FBRyx3QkFBd0IsRUFBRSxDQUFDO0FBRWpEOzs7OztHQUtHO0FBQ0gsU0FBUyxpQkFBaUIsQ0FBQyxHQUEwQjtJQUNuRCxJQUFJLENBQUM7UUFDSCxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3QyxNQUFNLFVBQVUsR0FBRyxJQUFBLDBCQUFhLEVBQUMsR0FBRyxFQUFFLE1BQU0sQ0FBQyxDQUFDO1FBQzlDLE9BQU8sSUFBQSw4QkFBaUIsRUFBQyxVQUFVLENBQUMsQ0FBQztJQUN2QyxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsSUFBQSxxQkFBTyxFQUNMLHNFQUFzRSxFQUN0RTtZQUNFLEtBQUssRUFBRSxRQUFRO1lBQ2YsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRTtTQUNqQyxDQUNGLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUM7QUFFaEQsSUFBQSxxQkFBTyxFQUNMLE1BQU07SUFDSixDQUFDLENBQUMsa0RBQWtEO0lBQ3BELENBQUMsQ0FBQyw2Q0FBNkMsRUFDakQsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLE9BQU8sRUFBRSxFQUFFLGFBQWEsRUFBRSxFQUFFLENBQ2hELENBQUM7QUFFRjs7R0FFRztBQUNILFNBQVMsY0FBYyxDQUFJLEdBQVcsRUFBRSxZQUFlO0lBQ3JELE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2pELElBQUksWUFBWSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQy9CLE9BQU8sWUFBaUIsQ0FBQztJQUMzQixDQUFDO0lBQ0QsSUFBSSxNQUFNLElBQUksR0FBRyxJQUFJLE1BQU0sRUFBRSxDQUFDO1FBQzVCLE9BQVEsTUFBNkMsQ0FBQyxHQUFHLENBQU0sQ0FBQztJQUNsRSxDQUFDO0lBQ0QsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxlQUFlLENBQUMsR0FBVyxFQUFFLFlBQVksR0FBRyxFQUFFO0lBQ3JELE1BQU0sS0FBSyxHQUFHLGNBQWMsQ0FBUyxHQUFHLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDeEQsT0FBTyxLQUFLLElBQUksRUFBRSxDQUFDO0FBQ3JCLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsZUFBZSxDQUFtQixHQUFXLEVBQUUsWUFBZTtJQUNyRSxNQUFNLEtBQUssR0FBRyxjQUFjLENBQUksR0FBRyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ25ELE9BQU8sS0FBSyxJQUFJLFlBQVksQ0FBQztBQUMvQixDQUFDO0FBRUQsMkJBQTJCO0FBQzNCLE1BQU0sTUFBTSxHQUFHLGNBQWMsQ0FBQyxXQUFXLEVBQUUsY0FBYyxDQUFDLENBQUM7QUFFM0QsMENBQTBDO0FBQzFDLE1BQU0seUJBQXlCLEdBQUcsY0FBYyxDQUM5Qyx1QkFBdUIsRUFDdkIsc0JBQXNCLENBQ3ZCLENBQUM7QUFFRix5QkFBeUI7QUFDekIsTUFBTSxpQkFBaUIsR0FBRyxhQUFhLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUNwRSxNQUFNLHFCQUFxQixHQUFHLEdBQUcseUJBQXlCLElBQUksaUJBQWlCLEVBQUUsQ0FBQztBQUVsRiw4QkFBOEI7QUFDOUIsTUFBTSxxQkFBcUIsR0FBRyxlQUFlLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUN2RSxNQUFNLGtCQUFrQixHQUFHLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBRWpFLDBCQUEwQjtBQUMxQixNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FDM0MsdUJBQXVCLEVBQ3ZCLDZCQUE2QixpQkFBaUIsRUFBRSxDQUNqRCxDQUFDO0FBRUYsNkVBQTZFO0FBQzdFLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxNQUFlLEVBQUUsUUFBa0IsRUFBWSxFQUFFO0lBQzlFLElBQUksTUFBTSxLQUFLLFNBQVM7UUFBRSxPQUFPLFFBQVEsQ0FBQztJQUMxQyxJQUFJLE9BQU8sTUFBTSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQy9CLElBQUksQ0FBQztZQUNILE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFZLENBQUM7WUFDN0MsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQzFCLE9BQVEsTUFBb0IsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLENBQUM7WUFDMUUsQ0FBQztRQUNILENBQUM7UUFBQyxNQUFNLENBQUM7WUFDUCxzQ0FBc0M7UUFDeEMsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztRQUMxQixPQUFRLE1BQW9CLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQzFFLENBQUM7SUFDRCxPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDLENBQUM7QUFFRixrRUFBa0U7QUFDbEUsMEVBQTBFO0FBQzFFLE1BQU0sbUJBQW1CLEdBQWEscUJBQXFCLENBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLHFCQUFxQixDQUFDLEVBQzdDLE1BQU0sRUFBRSxtQkFBbUIsSUFBSSxFQUFFLENBQ2xDLENBQUM7QUFFRix1RUFBdUU7QUFDdkUseUVBQXlFO0FBQ3pFLHdFQUF3RTtBQUN4RSxNQUFNLGlCQUFpQixHQUFhLHFCQUFxQixDQUN2RCxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxFQUMzQyxNQUFNLEVBQUUsaUJBQWlCLElBQUksRUFBRSxDQUNoQyxDQUFDO0FBRUYsaUVBQWlFO0FBQ2pFLCtEQUErRDtBQUMvRCxNQUFNLGtCQUFrQixHQUEyQixDQUFDLEdBQUcsRUFBRTtJQUN2RCxNQUFNLE1BQU0sR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBQzVELElBQUksTUFBTSxLQUFLLFNBQVMsRUFBRSxDQUFDO1FBQ3pCLElBQUksT0FBTyxNQUFNLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDL0IsSUFBSSxDQUFDO2dCQUNILE9BQU8sSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQTJCLENBQUM7WUFDdEQsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUCxPQUFPLEVBQUUsQ0FBQztZQUNaLENBQUM7UUFDSCxDQUFDO1FBQ0QsSUFBSSxPQUFPLE1BQU0sS0FBSyxRQUFRLElBQUksTUFBTSxLQUFLLElBQUksRUFBRSxDQUFDO1lBQ2xELE9BQU8sTUFBZ0MsQ0FBQztRQUMxQyxDQUFDO0lBQ0gsQ0FBQztJQUNELE9BQU8sTUFBTSxFQUFFLGtCQUFrQixJQUFJLEVBQUUsQ0FBQztBQUMxQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBRUw7O0dBRUc7QUFDSCxTQUFTLG9CQUFvQixDQUFDLE1BQXdCO0lBQ3BELElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztRQUNaLE9BQU87SUFDVCxDQUFDO0lBRUQsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQ3pDLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGdCQUFnQixFQUFFLE1BQU0sQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUM3RCxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDcEQsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsdUJBQXVCLEVBQUUseUJBQXlCLENBQUMsQ0FBQztJQUN4RSxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyx1QkFBdUIsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO0lBQ3BFLEdBQUcsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLG9CQUFvQixFQUFFLGtCQUFrQixDQUFDLENBQUM7SUFFOUQsSUFBSSxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDekIsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFLE1BQU0sQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBQ0QsSUFBSSxNQUFNLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztRQUM5QixHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxvQkFBb0IsRUFBRSxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQztJQUN2RSxDQUFDO0lBQ0QsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsdUJBQXVCLEVBQUUscUJBQXFCLENBQUMsQ0FBQztJQUNwRSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDL0MsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsb0JBQW9CLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUNoRSxDQUFDO0lBQ0QsSUFBSSxtQkFBbUIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7UUFDbkMsR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMscUJBQXFCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztJQUNsRSxDQUFDO0FBQ0gsQ0FBQztBQUVELG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBRTdCOztHQUVHO0FBQ0gsU0FBUyxhQUFhLENBQUMsTUFBYztJQUNuQyxPQUFPO1FBQ0wsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1FBQ3hDLE1BQU0sRUFBRSxNQUFNO0tBQ2YsQ0FBQztBQUNKLENBQUM7QUFFRCxNQUFNLFVBQVUsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFekMsU0FBUyxtQkFBbUIsQ0FDMUIsU0FBaUIsRUFDakIsTUFBYyxFQUNkLFVBQTJCO0lBRTNCLE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7QUFDekUsQ0FBQztBQUVELE1BQU0sZUFBZSxHQUFHLG1CQUFtQixDQUN6QyxxQkFBcUIsRUFDckIsTUFBTSxFQUNOLFVBQVUsQ0FDWCxDQUFDO0FBRUYsTUFBTSxjQUFjLEdBQUcsZUFBZSxDQUNwQyxnQkFBZ0IsRUFDaEIsOENBQThDLENBQy9DLENBQUM7QUFFRixrRkFBa0Y7QUFDbEYsTUFBTSxtQkFBbUIsR0FDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLEVBQUU7SUFDMUMsZUFBZSxDQUFDLHFCQUFxQixDQUFDO0lBQ3RDLFNBQVMsQ0FBQztBQUNaLElBQUksbUJBQW1CLEVBQUUsQ0FBQztJQUN4QixHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxxQkFBcUIsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ2xFLENBQUM7QUFFRCw0QkFBNEI7QUFDNUIsSUFBSSxzQ0FBaUIsQ0FBQyxHQUFHLEVBQUUscUJBQXFCLEVBQUU7SUFDaEQsR0FBRyxFQUFFLGVBQWU7SUFDcEIsa0JBQWtCLEVBQUUsa0JBQWtCLElBQUksU0FBUztJQUNuRCxxQkFBcUIsRUFBRSxxQkFBcUIsSUFBSSxTQUFTO0lBQ3pELGtCQUFrQixFQUNoQixNQUFNLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLFNBQVM7SUFDN0UsY0FBYyxFQUFFLGNBQWMsSUFBSSxTQUFTO0lBQzNDLG1CQUFtQixFQUFFLG1CQUFtQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxTQUFTO0lBQ3JGLGlCQUFpQixFQUFFLGlCQUFpQixDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxTQUFTO0lBQy9FLG1CQUFtQixFQUFFLG1CQUFtQixJQUFJLFNBQVM7Q0FDdEQsQ0FBQyxDQUFDO0FBQ0gsSUFBQSxxQkFBTyxFQUFDLDZCQUE2QixFQUFFO0lBQ3JDLEtBQUssRUFBRSxPQUFPO0lBQ2QsT0FBTyxFQUFFLEVBQUUsU0FBUyxFQUFFLHFCQUFxQixFQUFFO0NBQzlDLENBQUMsQ0FBQztBQUVILHNCQUFzQjtBQUN0QixHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG4vKipcbiAqIFZlcmlmaWNhdGlvbiBab25lIENESyBBcHBsaWNhdGlvbiBFbnRyeSBQb2ludFxuICpcbiAqIFRoaXMgZmlsZSBkZWZpbmVzIHRoZSBzdGFuZGFsb25lIENESyBhcHBsaWNhdGlvbiBmb3IgdGhlIFZlcmlmaWNhdGlvbiBab25lLlxuICogSXQgaW5zdGFudGlhdGVzIG9ubHkgdGhlIFZlcmlmaWNhdGlvblN0YWNrOyBleGVjdXRpb24gc3RhY2tzIGxpdmUgaW4gYSBzZXBhcmF0ZSBDREsgYXBwLlxuICpcbiAqIENvbmZpZ3VyYXRpb24gcHJpb3JpdHkgKGhpZ2hlc3QgZmlyc3QpOiAoMSkgRW52aXJvbm1lbnQgdmFyaWFibGVzIChlLmcuIERFUExPWU1FTlRfRU5WLCBTTEFDS19CT1RfVE9LRU4pLFxuICogKDIpIENvbW1hbmQtbGluZSBjb250ZXh0ICgtLWNvbnRleHQga2V5PXZhbHVlKSwgKDMpIEVudmlyb25tZW50LXNwZWNpZmljIGNvbmZpZyBmaWxlIChjZGsuY29uZmlnLntlbnZ9Lmpzb24pLFxuICogKDQpIERlZmF1bHRzIGluIGNvZGUuIFNlZSBnZXRDb25maWdWYWx1ZSAvIGdldENvbmZpZ1N0cmluZyBhbmQgbG9hZENvbmZpZ3VyYXRpb24uXG4gKlxuICogRXhlY3V0aW9uIGFnZW50IEFSTnMgYXJlIHN1cHBsaWVkIHZpYSBjb25maWcgZmlsZSAoZXhlY3V0aW9uQWdlbnRBcm5zKSBvciBpbmRpdmlkdWFsIGVudiB2YXJzOlxuICogRklMRV9DUkVBVE9SX0FHRU5UX0FSTiwgRE9DU19BR0VOVF9BUk4sIFRJTUVfQUdFTlRfQVJOLCBXRUJfRkVUQ0hfQUdFTlRfQVJOXG4gKiAob3IgY29tYmluZWQgRVhFQ1VUSU9OX0FHRU5UX0FSTlMgSlNPTikuXG4gKlxuICogRGVwbG95IG9yZGVyOiAxKSBEZXBsb3kgZXhlY3V0aW9uIENESyBhcHAgKGV4ZWN1dGlvbi16b25lcy8pIHRvIGdldCBydW50aW1lIEFSTnMsXG4gKiAgICAgICAgICAgICAgIDIpIFNldCBleGVjdXRpb25BZ2VudEFybnMgaW4gY2RrLmNvbmZpZy57ZW52fS5qc29uIChvciBlbnYgdmFycyksXG4gKiAgICAgICAgICAgICAgIDMpIERlcGxveSB0aGlzIGFwcDogbnB4IGNkayBkZXBsb3lcbiAqXG4gKiBAbW9kdWxlIHZlcmlmaWNhdGlvbi16b25lcy92ZXJpZmljYXRpb24tYWdlbnQvY2RrL2Jpbi9jZGtcbiAqL1xuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgeyBBc3BlY3RzIH0gZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBWZXJpZmljYXRpb25TdGFjayB9IGZyb20gXCIuLi9saWIvdmVyaWZpY2F0aW9uLXN0YWNrXCI7XG5pbXBvcnQge1xuICBsb2FkQ2RrQ29uZmlnLFxuICBhcHBseUVudk92ZXJyaWRlcyxcbiAgQ2RrQ29uZmlnLFxufSBmcm9tIFwiLi4vbGliL3R5cGVzL2Nkay1jb25maWdcIjtcbmltcG9ydCB7XG4gIExvZ1JldGVudGlvbkFzcGVjdCxcbiAgQ29zdEFsbG9jYXRpb25UYWdBc3BlY3QsXG4gIGxvZ0luZm8sXG4gIGxvZ1dhcm4sXG4gIENka0Vycm9yLFxufSBmcm9tIFwiQHNsYWNrLWFpLWFwcC9jZGstdG9vbGluZ1wiO1xuXG4vLyBDb25zdGFudHNcbmNvbnN0IFZBTElEX0VOVklST05NRU5UUyA9IFtcImRldlwiLCBcInByb2RcIl0gYXMgY29uc3Q7XG5jb25zdCBERUZBVUxUX0VOVklST05NRU5UID0gXCJkZXZcIjtcbmNvbnN0IERFRkFVTFRfUkVHSU9OID0gXCJhcC1ub3J0aGVhc3QtMVwiO1xuXG50eXBlIERlcGxveW1lbnRFbnZpcm9ubWVudCA9ICh0eXBlb2YgVkFMSURfRU5WSVJPTk1FTlRTKVtudW1iZXJdO1xuXG4vLyBPdXRkaXIgZm9yIGNsb3VkIGFzc2VtYmx5IChDTEkgc2V0cyBDREtfT1VURElSOyBlbHNlIGRlZmF1bHQgY2RrLm91dClcbmNvbnN0IG91dGRpciA9XG4gIHByb2Nlc3MuZW52LkNES19PVVRESVIgfHwgcGF0aC5qb2luKHBhdGguZGlybmFtZShfX2Rpcm5hbWUpLCBcImNkay5vdXRcIik7XG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCh7IG91dGRpciB9KTtcblxubG9nSW5mbyhcIlZlcmlmaWNhdGlvbiBab25lIENESyBhcHAgc3RhcnRpbmdcIiwgeyBwaGFzZTogXCJjb25maWdcIiB9KTtcblxuLy8gQXBwbHkgc3ludGhlc2lzLXRpbWUgdmFsaWRhdGlvbiBhc3BlY3RzXG5Bc3BlY3RzLm9mKGFwcCkuYWRkKG5ldyBMb2dSZXRlbnRpb25Bc3BlY3QoKSk7XG5Bc3BlY3RzLm9mKGFwcCkuYWRkKG5ldyBDb3N0QWxsb2NhdGlvblRhZ0FzcGVjdCgpKTtcblxuLyoqXG4gKiBHZXQgYW5kIHZhbGlkYXRlIGRlcGxveW1lbnQgZW52aXJvbm1lbnQuXG4gKlxuICogUHJpb3JpdHk6IDEuIERFUExPWU1FTlRfRU5WIGVudmlyb25tZW50IHZhcmlhYmxlLCAyLiBjZGsuanNvbiBjb250ZXh0LCAzLiBkZWZhdWx0XG4gKlxuICogQHJldHVybnMgVmFsaWRhdGVkIGRlcGxveW1lbnQgZW52aXJvbm1lbnRcbiAqIEB0aHJvd3Mge0Nka0Vycm9yfSBJZiBkZXBsb3ltZW50IGVudmlyb25tZW50IGlzIGludmFsaWRcbiAqL1xuZnVuY3Rpb24gZ2V0RGVwbG95bWVudEVudmlyb25tZW50KCk6IERlcGxveW1lbnRFbnZpcm9ubWVudCB7XG4gIGNvbnN0IGRlcGxveW1lbnRFbnZSYXcgPVxuICAgIHByb2Nlc3MuZW52LkRFUExPWU1FTlRfRU5WIHx8XG4gICAgYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcImRlcGxveW1lbnRFbnZcIikgfHxcbiAgICBERUZBVUxUX0VOVklST05NRU5UO1xuXG4gIGNvbnN0IGRlcGxveW1lbnRFbnYgPSBkZXBsb3ltZW50RW52UmF3XG4gICAgLnRvTG93ZXJDYXNlKClcbiAgICAudHJpbSgpIGFzIERlcGxveW1lbnRFbnZpcm9ubWVudDtcblxuICBpZiAoIVZBTElEX0VOVklST05NRU5UUy5pbmNsdWRlcyhkZXBsb3ltZW50RW52KSkge1xuICAgIENka0Vycm9yLnRocm93KHtcbiAgICAgIG1lc3NhZ2U6IGBJbnZhbGlkIGRlcGxveW1lbnQgZW52aXJvbm1lbnQgJyR7ZGVwbG95bWVudEVudlJhd30nLiBNdXN0IGJlIG9uZSBvZjogJHtWQUxJRF9FTlZJUk9OTUVOVFMuam9pbihcIiwgXCIpfS5gLFxuICAgICAgY2F1c2U6IFwiSW52YWxpZCBkZXBsb3ltZW50IGVudmlyb25tZW50XCIsXG4gICAgICByZW1lZGlhdGlvbjogYFNldCBERVBMT1lNRU5UX0VOViBvciB1c2UgLS1jb250ZXh0IGRlcGxveW1lbnRFbnYgdG8gb25lIG9mOiAke1ZBTElEX0VOVklST05NRU5UUy5qb2luKFwiLCBcIil9YCxcbiAgICAgIHNvdXJjZTogXCJhcHBcIixcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghcHJvY2Vzcy5lbnYuREVQTE9ZTUVOVF9FTlYgJiYgIWFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJkZXBsb3ltZW50RW52XCIpKSB7XG4gICAgbG9nV2FybihcbiAgICAgIGBERVBMT1lNRU5UX0VOViBub3Qgc2V0LiBEZWZhdWx0aW5nIHRvICcke0RFRkFVTFRfRU5WSVJPTk1FTlR9JyBlbnZpcm9ubWVudC5gLFxuICAgICAge1xuICAgICAgICBwaGFzZTogXCJjb25maWdcIixcbiAgICAgIH0sXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBkZXBsb3ltZW50RW52O1xufVxuXG5jb25zdCBkZXBsb3ltZW50RW52ID0gZ2V0RGVwbG95bWVudEVudmlyb25tZW50KCk7XG5cbi8qKlxuICogTG9hZCBjb25maWd1cmF0aW9uIGZyb20gZmlsZXMgd2l0aCBmYWxsYmFjayB0byBjb250ZXh0L2RlZmF1bHRzXG4gKlxuICogQHBhcmFtIGVudiAtIERlcGxveW1lbnQgZW52aXJvbm1lbnRcbiAqIEByZXR1cm5zIENvbmZpZ3VyYXRpb24gb2JqZWN0IG9yIG51bGwgaWYgbG9hZGluZyBmYWlsZWRcbiAqL1xuZnVuY3Rpb24gbG9hZENvbmZpZ3VyYXRpb24oZW52OiBEZXBsb3ltZW50RW52aXJvbm1lbnQpOiBDZGtDb25maWcgfCBudWxsIHtcbiAgdHJ5IHtcbiAgICBjb25zdCBjZGtEaXIgPSBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4uXCIpO1xuICAgIGNvbnN0IGZpbGVDb25maWcgPSBsb2FkQ2RrQ29uZmlnKGVudiwgY2RrRGlyKTtcbiAgICByZXR1cm4gYXBwbHlFbnZPdmVycmlkZXMoZmlsZUNvbmZpZyk7XG4gIH0gY2F0Y2gge1xuICAgIGxvZ1dhcm4oXG4gICAgICBcIkNvbmZpZ3VyYXRpb24gZmlsZSBsb2FkIGZhaWxlZDsgZmFsbGluZyBiYWNrIHRvIGNvbnRleHQgb3IgZGVmYXVsdHMuXCIsXG4gICAgICB7XG4gICAgICAgIHBoYXNlOiBcImNvbmZpZ1wiLFxuICAgICAgICBjb250ZXh0OiB7IHN0ZXA6IFwiY29uZmlnIGxvYWRcIiB9LFxuICAgICAgfSxcbiAgICApO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbmNvbnN0IGNvbmZpZyA9IGxvYWRDb25maWd1cmF0aW9uKGRlcGxveW1lbnRFbnYpO1xuXG5sb2dJbmZvKFxuICBjb25maWdcbiAgICA/IFwiQ29uZmlndXJhdGlvbiBsb2FkZWQgZnJvbSBmaWxlIG9yIGVudiBvdmVycmlkZXMuXCJcbiAgICA6IFwiVXNpbmcgY29udGV4dCBvciBkZWZhdWx0cyAobm8gY29uZmlnIGZpbGUpLlwiLFxuICB7IHBoYXNlOiBcImNvbmZpZ1wiLCBjb250ZXh0OiB7IGRlcGxveW1lbnRFbnYgfSB9LFxuKTtcblxuLyoqXG4gKiBHZXQgY29uZmlndXJhdGlvbiB2YWx1ZSB3aXRoIHByaW9yaXR5OiBjb250ZXh0ID4gY29uZmlnIGZpbGUgPiBkZWZhdWx0XG4gKi9cbmZ1bmN0aW9uIGdldENvbmZpZ1ZhbHVlPFQ+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBUIHtcbiAgY29uc3QgY29udGV4dFZhbHVlID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dChrZXkpO1xuICBpZiAoY29udGV4dFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICByZXR1cm4gY29udGV4dFZhbHVlIGFzIFQ7XG4gIH1cbiAgaWYgKGNvbmZpZyAmJiBrZXkgaW4gY29uZmlnKSB7XG4gICAgcmV0dXJuIChjb25maWcgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XSBhcyBUO1xuICB9XG4gIHJldHVybiBkZWZhdWx0VmFsdWU7XG59XG5cbi8qKlxuICogR2V0IGNvbmZpZ3VyYXRpb24gdmFsdWUgYXMgc3RyaW5nIHdpdGggZW1wdHkgc3RyaW5nIGhhbmRsaW5nXG4gKi9cbmZ1bmN0aW9uIGdldENvbmZpZ1N0cmluZyhrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlID0gXCJcIik6IHN0cmluZyB7XG4gIGNvbnN0IHZhbHVlID0gZ2V0Q29uZmlnVmFsdWU8c3RyaW5nPihrZXksIGRlZmF1bHRWYWx1ZSk7XG4gIHJldHVybiB2YWx1ZSB8fCBcIlwiO1xufVxuXG4vKipcbiAqIEdldCBjb25maWd1cmF0aW9uIHZhbHVlIGFzIG9iamVjdC5cbiAqL1xuZnVuY3Rpb24gZ2V0Q29uZmlnT2JqZWN0PFQgZXh0ZW5kcyBvYmplY3Q+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBUIHtcbiAgY29uc3QgdmFsdWUgPSBnZXRDb25maWdWYWx1ZTxUPihrZXksIGRlZmF1bHRWYWx1ZSk7XG4gIHJldHVybiB2YWx1ZSB8fCBkZWZhdWx0VmFsdWU7XG59XG5cbi8vIEdldCBjb25maWd1cmF0aW9uIHZhbHVlc1xuY29uc3QgcmVnaW9uID0gZ2V0Q29uZmlnVmFsdWUoXCJhd3NSZWdpb25cIiwgREVGQVVMVF9SRUdJT04pO1xuXG4vLyBTdGFjayBuYW1lICh3aXRob3V0IGVudmlyb25tZW50IHN1ZmZpeClcbmNvbnN0IGJhc2VWZXJpZmljYXRpb25TdGFja05hbWUgPSBnZXRDb25maWdWYWx1ZShcbiAgXCJ2ZXJpZmljYXRpb25TdGFja05hbWVcIixcbiAgXCJTbGFja0FJLVZlcmlmaWNhdGlvblwiLFxuKTtcblxuLy8gQWRkIGVudmlyb25tZW50IHN1ZmZpeFxuY29uc3QgZW52aXJvbm1lbnRTdWZmaXggPSBkZXBsb3ltZW50RW52ID09PSBcInByb2RcIiA/IFwiUHJvZFwiIDogXCJEZXZcIjtcbmNvbnN0IHZlcmlmaWNhdGlvblN0YWNrTmFtZSA9IGAke2Jhc2VWZXJpZmljYXRpb25TdGFja05hbWV9LSR7ZW52aXJvbm1lbnRTdWZmaXh9YDtcblxuLy8gQ3Jvc3MtYWNjb3VudCBjb25maWd1cmF0aW9uXG5jb25zdCB2ZXJpZmljYXRpb25BY2NvdW50SWQgPSBnZXRDb25maWdTdHJpbmcoXCJ2ZXJpZmljYXRpb25BY2NvdW50SWRcIik7XG5jb25zdCBleGVjdXRpb25BY2NvdW50SWQgPSBnZXRDb25maWdTdHJpbmcoXCJleGVjdXRpb25BY2NvdW50SWRcIik7XG5cbi8vIEFnZW50Q29yZSBjb25maWd1cmF0aW9uXG5jb25zdCB2ZXJpZmljYXRpb25BZ2VudE5hbWUgPSBnZXRDb25maWdTdHJpbmcoXG4gIFwidmVyaWZpY2F0aW9uQWdlbnROYW1lXCIsXG4gIGBTbGFja0FJX1ZlcmlmaWNhdGlvbkFnZW50XyR7ZW52aXJvbm1lbnRTdWZmaXh9YCxcbik7XG5cbi8qKiBQYXJzZSBhIGNvbnRleHQgdmFsdWUgKHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkKSBpbnRvIGEgc3RyaW5nW10uICovXG5jb25zdCBwYXJzZUNoYW5uZWxJZENvbnRleHQgPSAoY3R4UmF3OiB1bmtub3duLCBmYWxsYmFjazogc3RyaW5nW10pOiBzdHJpbmdbXSA9PiB7XG4gIGlmIChjdHhSYXcgPT09IHVuZGVmaW5lZCkgcmV0dXJuIGZhbGxiYWNrO1xuICBpZiAodHlwZW9mIGN0eFJhdyA9PT0gXCJzdHJpbmdcIikge1xuICAgIHRyeSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGN0eFJhdykgYXMgdW5rbm93bjtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcbiAgICAgICAgcmV0dXJuIChwYXJzZWQgYXMgdW5rbm93bltdKS5tYXAoU3RyaW5nKS5maWx0ZXIoKHMpID0+IHMudHJpbSgpICE9PSBcIlwiKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIHtcbiAgICAgIC8vIE5vdCBKU09OIOKAlCB0cmVhdCBhcyBjb21tYS1zZXBhcmF0ZWRcbiAgICB9XG4gICAgcmV0dXJuIGN0eFJhdy5zcGxpdChcIixcIikubWFwKChzKSA9PiBzLnRyaW0oKSkuZmlsdGVyKChzKSA9PiBzICE9PSBcIlwiKTtcbiAgfVxuICBpZiAoQXJyYXkuaXNBcnJheShjdHhSYXcpKSB7XG4gICAgcmV0dXJuIChjdHhSYXcgYXMgdW5rbm93bltdKS5tYXAoU3RyaW5nKS5maWx0ZXIoKHMpID0+IHMudHJpbSgpICE9PSBcIlwiKTtcbiAgfVxuICByZXR1cm4gZmFsbGJhY2s7XG59O1xuXG4vLyBBdXRvLXJlcGx5IGNoYW5uZWwgSURzIChmcm9tIGNvbnRleHQsIGNvbmZpZyBmaWxlLCBvciBlbnYgdmFyKS5cbi8vIC0tY29udGV4dCBhdXRvUmVwbHlDaGFubmVsSWRzPUMxMjMsQzQ1NiAgT1IgIFtcIkMxMjNcIixcIkM0NTZcIl0gSlNPTiBhcnJheVxuY29uc3QgYXV0b1JlcGx5Q2hhbm5lbElkczogc3RyaW5nW10gPSBwYXJzZUNoYW5uZWxJZENvbnRleHQoXG4gIGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJhdXRvUmVwbHlDaGFubmVsSWRzXCIpLFxuICBjb25maWc/LmF1dG9SZXBseUNoYW5uZWxJZHMgPz8gW11cbik7XG5cbi8vIE1lbnRpb24tYWxsb3dlZCBjaGFubmVsIElEcyAoZnJvbSBjb250ZXh0LCBjb25maWcgZmlsZSwgb3IgZW52IHZhcikuXG4vLyBXaGVuIHNldCwgYXBwX21lbnRpb24gZXZlbnRzIGZyb20gb3RoZXIgY2hhbm5lbHMgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4vLyAtLWNvbnRleHQgbWVudGlvbkNoYW5uZWxJZHM9QzEyMyxDNDU2ICBPUiAgW1wiQzEyM1wiLFwiQzQ1NlwiXSBKU09OIGFycmF5XG5jb25zdCBtZW50aW9uQ2hhbm5lbElkczogc3RyaW5nW10gPSBwYXJzZUNoYW5uZWxJZENvbnRleHQoXG4gIGFwcC5ub2RlLnRyeUdldENvbnRleHQoXCJtZW50aW9uQ2hhbm5lbElkc1wiKSxcbiAgY29uZmlnPy5tZW50aW9uQ2hhbm5lbElkcyA/PyBbXVxuKTtcblxuLy8gRXhlY3V0aW9uIGFnZW50IEFSTnMgKGZyb20gY29udGV4dCwgZW52IHZhcnMsIG9yIGNvbmZpZyBmaWxlKS5cbi8vIENESyAtLWNvbnRleHQgYWx3YXlzIHBhc3NlcyBzdHJpbmdzOyBKU09OLXBhcnNlIHdoZW4gbmVlZGVkLlxuY29uc3QgZXhlY3V0aW9uQWdlbnRBcm5zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gKCgpID0+IHtcbiAgY29uc3QgY3R4UmF3ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dChcImV4ZWN1dGlvbkFnZW50QXJuc1wiKTtcbiAgaWYgKGN0eFJhdyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgaWYgKHR5cGVvZiBjdHhSYXcgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBKU09OLnBhcnNlKGN0eFJhdykgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICByZXR1cm4ge307XG4gICAgICB9XG4gICAgfVxuICAgIGlmICh0eXBlb2YgY3R4UmF3ID09PSBcIm9iamVjdFwiICYmIGN0eFJhdyAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGN0eFJhdyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29uZmlnPy5leGVjdXRpb25BZ2VudEFybnMgPz8ge307XG59KSgpO1xuXG4vKipcbiAqIFNldCBsb2FkZWQgY29uZmlnIHZhbHVlcyB0byBDREsgY29udGV4dCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuICovXG5mdW5jdGlvbiBzZXRDb250ZXh0RnJvbUNvbmZpZyhjb25maWc6IENka0NvbmZpZyB8IG51bGwpOiB2b2lkIHtcbiAgaWYgKCFjb25maWcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBhcHAubm9kZS5zZXRDb250ZXh0KFwiYXdzUmVnaW9uXCIsIHJlZ2lvbik7XG4gIGFwcC5ub2RlLnNldENvbnRleHQoXCJiZWRyb2NrTW9kZWxJZFwiLCBjb25maWcuYmVkcm9ja01vZGVsSWQpO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwiZGVwbG95bWVudEVudlwiLCBkZXBsb3ltZW50RW52KTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcInZlcmlmaWNhdGlvblN0YWNrTmFtZVwiLCBiYXNlVmVyaWZpY2F0aW9uU3RhY2tOYW1lKTtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcInZlcmlmaWNhdGlvbkFjY291bnRJZFwiLCB2ZXJpZmljYXRpb25BY2NvdW50SWQpO1xuICBhcHAubm9kZS5zZXRDb250ZXh0KFwiZXhlY3V0aW9uQWNjb3VudElkXCIsIGV4ZWN1dGlvbkFjY291bnRJZCk7XG5cbiAgaWYgKGNvbmZpZy5zbGFja0JvdFRva2VuKSB7XG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dChcInNsYWNrQm90VG9rZW5cIiwgY29uZmlnLnNsYWNrQm90VG9rZW4pO1xuICB9XG4gIGlmIChjb25maWcuc2xhY2tTaWduaW5nU2VjcmV0KSB7XG4gICAgYXBwLm5vZGUuc2V0Q29udGV4dChcInNsYWNrU2lnbmluZ1NlY3JldFwiLCBjb25maWcuc2xhY2tTaWduaW5nU2VjcmV0KTtcbiAgfVxuICBhcHAubm9kZS5zZXRDb250ZXh0KFwidmVyaWZpY2F0aW9uQWdlbnROYW1lXCIsIHZlcmlmaWNhdGlvbkFnZW50TmFtZSk7XG4gIGlmIChPYmplY3Qua2V5cyhleGVjdXRpb25BZ2VudEFybnMpLmxlbmd0aCA+IDApIHtcbiAgICBhcHAubm9kZS5zZXRDb250ZXh0KFwiZXhlY3V0aW9uQWdlbnRBcm5zXCIsIGV4ZWN1dGlvbkFnZW50QXJucyk7XG4gIH1cbiAgaWYgKGF1dG9SZXBseUNoYW5uZWxJZHMubGVuZ3RoID4gMCkge1xuICAgIGFwcC5ub2RlLnNldENvbnRleHQoXCJhdXRvUmVwbHlDaGFubmVsSWRzXCIsIGF1dG9SZXBseUNoYW5uZWxJZHMpO1xuICB9XG59XG5cbnNldENvbnRleHRGcm9tQ29uZmlnKGNvbmZpZyk7XG5cbi8qKlxuICogR2V0IENESyBlbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG4gKi9cbmZ1bmN0aW9uIGdldERlZmF1bHRFbnYocmVnaW9uOiBzdHJpbmcpOiBjZGsuRW52aXJvbm1lbnQge1xuICByZXR1cm4ge1xuICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgcmVnaW9uOiByZWdpb24sXG4gIH07XG59XG5cbmNvbnN0IGRlZmF1bHRFbnYgPSBnZXREZWZhdWx0RW52KHJlZ2lvbik7XG5cbmZ1bmN0aW9uIGdldFN0YWNrRW52aXJvbm1lbnQoXG4gIGFjY291bnRJZDogc3RyaW5nLFxuICByZWdpb246IHN0cmluZyxcbiAgZGVmYXVsdEVudjogY2RrLkVudmlyb25tZW50LFxuKTogY2RrLkVudmlyb25tZW50IHtcbiAgcmV0dXJuIGFjY291bnRJZCA/IHsgYWNjb3VudDogYWNjb3VudElkLCByZWdpb246IHJlZ2lvbiB9IDogZGVmYXVsdEVudjtcbn1cblxuY29uc3QgdmVyaWZpY2F0aW9uRW52ID0gZ2V0U3RhY2tFbnZpcm9ubWVudChcbiAgdmVyaWZpY2F0aW9uQWNjb3VudElkLFxuICByZWdpb24sXG4gIGRlZmF1bHRFbnYsXG4pO1xuXG5jb25zdCBiZWRyb2NrTW9kZWxJZCA9IGdldENvbmZpZ1N0cmluZyhcbiAgXCJiZWRyb2NrTW9kZWxJZFwiLFxuICBcImpwLmFudGhyb3BpYy5jbGF1ZGUtc29ubmV0LTQtNS0yMDI1MDkyOS12MTowXCIsXG4pO1xuXG4vLyBTbGFjayBTZWFyY2ggQWdlbnQgQVJOIChvcHRpb25hbDsgc2V0IGFmdGVyIGRlcGxveWluZyBzbGFjay1zZWFyY2gtYWdlbnQgc3RhY2spXG5jb25zdCBzbGFja1NlYXJjaEFnZW50QXJuID1cbiAgcHJvY2Vzcy5lbnYuU0xBQ0tfU0VBUkNIX0FHRU5UX0FSTj8udHJpbSgpIHx8XG4gIGdldENvbmZpZ1N0cmluZyhcInNsYWNrU2VhcmNoQWdlbnRBcm5cIikgfHxcbiAgdW5kZWZpbmVkO1xuaWYgKHNsYWNrU2VhcmNoQWdlbnRBcm4pIHtcbiAgYXBwLm5vZGUuc2V0Q29udGV4dChcInNsYWNrU2VhcmNoQWdlbnRBcm5cIiwgc2xhY2tTZWFyY2hBZ2VudEFybik7XG59XG5cbi8vIENyZWF0ZSBWZXJpZmljYXRpb24gU3RhY2tcbm5ldyBWZXJpZmljYXRpb25TdGFjayhhcHAsIHZlcmlmaWNhdGlvblN0YWNrTmFtZSwge1xuICBlbnY6IHZlcmlmaWNhdGlvbkVudixcbiAgZXhlY3V0aW9uQWNjb3VudElkOiBleGVjdXRpb25BY2NvdW50SWQgfHwgdW5kZWZpbmVkLFxuICB2ZXJpZmljYXRpb25BZ2VudE5hbWU6IHZlcmlmaWNhdGlvbkFnZW50TmFtZSB8fCB1bmRlZmluZWQsXG4gIGV4ZWN1dGlvbkFnZW50QXJuczpcbiAgICBPYmplY3Qua2V5cyhleGVjdXRpb25BZ2VudEFybnMpLmxlbmd0aCA+IDAgPyBleGVjdXRpb25BZ2VudEFybnMgOiB1bmRlZmluZWQsXG4gIGJlZHJvY2tNb2RlbElkOiBiZWRyb2NrTW9kZWxJZCB8fCB1bmRlZmluZWQsXG4gIGF1dG9SZXBseUNoYW5uZWxJZHM6IGF1dG9SZXBseUNoYW5uZWxJZHMubGVuZ3RoID4gMCA/IGF1dG9SZXBseUNoYW5uZWxJZHMgOiB1bmRlZmluZWQsXG4gIG1lbnRpb25DaGFubmVsSWRzOiBtZW50aW9uQ2hhbm5lbElkcy5sZW5ndGggPiAwID8gbWVudGlvbkNoYW5uZWxJZHMgOiB1bmRlZmluZWQsXG4gIHNsYWNrU2VhcmNoQWdlbnRBcm46IHNsYWNrU2VhcmNoQWdlbnRBcm4gfHwgdW5kZWZpbmVkLFxufSk7XG5sb2dJbmZvKFwiVmVyaWZpY2F0aW9uIHN0YWNrIGNyZWF0ZWQuXCIsIHtcbiAgcGhhc2U6IFwic3RhY2tcIixcbiAgY29udGV4dDogeyBzdGFja05hbWU6IHZlcmlmaWNhdGlvblN0YWNrTmFtZSB9LFxufSk7XG5cbi8vIEVtaXQgY2xvdWQgYXNzZW1ibHlcbmFwcC5zeW50aCgpO1xuIl19