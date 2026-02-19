"""
Unit tests for Execution Agent cloudwatch_metrics.py.

Tests:
- Metric emission with correct namespace
- Silent failure handling
- Singleton client behavior
"""

import os
import sys
from unittest.mock import Mock, patch

import pytest

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestEmitMetric:
    """Test CloudWatch metric emission."""

    @patch("cloudwatch_metrics._get_cloudwatch_client")
    def test_emit_metric_calls_put_metric_data(self, mock_get_client):
        """emit_metric should call CloudWatch PutMetricData."""
        mock_cw = Mock()
        mock_get_client.return_value = mock_cw

        from cloudwatch_metrics import emit_metric

        emit_metric("SlackAI/ExecutionAgent", "BedrockApiError", 1.0)

        mock_cw.put_metric_data.assert_called_once()
        call_kwargs = mock_cw.put_metric_data.call_args[1]
        assert call_kwargs["Namespace"] == "SlackAI/ExecutionAgent"
        assert call_kwargs["MetricData"][0]["MetricName"] == "BedrockApiError"
        assert call_kwargs["MetricData"][0]["Value"] == 1.0

    @patch("cloudwatch_metrics._get_cloudwatch_client")
    def test_emit_metric_silent_on_error(self, mock_get_client):
        """emit_metric should not raise on CloudWatch errors."""
        mock_cw = Mock()
        mock_cw.put_metric_data.side_effect = Exception("CloudWatch down")
        mock_get_client.return_value = mock_cw

        from cloudwatch_metrics import emit_metric

        # Should not raise
        emit_metric("SlackAI/ExecutionAgent", "AsyncTaskFailed", 1.0)

    @patch("cloudwatch_metrics._get_cloudwatch_client")
    def test_emit_metric_with_dimensions(self, mock_get_client):
        """emit_metric should pass dimensions to PutMetricData."""
        mock_cw = Mock()
        mock_get_client.return_value = mock_cw

        from cloudwatch_metrics import emit_metric

        dims = [{"Name": "TeamId", "Value": "T123"}]
        emit_metric("SlackAI/ExecutionAgent", "AsyncTaskCreated", 1.0, dimensions=dims)

        call_kwargs = mock_cw.put_metric_data.call_args[1]
        assert call_kwargs["MetricData"][0]["Dimensions"] == dims

    @patch("cloudwatch_metrics._get_cloudwatch_client")
    def test_emit_metric_default_unit_is_count(self, mock_get_client):
        """Default unit should be 'Count'."""
        mock_cw = Mock()
        mock_get_client.return_value = mock_cw

        from cloudwatch_metrics import emit_metric

        emit_metric("SlackAI/ExecutionAgent", "AttachmentProcessed", 1.0)

        call_kwargs = mock_cw.put_metric_data.call_args[1]
        assert call_kwargs["MetricData"][0]["Unit"] == "Count"

    def test_metric_name_constants_defined(self):
        """Metric name constants should be defined."""
        from cloudwatch_metrics import (
            METRIC_BEDROCK_API_ERROR,
            METRIC_BEDROCK_TIMEOUT,
            METRIC_BEDROCK_THROTTLING,
            METRIC_ASYNC_TASK_CREATED,
            METRIC_ASYNC_TASK_COMPLETED,
            METRIC_ASYNC_TASK_FAILED,
        )

        assert METRIC_BEDROCK_API_ERROR == "BedrockApiError"
        assert METRIC_ASYNC_TASK_CREATED == "AsyncTaskCreated"

    @patch("cloudwatch_metrics.boto3.client")
    def test_singleton_client_created_once(self, mock_boto_client):
        """_get_cloudwatch_client should use singleton pattern."""
        import cloudwatch_metrics
        cloudwatch_metrics._cloudwatch_client = None  # Reset singleton

        mock_cw = Mock()
        mock_boto_client.return_value = mock_cw

        client1 = cloudwatch_metrics._get_cloudwatch_client()
        client2 = cloudwatch_metrics._get_cloudwatch_client()

        # boto3.client should only be called once
        mock_boto_client.assert_called_once()
        assert client1 is client2
