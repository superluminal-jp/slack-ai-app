"""
CloudWatch Metrics Helper for Verification Agent.

Provides a singleton CloudWatch client and helper functions to emit
custom metrics from inside the AgentCore container.
"""

import json
import os
import time
from typing import Dict, List, Optional, Any
import boto3
from botocore.exceptions import ClientError, BotoCoreError


# Singleton CloudWatch client
_cloudwatch_client: Optional[Any] = None


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
    log_entry = {
        "level": level,
        "event_type": event_type,
        "service": "verification-agent",
        "component": "cloudwatch_metrics",
        "timestamp": time.time(),
        **data,
    }
    print(json.dumps(log_entry, default=str))


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
        namespace: CloudWatch metric namespace (e.g., "SlackAIApp/Verification")
        metric_name: Name of the metric (e.g., "ExistenceCheckFailed")
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


# ─── Verification Agent Metric Names ───

# Metric names used in the verification pipeline
METRIC_EXISTENCE_CHECK_FAILED = "ExistenceCheckFailed"
METRIC_WHITELIST_AUTHORIZATION_FAILED = "WhitelistAuthorizationFailed"
METRIC_RATE_LIMIT_EXCEEDED = "RateLimitExceeded"
METRIC_A2A_TASK_RECEIVED = "A2ATaskReceived"
METRIC_A2A_TASK_COMPLETED = "A2ATaskCompleted"
METRIC_A2A_TASK_FAILED = "A2ATaskFailed"
METRIC_SLACK_RESPONSE_POSTED = "SlackResponsePosted"
