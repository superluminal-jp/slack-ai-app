"""
DynamoDB Export Job Lambda handler.

Initiates a full DynamoDB-to-S3 export via ExportTableToPointInTime API.
Triggered daily by EventBridge Scheduler at JST 00:00 (UTC 15:00).

Fail-open: any exception is logged as WARNING and the function returns an error
status — it must never affect user Slack responses (Constitution IV).
"""

import datetime
import logging
import os

import boto3

_logger = logging.getLogger(__name__)


def lambda_handler(event: dict, context: object) -> dict:
    region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
    table_arn = os.environ["TABLE_ARN"]
    bucket_name = os.environ["EXPORT_BUCKET_NAME"]

    date_path = datetime.datetime.now(datetime.timezone.utc).strftime("%Y/%m/%d")
    s3_prefix = f"dynamodb-exports/{date_path}"

    try:
        ddb = boto3.client("dynamodb", region_name=region)
        response = ddb.export_table_to_point_in_time(
            TableArn=table_arn,
            S3Bucket=bucket_name,
            S3Prefix=s3_prefix,
            ExportFormat="DYNAMODB_JSON",
        )
        export_arn = response["ExportDescription"]["ExportArn"]
        _logger.info(
            "DynamoDB export initiated",
            extra={
                "export_arn": export_arn,
                "table_arn": table_arn,
                "s3_prefix": s3_prefix,
            },
        )
        return {"status": "export_initiated", "export_arn": export_arn}

    except Exception as exc:
        _logger.warning(
            "dynamodb_export_job: failed to initiate export (fail-open)",
            extra={
                "table_arn": table_arn,
                "s3_prefix": s3_prefix,
                "error": str(exc),
                "error_type": type(exc).__name__,
            },
        )
        return {"status": "error", "error": str(exc)}
