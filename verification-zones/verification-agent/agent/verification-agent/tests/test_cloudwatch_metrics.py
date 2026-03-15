"""
Unit tests for Verification Agent cloudwatch_metrics.py.

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


class TestVerificationMetrics:
    """Test CloudWatch metric emission for Verification Agent."""

    @patch("cloudwatch_metrics._get_cloudwatch_client")
    def test_emit_metric_calls_cloudwatch(self, mock_get_client):
        """emit_metric should call PutMetricData with correct args."""
        mock_cw = Mock()
        mock_get_client.return_value = mock_cw

        from cloudwatch_metrics import emit_metric

        emit_metric("SlackAI/VerificationAgent", "A2ATaskReceived", 1.0)

        mock_cw.put_metric_data.assert_called_once()
        call_kwargs = mock_cw.put_metric_data.call_args[1]
        assert call_kwargs["Namespace"] == "SlackAI/VerificationAgent"
        assert call_kwargs["MetricData"][0]["MetricName"] == "A2ATaskReceived"

    @patch("cloudwatch_metrics._get_cloudwatch_client")
    def test_emit_metric_silent_on_failure(self, mock_get_client):
        """Should not raise on CloudWatch API failure."""
        mock_cw = Mock()
        mock_cw.put_metric_data.side_effect = Exception("NetworkError")
        mock_get_client.return_value = mock_cw

        from cloudwatch_metrics import emit_metric

        # Should not raise
        emit_metric("SlackAI/VerificationAgent", "RateLimitExceeded", 1.0)

    @patch("cloudwatch_metrics.boto3.client")
    def test_singleton_client_reused(self, mock_boto_client):
        """Second call should reuse the cached client."""
        import cloudwatch_metrics
        cloudwatch_metrics._cloudwatch_client = None

        mock_cw = Mock()
        mock_boto_client.return_value = mock_cw

        client1 = cloudwatch_metrics._get_cloudwatch_client()
        client2 = cloudwatch_metrics._get_cloudwatch_client()

        # boto3.client should only be called once (singleton)
        mock_boto_client.assert_called_once()
        assert client1 is client2

    def test_metric_name_constants_defined(self):
        """Metric name constants should be defined."""
        from cloudwatch_metrics import (
            METRIC_EXISTENCE_CHECK_FAILED,
            METRIC_WHITELIST_AUTHORIZATION_FAILED,
            METRIC_RATE_LIMIT_EXCEEDED,
            METRIC_A2A_TASK_RECEIVED,
            METRIC_A2A_TASK_COMPLETED,
            METRIC_A2A_TASK_FAILED,
            METRIC_SLACK_RESPONSE_POSTED,
        )

        assert METRIC_EXISTENCE_CHECK_FAILED == "ExistenceCheckFailed"
        assert METRIC_WHITELIST_AUTHORIZATION_FAILED == "WhitelistAuthorizationFailed"
        assert METRIC_A2A_TASK_RECEIVED == "A2ATaskReceived"
        assert METRIC_SLACK_RESPONSE_POSTED == "SlackResponsePosted"
