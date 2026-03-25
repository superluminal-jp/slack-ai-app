import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
/**
 * DynamoDB table for the agent registry.
 *
 * Each execution agent's deploy script writes its own entry via PutItem.
 * The verification agent reads all entries at startup via a single Query on PK=env.
 *
 * Partition key: env ("dev" or "prod")
 * Sort key: agent_id ("time", "docs", "fetch-url", "file-creator", "slack-search")
 */
export declare class AgentRegistryTable extends Construct {
    readonly table: dynamodb.Table;
    constructor(scope: Construct, id: string);
}
