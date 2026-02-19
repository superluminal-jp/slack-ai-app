import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";
/**
 * Agent Invoker Lambda construct (016).
 *
 * Purpose: Consume agent-invocation requests from SQS and invoke the Verification Agent
 * via AgentCore InvokeAgentRuntime. Decouples Slack event handler from agent execution.
 *
 * Responsibilities: Lambda triggered by SQS; call InvokeAgentRuntime; 900s timeout/visibility.
 *
 * Inputs: AgentInvokerProps (agentInvocationQueue, verificationAgentArn).
 *
 * Outputs: function.
 */
export interface AgentInvokerProps {
    /** SQS queue for agent invocation requests (agent-invocation-request). */
    agentInvocationQueue: sqs.IQueue;
    /** ARN of the Verification Agent Runtime to invoke. */
    verificationAgentArn: string;
}
export declare class AgentInvoker extends Construct {
    readonly function: lambda.Function;
    constructor(scope: Construct, id: string, props: AgentInvokerProps);
}
