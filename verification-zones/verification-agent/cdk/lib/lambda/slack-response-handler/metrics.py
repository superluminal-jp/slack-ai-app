"""
CloudWatch metrics utility for Slack Response Handler.

This module provides functionality to emit custom CloudWatch metrics
for monitoring Slack API calls and response handling.
"""

import json
import boto3
import os
from typing import Optional, Any

# Global CloudWatch client (lazy initialization)
_cloudwatch_client: Optional[Any] = None


def _get_cloudwatch_client():
    """Get or create CloudWatch client (singleton)."""
    global _cloudwatch_client
    if _cloudwatch_client is None:
        _cloudwatch_client = boto3.client(
            "cloudwatch", region_name=os.environ.get("AWS_REGION_NAME", "ap-northeast-1")
        )
    return _cloudwatch_client


def emit_metric(metric_name: str, value: float, unit: str = "Count") -> None:
    """
    Emit CloudWatch custom metric.

    Args:
        metric_name: Metric name (e.g., "SlackApiCall", "SlackApiFailure")
        value: Metric value
        unit: Metric unit (default: "Count")
    """
    try:
        client = _get_cloudwatch_client()
        client.put_metric_data(
            Namespace="SlackResponseHandler",
            MetricData=[
                {
                    "MetricName": metric_name,
                    "Value": value,
                    "Unit": unit,
                }
            ],
        )
    except Exception as e:
        # Log but don't fail on metric emission errors
        # Use print instead of logger to avoid circular dependency
        print(
            json.dumps(
                {
                    "level": "WARN",
                    "event_type": "cloudwatch_metric_emission_failed",
                    "data": {
                        "metric_name": metric_name,
                        "error": str(e),
                    },
                }
            )
        )

