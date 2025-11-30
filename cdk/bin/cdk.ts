#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SlackBedrockStack } from "../lib/slack-bedrock-stack";

const app = new cdk.App();

// Get region from CDK context (cdk.json)
const region = app.node.tryGetContext("awsRegion") || "ap-northeast-1";

new SlackBedrockStack(app, "SlackBedrockStack", {
  /* Deploy to region specified in cdk.json context */
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  },
});
