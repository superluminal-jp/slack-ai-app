#!/usr/bin/env python3
"""
AWS Architecture Diagram Generator for Slack AI App.

Generates a professional AWS architecture diagram showing the Verification Zone
and Execution Zone with data flows, roles, and communication protocols.

Usage:
    cd docs/developer
    python generate-architecture-diagram.py

Output:
    docs/developer/aws-architecture.png

Requirements:
    pip install diagrams
    apt-get install graphviz
"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import SQS
from diagrams.aws.ml import Sagemaker
from diagrams.aws.management import Cloudwatch
from diagrams.aws.security import SecretsManager
from diagrams.aws.storage import S3
from diagrams.aws.general import Users
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

graph_attr = {
    "fontsize": "16",
    "fontname": "Noto Sans CJK JP, Hiragino Sans, sans-serif",
    "bgcolor": "white",
    "pad": "0.5",
    "nodesep": "0.7",
    "ranksep": "1.0",
}

node_attr = {
    "fontsize": "10",
    "fontname": "Noto Sans CJK JP, Hiragino Sans, sans-serif",
}

edge_attr = {
    "fontsize": "9",
    "fontname": "Noto Sans CJK JP, Hiragino Sans, sans-serif",
    "labelfontsize": "9",
}

with Diagram(
    "Slack AI App — AWS アーキテクチャ構成図",
    filename=os.path.join(SCRIPT_DIR, "aws-architecture"),
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
    outformat="png",
):
    # ── Slack Workspace (top) ──
    slack = Users("Slack ワークスペース\n@AIアプリ名 質問\n(添付ファイル対応)")

    # ── Verification Zone (Account A) ──
    with Cluster(
        "検証ゾーン — Verification Zone  (Account A)",
        graph_attr={
            "style": "rounded",
            "bgcolor": "#FFF8E1",
            "pencolor": "#FF8F00",
            "penwidth": "2.5",
            "fontsize": "15",
            "fontcolor": "#E65100",
            "labeljust": "l",
        },
    ):
        with Cluster(
            "Slack イベント受信・検証",
            graph_attr={
                "style": "rounded,dashed",
                "bgcolor": "#FFF3E0",
                "pencolor": "#EF6C00",
                "fontsize": "11",
            },
        ):
            event_handler = Lambda(
                "SlackEventHandler\nLambda + Function URL\n"
                "──────────────\n"
                "署名検証 (HMAC SHA256)\n"
                "Existence Check (鍵2)\n"
                "重複排除 / レート制限\n"
                "👀 リアクション付与"
            )

            secrets = SecretsManager(
                "Secrets Manager\n──────────\n"
                "Signing Secret (鍵1)\n"
                "Bot Token (鍵2)"
            )

            dynamo = Dynamodb(
                "DynamoDB (5テーブル)\n──────────\n"
                "event-dedupe (重複排除)\n"
                "existence-cache (5分TTL)\n"
                "rate-limit (スロットリング)\n"
                "whitelist (認可)\n"
                "tokens (管理)"
            )

        with Cluster(
            "非同期エージェント処理",
            graph_attr={
                "style": "rounded,dashed",
                "bgcolor": "#FBE9E7",
                "pencolor": "#BF360C",
                "fontsize": "11",
            },
        ):
            sqs_invoke = SQS(
                "Agent Invocation\nQueue (SQS)\n──────────\n"
                "非同期呼び出し\nDLQ: 3回リトライ"
            )

            invoker = Lambda(
                "Agent Invoker\nLambda\n──────────\n"
                "SQS → AgentCore\n"
                "タイムアウト: 900s"
            )

            v_agent = Sagemaker(
                "Verification Agent\nAgentCore Runtime (A2A)\n──────────\n"
                "セキュリティ検証\n"
                "Execution Agent 呼び出し\n"
                "Python 3.11 / ARM64"
            )

        with Cluster(
            "レスポンス投稿",
            graph_attr={
                "style": "rounded,dashed",
                "bgcolor": "#E1F5FE",
                "pencolor": "#0277BD",
                "fontsize": "11",
            },
        ):
            sqs_post = SQS("Slack Post\nQueue (SQS)")

            poster = Lambda(
                "Slack Poster\nLambda\n──────────\n"
                "chat.postMessage\n"
                "👀→✅ リアクション\n"
                "メッセージ分割 (4000字)"
            )

        s3_file = S3(
            "File Exchange (S3)\n──────────\n"
            "添付ファイル一時保管\n"
            "SSE-S3 暗号化\n"
            "1日自動削除"
        )

    # ── Execution Zone (Account B) ──
    with Cluster(
        "実行ゾーン — Execution Zone  (Account B)",
        graph_attr={
            "style": "rounded",
            "bgcolor": "#E8F5E9",
            "pencolor": "#2E7D32",
            "penwidth": "2.5",
            "fontsize": "15",
            "fontcolor": "#1B5E20",
            "labeljust": "l",
        },
    ):
        e_agent = Sagemaker(
            "Execution Agent\nAgentCore Runtime (A2A)\n──────────\n"
            "Bedrock Converse API 呼び出し\n"
            "添付ファイル処理\n"
            "画像分析 / ドキュメント抽出\n"
            "Python 3.11 / ARM64"
        )

        bedrock = Sagemaker(
            "Amazon Bedrock\nConverse API\n──────────\n"
            "Foundation Model\n"
            "(Claude / Nova)\n"
            "マルチモーダル対応\n"
            "Guardrails"
        )

    # ── Monitoring ──
    cw = Cloudwatch(
        "CloudWatch\n──────────\n"
        "メトリクス / アラーム\n"
        "構造化ログ (相関ID)"
    )

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # Data Flow (numbered sequence)
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    # [1] Slack → SlackEventHandler
    slack >> Edge(
        label="① HTTPS POST (同期)\nX-Slack-Signature (HMAC SHA256)",
        color="#1565C0",
        style="bold",
        penwidth="2.0",
    ) >> event_handler

    # SlackEventHandler ↔ Secrets
    event_handler - Edge(
        label="シークレット取得",
        color="#7B1FA2",
        style="dashed",
    ) - secrets

    # SlackEventHandler ↔ DynamoDB
    event_handler - Edge(
        label="検証・認可・重複排除",
        color="#FF8F00",
        style="dashed",
    ) - dynamo

    # [2] SlackEventHandler → SQS
    event_handler >> Edge(
        label="② SQS SendMessage\n(即座応答後・非同期)",
        color="#E65100",
        style="bold",
    ) >> sqs_invoke

    # [3] SQS → Agent Invoker
    sqs_invoke >> Edge(
        label="③ SQS トリガー\n(バッチサイズ: 1)",
        color="#E65100",
    ) >> invoker

    # [4] Agent Invoker → Verification Agent
    invoker >> Edge(
        label="④ InvokeAgentRuntime\n(A2A / SigV4)",
        color="#D32F2F",
        style="bold",
    ) >> v_agent

    # Verification Agent ↔ S3
    v_agent - Edge(
        label="添付ファイル UP/DL\n(Pre-signed URL)",
        color="#00695C",
        style="dashed",
    ) - s3_file

    # [5] Verification Agent → Execution Agent
    v_agent >> Edge(
        label="⑤ A2A 呼び出し (HTTPS + SigV4)\nクロスアカウント対応",
        color="#D32F2F",
        style="bold",
        penwidth="2.5",
    ) >> e_agent

    # S3 ↔ Execution Agent
    s3_file - Edge(
        label="添付ファイル DL\n(Pre-signed URL)",
        color="#00695C",
        style="dashed",
    ) - e_agent

    # [6] Execution Agent → Bedrock
    e_agent >> Edge(
        label="⑥ Converse API (テキスト+画像)\nInvokeModel",
        color="#2E7D32",
        style="bold",
    ) >> bedrock

    # [7] Bedrock → Execution Agent → Verification Agent (response)
    bedrock >> Edge(
        label="⑦ AI レスポンス",
        color="#2E7D32",
        style="dashed",
    ) >> e_agent

    # [8] Verification Agent → Slack Poster SQS
    v_agent >> Edge(
        label="⑧ SQS\n投稿リクエスト",
        color="#E65100",
    ) >> sqs_post

    # [9] SQS → Slack Poster
    sqs_post >> Edge(
        label="⑨ SQS トリガー",
        color="#E65100",
    ) >> poster

    # [10] Slack Poster → Slack
    poster >> Edge(
        label="⑩ HTTPS POST\nchat.postMessage (スレッド返信)\n👀→✅ リアクション更新",
        color="#1565C0",
        style="bold",
        penwidth="2.0",
    ) >> slack

    # CloudWatch (monitoring)
    event_handler - Edge(style="dotted", color="#9E9E9E") - cw
    v_agent - Edge(style="dotted", color="#9E9E9E") - cw
    e_agent - Edge(style="dotted", color="#9E9E9E") - cw

print(f"Diagram generated: {os.path.join(SCRIPT_DIR, 'aws-architecture.png')}")
