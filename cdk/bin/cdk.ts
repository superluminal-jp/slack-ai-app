#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SlackBedrockStack } from "../lib/slack-bedrock-stack";

const app = new cdk.App();
new SlackBedrockStack(app, "SlackBedrockStack", {
  /* Use current CLI configuration for account and region */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
