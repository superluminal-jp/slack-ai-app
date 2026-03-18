import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
/**
 * DynamoDB Export Job construct (040).
 *
 * Purpose: Trigger a daily full DynamoDB-to-S3 export at JST 00:00 (UTC 15:00)
 * via EventBridge Scheduler. Uses DynamoDB native ExportTableToPointInTime API
 * (requires PITR to be enabled on the source table).
 *
 * Responsibilities: Python Lambda that calls ExportTableToPointInTime;
 * EventBridge Schedule cron(0 15 * * ? *); least-privilege IAM.
 *
 * Inputs: DynamoDbExportJobProps (table, bucket).
 * Outputs: function (for CloudWatch alarm attachment in verification-stack).
 */
export interface DynamoDbExportJobProps {
    /** UsageHistory DynamoDB table. Must have PITR enabled. */
    table: dynamodb.ITable;
    /** UsageHistory S3 bucket. Exports written to dynamodb-exports/ prefix. */
    bucket: s3.IBucket;
}
export declare class DynamoDbExportJob extends Construct {
    readonly function: lambda.Function;
    constructor(scope: Construct, id: string, props: DynamoDbExportJobProps);
}
