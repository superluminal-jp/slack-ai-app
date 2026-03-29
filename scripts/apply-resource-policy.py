#!/usr/bin/env python3
"""
Apply resource policy on an AgentCore Agent Runtime.

Grants a specified IAM role permission to invoke the agent runtime via
the bedrock-agentcore-control PutResourcePolicy API. CloudFormation does
not support RuntimeResourcePolicy natively, so this script fills the gap.

Usage:
    python3 scripts/apply-resource-policy.py \
        --execution-agent-arn arn:aws:bedrock-agentcore:... \
        --verification-role-arn arn:aws:iam::123456789012:role/... \
        --account-id 123456789012

Exit codes:
    0  Success (or --dry-run)
    1  Missing arguments or boto3 import failure
    2  AWS API error
"""

import argparse
import json
import os
import sys

import boto3
from botocore.exceptions import ClientError


def build_policy(execution_agent_arn: str, verification_role_arn: str, account_id: str) -> dict:
    """Build the IAM-style resource policy document."""
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "AllowVerificationAgentInvoke",
                "Effect": "Allow",
                "Principal": {"AWS": verification_role_arn},
                "Action": "bedrock-agentcore:InvokeAgentRuntime",
                "Resource": execution_agent_arn,
                "Condition": {"StringEquals": {"aws:SourceAccount": account_id}},
            }
        ],
    }


def _put_resource_policy(
    client: object,
    *,
    resource_arn: str,
    policy_body: str,
    _depth: int = 0,
) -> None:
    """
    Invoke PutResourcePolicy.

    Some botocore builds wrap bedrock-agentcore-control in a delegate
    (e.g. BedrockAgentCoreControlPlaneFrontingLayer) that does not expose
    generated methods; fall back to _make_api_call or the inner client.
    """
    if _depth > 8:
        raise AttributeError("Excessive bedrock-agentcore-control client wrapper depth")
    args = {"resourceArn": resource_arn, "policy": policy_body}
    put = getattr(client, "put_resource_policy", None)
    if callable(put):
        put(**args)
        return
    make = getattr(client, "_make_api_call", None)
    if callable(make):
        make("PutResourcePolicy", args)
        return
    inner = getattr(client, "_client", None)
    if inner is not None and inner is not client:
        _put_resource_policy(
            inner,
            resource_arn=resource_arn,
            policy_body=policy_body,
            _depth=_depth + 1,
        )
        return
    raise AttributeError(
        f"{type(client).__name__} has no put_resource_policy, _make_api_call, or _client fallback"
    )


def apply_policy(execution_agent_arn: str, policy: dict, region: str | None = None) -> None:
    """Call PutResourcePolicy via boto3."""
    session = boto3.Session(region_name=region if region else None)
    client = session.client("bedrock-agentcore-control")
    try:
        _put_resource_policy(
            client,
            resource_arn=execution_agent_arn,
            policy_body=json.dumps(policy),
        )
    except AttributeError as exc:
        print(f"ERROR: boto3 client cannot invoke PutResourcePolicy: {exc}", file=sys.stderr)
        sys.exit(2)
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        msg = exc.response["Error"]["Message"]
        print(f"ERROR: AWS API error [{code}]: {msg}", file=sys.stderr)
        sys.exit(2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply resource policy on AgentCore Agent Runtime")
    parser.add_argument("--execution-agent-arn", required=True, help="Execution Agent Runtime ARN")
    parser.add_argument("--verification-role-arn", required=True, help="Verification Agent execution role ARN")
    parser.add_argument("--account-id", required=True, help="AWS account ID for confused-deputy condition")
    parser.add_argument("--region", default=os.environ.get("AWS_REGION", ""), help="AWS region (default: AWS_REGION env)")
    parser.add_argument("--dry-run", action="store_true", help="Print policy JSON without applying")
    args = parser.parse_args()

    policy = build_policy(args.execution_agent_arn, args.verification_role_arn, args.account_id)

    if args.dry_run:
        print(json.dumps(policy, indent=2))
        return

    apply_policy(args.execution_agent_arn, policy, args.region or None)
    print(f"Resource policy applied to {args.execution_agent_arn}")


if __name__ == "__main__":
    main()
