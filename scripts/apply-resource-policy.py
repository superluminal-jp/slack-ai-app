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
import subprocess
import sys

import boto3
from botocore.exceptions import ClientError
from botocore.model import OperationNotFoundError


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


def _service_has_operation(client: object, operation_name: str) -> bool:
    """True if this botocore client's service model lists the operation (API name)."""
    try:
        meta = getattr(client, "meta", None)
        if meta is None:
            return False
        sm = getattr(meta, "service_model", None)
        if sm is None:
            return False
        return operation_name in sm.operation_names
    except Exception:
        return False


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
    generated methods. The delegate may also expose _make_api_call bound to a
    stale service model without PutResourcePolicy — unwrap _client first, then
    call put_resource_policy or _make_api_call only when the model includes
    PutResourcePolicy.
    """
    if _depth > 8:
        raise AttributeError("Excessive bedrock-agentcore-control client wrapper depth")
    args = {"resourceArn": resource_arn, "policy": policy_body}
    put = getattr(client, "put_resource_policy", None)
    if callable(put):
        put(**args)
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
    make = getattr(client, "_make_api_call", None)
    if callable(make) and _service_has_operation(client, "PutResourcePolicy"):
        make("PutResourcePolicy", args)
        return
    raise AttributeError(
        f"{type(client).__name__} has no usable PutResourcePolicy "
        f"(upgrade boto3/botocore, or use AWS CLI v2 put-resource-policy)"
    )


def _put_resource_policy_via_aws_cli(
    resource_arn: str,
    policy_body: str,
    region: str | None,
) -> None:
    """
    Invoke PutResourcePolicy via AWS CLI v2.

    The CLI ships with service definitions that often include bedrock-agentcore-control
    operations missing from older botocore (e.g. BedrockAgentCoreControlPlaneFrontingLayer).
    """
    cmd = [
        "aws",
        "bedrock-agentcore-control",
        "put-resource-policy",
        "--resource-arn",
        resource_arn,
        "--policy",
        policy_body,
    ]
    if region:
        cmd.extend(["--region", region])
    try:
        proc = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            env=os.environ.copy(),
        )
    except FileNotFoundError as exc:
        raise FileNotFoundError(
            "aws CLI not found in PATH; install AWS CLI v2 "
            "(https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)"
        ) from exc
    except subprocess.CalledProcessError as exc:
        err = (exc.stderr or exc.stdout or "").strip() or str(exc)
        raise RuntimeError(err) from exc
    if proc.stdout.strip():
        print(proc.stdout, end="")


def apply_policy(execution_agent_arn: str, policy: dict, region: str | None = None) -> None:
    """Call PutResourcePolicy via boto3, falling back to AWS CLI when botocore lacks the API."""
    policy_body = json.dumps(policy)
    session = boto3.Session(region_name=region if region else None)
    client = session.client("bedrock-agentcore-control")
    try:
        _put_resource_policy(
            client,
            resource_arn=execution_agent_arn,
            policy_body=policy_body,
        )
    except (AttributeError, OperationNotFoundError) as exc:
        print(
            f"[INFO] boto3 cannot call PutResourcePolicy ({type(exc).__name__}: {exc}); "
            "using AWS CLI put-resource-policy.",
            file=sys.stderr,
        )
        try:
            _put_resource_policy_via_aws_cli(execution_agent_arn, policy_body, region)
        except FileNotFoundError as fnf:
            print(f"ERROR: {fnf}", file=sys.stderr)
            sys.exit(2)
        except RuntimeError as run_exc:
            print(f"ERROR: AWS CLI failed: {run_exc}", file=sys.stderr)
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
