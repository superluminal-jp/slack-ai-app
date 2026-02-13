"""
CloudWatch Metrics Helper for Execution Agent.

Provides a singleton CloudWatch client and helper functions to emit
custom metrics from inside the AgentCore container.
"""

import json
import os
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from logger_util import get_logger, log

# Singleton CloudWatch client
_cloudwatch_client: Optional[Any] = None
_logger = get_logger()


def _get_cloudwatch_client():
    """
    Get or create singleton CloudWatch client.

    Returns:
        boto3 CloudWatch client instance
    """
    global _cloudwatch_client
    if _cloudwatch_client is None:
        region = os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
        _cloudwatch_client = boto3.client("cloudwatch", region_name=region)
    return _cloudwatch_client


def _log(level: str, event_type: str, data: Dict[str, Any]) -> None:
    """
    Structured JSON logging for CloudWatch metrics errors.

    Args:
        level: Log level (ERROR, WARN, INFO)
        event_type: Event type identifier
        data: Additional log data
    """
    log(_logger, level, event_type, {**data, "component": "cloudwatch_metrics"}, service="execution-agent")


def emit_metric(
    namespace: str,
    metric_name: str,
    value: float,
    unit: str = "Count",
    dimensions: Optional[List[Dict[str, str]]] = None,
) -> None:
    """
    Emit a custom CloudWatch metric.

    This function fails silently - it will not raise exceptions or crash
    the agent if metrics emission fails.

    Args:
        namespace: CloudWatch metric namespace (e.g., "SlackAIApp/Execution")
        metric_name: Name of the metric (e.g., "BedrockApiError")
        value: Metric value (typically 1.0 for count metrics)
        unit: Metric unit (default: "Count")
        dimensions: Optional list of dimension dictionaries
                    (e.g., [{"Name": "TeamId", "Value": "T123"}])
    """
    try:
        client = _get_cloudwatch_client()

        metric_data = {
            "MetricName": metric_name,
            "Value": value,
            "Unit": unit,
        }

        if dimensions:
            metric_data["Dimensions"] = dimensions

        client.put_metric_data(
            Namespace=namespace,
            MetricData=[metric_data],
        )

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        _log("ERROR", "cloudwatch_metric_emission_failed", {
            "namespace": namespace,
            "metric_name": metric_name,
            "error_code": error_code,
            "error_message": str(e),
        })
    except BotoCoreError as e:
        _log("ERROR", "cloudwatch_client_error", {
            "namespace": namespace,
            "metric_name": metric_name,
            "error_type": type(e).__name__,
            "error_message": str(e),
        })
    except Exception as e:
        _log("ERROR", "cloudwatch_unexpected_error", {
            "namespace": namespace,
            "metric_name": metric_name,
            "error_type": type(e).__name__,
            "error_message": str(e),
        })


# ─── Execution Agent Metric Names ───

# Metric names used in the execution pipeline
METRIC_BEDROCK_API_ERROR = "BedrockApiError"
METRIC_BEDROCK_TIMEOUT = "BedrockTimeout"
METRIC_BEDROCK_THROTTLING = "BedrockThrottling"
METRIC_ASYNC_TASK_CREATED = "AsyncTaskCreated"
METRIC_ASYNC_TASK_COMPLETED = "AsyncTaskCompleted"
METRIC_ASYNC_TASK_FAILED = "AsyncTaskFailed"
METRIC_ATTACHMENT_PROCESSED = "AttachmentProcessed"
METRIC_ATTACHMENT_FAILED = "AttachmentFailed"
