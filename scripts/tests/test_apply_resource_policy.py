"""Tests for scripts/apply-resource-policy.py."""

import json
import sys
from unittest.mock import MagicMock, patch

import importlib.util
from pathlib import Path

import pytest

# Load apply-resource-policy.py (hyphenated filename — not importable via standard import)
_spec = importlib.util.spec_from_file_location(
    "apply_resource_policy",
    Path(__file__).parent.parent / "apply-resource-policy.py",
)
arp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(arp)
sys.modules["apply_resource_policy"] = arp  # required for patch() target resolution


# ── Helpers ──────────────────────────────────────────────────────────────────

VALID_ARN = "arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:runtime/test-runtime"
VALID_ROLE = "arn:aws:iam::123456789012:role/VerificationRole"
VALID_ACCOUNT = "123456789012"
VALID_POLICY = arp.build_policy(VALID_ARN, VALID_ROLE, VALID_ACCOUNT)


# ── T003: ClientError → stderr + sys.exit(2) ─────────────────────────────────

class TestClientErrorHandling:
    def test_client_error_exits_with_code_2(self, capsys):
        from botocore.exceptions import ClientError

        error_response = {
            "Error": {"Code": "AccessDeniedException", "Message": "User is not authorized"}
        }
        mock_client = MagicMock()
        mock_client.put_resource_policy.side_effect = ClientError(error_response, "PutResourcePolicy")

        with patch("apply_resource_policy.boto3") as mock_boto3:
            mock_boto3.Session.return_value.client.return_value = mock_client
            with pytest.raises(SystemExit) as exc_info:
                arp.apply_policy(VALID_ARN, VALID_POLICY, "ap-northeast-1")

        assert exc_info.value.code == 2

    def test_client_error_writes_to_stderr(self, capsys):
        from botocore.exceptions import ClientError

        error_response = {
            "Error": {"Code": "AccessDeniedException", "Message": "User is not authorized"}
        }
        mock_client = MagicMock()
        mock_client.put_resource_policy.side_effect = ClientError(error_response, "PutResourcePolicy")

        with patch("apply_resource_policy.boto3") as mock_boto3:
            mock_boto3.Session.return_value.client.return_value = mock_client
            with pytest.raises(SystemExit):
                arp.apply_policy(VALID_ARN, VALID_POLICY, "ap-northeast-1")

        captured = capsys.readouterr()
        assert "AccessDeniedException" in captured.err
        assert "User is not authorized" in captured.err


# ── T004: region="" → boto3.Session(region_name=None) ────────────────────────

class TestRegionNoneConversion:
    def test_empty_string_region_passes_none_to_session(self):
        mock_client = MagicMock()

        with patch("apply_resource_policy.boto3") as mock_boto3:
            mock_boto3.Session.return_value.client.return_value = mock_client
            arp.apply_policy(VALID_ARN, VALID_POLICY, "")

        mock_boto3.Session.assert_called_once_with(region_name=None)

    def test_none_region_passes_none_to_session(self):
        mock_client = MagicMock()

        with patch("apply_resource_policy.boto3") as mock_boto3:
            mock_boto3.Session.return_value.client.return_value = mock_client
            arp.apply_policy(VALID_ARN, VALID_POLICY, None)

        mock_boto3.Session.assert_called_once_with(region_name=None)

    def test_valid_region_passed_through(self):
        mock_client = MagicMock()

        with patch("apply_resource_policy.boto3") as mock_boto3:
            mock_boto3.Session.return_value.client.return_value = mock_client
            arp.apply_policy(VALID_ARN, VALID_POLICY, "ap-northeast-1")

        mock_boto3.Session.assert_called_once_with(region_name="ap-northeast-1")


# ── T005: --dry-run → put_resource_policy not called ─────────────────────────

class TestDryRun:
    def test_dry_run_does_not_call_put_resource_policy(self, capsys):
        with patch("apply_resource_policy.boto3") as mock_boto3:
            mock_client = MagicMock()
            mock_boto3.Session.return_value.client.return_value = mock_client

            with patch(
                "sys.argv",
                [
                    "apply-resource-policy.py",
                    "--execution-agent-arn", VALID_ARN,
                    "--verification-role-arn", VALID_ROLE,
                    "--account-id", VALID_ACCOUNT,
                    "--dry-run",
                ],
            ):
                arp.main()

        mock_client.put_resource_policy.assert_not_called()

    def test_dry_run_prints_policy_json(self, capsys):
        with patch("apply_resource_policy.boto3"):
            with patch(
                "sys.argv",
                [
                    "apply-resource-policy.py",
                    "--execution-agent-arn", VALID_ARN,
                    "--verification-role-arn", VALID_ROLE,
                    "--account-id", VALID_ACCOUNT,
                    "--dry-run",
                ],
            ):
                arp.main()

        captured = capsys.readouterr()
        output = json.loads(captured.out)
        assert output["Version"] == "2012-10-17"
        assert output["Statement"][0]["Action"] == "bedrock-agentcore:InvokeAgentRuntime"
