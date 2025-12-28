# アーキテクチャ詳細と実装例

## 7.実装例（Bedrock 統合 + response_url 非同期処理）

## 7.0 Existence Check 実装（Two-Key Defense - 鍵2）

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/existence_check.py`

Existence Check は Two-Key Defense モデルの第二の鍵として、Slack API を使用して team_id, user_id, channel_id の実在性を動的に確認します。

**実装フロー**:

1. **キャッシュチェック**: DynamoDB からキャッシュエントリを取得（5分TTL）
2. **Slack API 呼び出し**: キャッシュミスの場合、以下の API を順次呼び出し:
   - `team.info(team=team_id)`: ワークスペースの存在確認
   - `users.info(user=user_id)`: ユーザーの存在確認
   - `conversations.info(channel=channel_id)`: チャンネルの存在確認
3. **エラーハンドリング**:
   - レート制限（429）: 指数バックオフで最大3回リトライ（1s, 2s, 4s）
   - タイムアウト: 2秒でタイムアウト、fail-closed（リクエスト拒否）
   - その他のエラー: fail-closed（リクエスト拒否）
4. **キャッシュ保存**: 検証成功時、DynamoDB に5分TTLで保存

**DynamoDB テーブル**: `slack-existence-check-cache`
- Partition Key: `cache_key` (String, 形式: `{team_id}#{user_id}#{channel_id}`)
- TTL Attribute: `ttl` (Number, Unix timestamp)
- Billing Mode: PAY_PER_REQUEST

**CloudWatch メトリクス**:
- `ExistenceCheckFailed`: 失敗回数
- `ExistenceCheckCacheHit`: キャッシュヒット回数
- `ExistenceCheckCacheMiss`: キャッシュミス回数
- `SlackAPILatency`: Slack API 呼び出しレイテンシ（ミリ秒）

**CloudWatch アラーム**:
- `ExistenceCheckFailedAlarm`: 5分間に5回以上失敗した場合にトリガー

## 7.1 SlackEventHandler（検証層 Verification Layer） - API Gateway呼び出し版

| ID         | 要件                                 | 目標値                       | 測定方法                           |
| ---------- | ------------------------------------ | ---------------------------- | ---------------------------------- |
| NFR-01     | 署名検証レイテンシ                   | ≤50ms（p99）                 | CloudWatch メトリクス              |
| NFR-02     | シークレットローテーション           | 90 日ごと                    | AWS Secrets Manager                |
| NFR-03     | 認証失敗アラートレイテンシ           | ≤1 分                        | CloudWatch アラーム                |
| NFR-04     | セキュリティログ保持                 | 365 日                       | S3 + Glacier                       |
| NFR-05     | IAM ポリシーレビュー                 | 30 日ごと                    | 手動監査                           |
| NFR-06     | 脆弱性スキャン                       | 週次                         | Snyk、Trivy                        |
| NFR-07     | ペネトレーションテスト               | 四半期ごと                   | 外部企業                           |
| **NFR-08** | **Bedrock 呼び出しレイテンシ**       | **≤5 秒（p95）**             | **CloudWatch メトリクス**          |
| **NFR-09** | **ユーザー単位 Bedrock コスト**      | **≤$10/月**                  | **Cost Explorer**                  |
| **NFR-10** | **コンテキスト履歴暗号化**           | **すべての DynamoDB データ** | **KMS 暗号化確認**                 |

---

# 8. アーキテクチャ詳細

## 8.1 BedrockProcessor（実行層 Execution Layer）

**目的**: Bedrock API を呼び出して AI 機能を提供（会話、画像生成、コード生成、データ分析など）

**セキュリティ管理**:

- 最小権限 IAM ロール（Bedrock 呼び出しのみ）
- Bedrock Guardrails 適用（60 言語対応、Automated Reasoning 99%精度）
- トークン数制限（モデル最大値: Claude 4.5/Nova Pro は 8192 トークン）
- コンテキスト履歴の暗号化（DynamoDB + KMS）
- ユーザー単位のコンテキスト ID 分離
- CloudTrail ログ（すべての Bedrock API 呼び出し）
- X-Ray トレース（パフォーマンス監視）

**IAM ロールポリシー**（Bedrock アクセス）:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeBedrockModel",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::inference-profile/us.anthropic.claude-sonnet-4-5-20250929-v1:0" // 要件に応じてモデルを選択
      ]
      ]
    },
    {
      "Sid": "ApplyGuardrails",
      "Effect": "Allow",
      "Action": ["bedrock:ApplyGuardrail"],
      "Resource": [
        "arn:aws:bedrock:us-east-1:123456789012:guardrail/slack-ai-guardrail"
      ]
    },
    {
      "Sid": "ManageConversationHistory",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:123456789012:table/ConversationContexts"
      ],
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${aws:principalarn}"]
        }
      }
    },
    {
      "Sid": "WriteLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:123456789012:log-group:/aws/lambda/ai-conversation:*"
    }
  ]
}
```

---

### SlackEventHandler（検証層 Verification Layer） - Python 実装

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/handler.py`

SlackEventHandler は署名検証、Existence Check、認可を行い、即座に応答を返してから ExecutionApi (API Gateway) を呼び出します:

**Two-Key Defense 実装**:
- **鍵1**: HMAC SHA256 署名検証（Signing Secret）
- **鍵2**: Slack API Existence Check（Bot Token） - team_id, user_id, channel_id の実在性確認

**Execution API 認証**:
- **デフォルト**: APIキー認証（環境変数 `EXECUTION_API_AUTH_METHOD=api_key`）
- **代替**: IAM認証（環境変数 `EXECUTION_API_AUTH_METHOD=iam`）
- APIキーは AWS Secrets Manager から取得（`secrets_manager_client.py`）
- IAM認証の場合は SigV4 署名を使用（`api_gateway_client.py`）

```python
"""
Verification Layer (検証層) - 信頼境界の強制 + 非同期Lambda呼び出し。

このモジュールはSlack署名を検証し、リクエストを認可し、
即座に応答を返してからExecutionApi (API Gateway) を呼び出します。
"""

import hashlib
import hmac
import json
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any
import boto3
import urllib.parse

# AWSクライアント初期化
secretsmanager = boto3.client("secretsmanager")
lambda_client = boto3.client("lambda")


class SignatureVerificationError(Exception):
    """署名検証が失敗した場合に発生。"""
    pass


class AuthorizationError(Exception):
    """認可が失敗した場合に発生。"""
    pass


def verify_slack_signature(
    signing_secret: str,
    timestamp: str,
    body: str,
    signature: str
) -> bool:
    """
    HMAC SHA256を使用してSlackリクエスト署名を検証する。

    Args:
        signing_secret: AWS Secrets ManagerからのSlack署名シークレット
        timestamp: X-Slack-Request-Timestampヘッダー値
        body: 生のリクエストボディ（文字列）
        signature: X-Slack-Signatureヘッダー値

    Returns:
        署名が有効でタイムスタンプが新しい場合はTrue

    Raises:
        SignatureVerificationError: タイムスタンプが古い（>5分）場合
    """
    # タイムスタンプの新鮮さを検証（リプレイアタック防止）
    current_time = int(time.time())
    request_time = int(timestamp)

    if abs(current_time - request_time) > 300:  # 5分
        raise SignatureVerificationError(
            f"タイムスタンプが古すぎます: {abs(current_time - request_time)}秒"
        )

    # 期待される署名を計算
    basestring = f"v0:{timestamp}:{body}".encode("utf-8")
    expected_signature = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256
    ).hexdigest()

    # 定数時間比較（タイミング攻撃を防止）
    return hmac.compare_digest(expected_signature, signature)


def get_signing_secret() -> str:
    """
    AWS Secrets ManagerからSlack署名シークレットを取得する。

    Returns:
        署名シークレット文字列

    Raises:
        ValueError: シークレットが見つからない、または無効な形式の場合
    """
    try:
        response = secretsmanager.get_secret_value(SecretId="slack/signing-secret")
        secret_data = json.loads(response["SecretString"])
        return secret_data["secret"]
    except Exception as e:
        raise ValueError(f"署名シークレットの取得に失敗しました: {e}")


def authorize_request(
    team_id: Optional[str],
    user_id: Optional[str],
    channel_id: Optional[str],
) -> AuthorizationResult:
    """
    柔軟なホワイトリストベースの認可を実行する。
    
    条件付きAND条件: 設定されているエンティティのみをチェック
    - ホワイトリストが完全に空の場合: すべてのリクエストを許可
    - エンティティがホワイトリストに設定されている場合のみチェック
    - 設定されていないエンティティはスキップ（チェックしない）
    - 設定されているエンティティがすべて認可済みの場合のみ許可

    Args:
        team_id: Slackワークスペース/チームID（オプション）
        user_id: SlackユーザーID（オプション）
        channel_id: SlackチャネルID（オプション）

    Returns:
        AuthorizationResult: 認可結果（authorized, unauthorized_entities等を含む）

    Note:
        - ホワイトリスト設定は DynamoDB > Secrets Manager > 環境変数 の優先順位で読み込み
        - 設定はメモリ内に5分間キャッシュ（TTL: 300秒）
    """
    from whitelist_loader import load_whitelist_config
    
    # ホワイトリスト設定を読み込み（キャッシュから）
    whitelist = load_whitelist_config()
    
    # 空のホワイトリスト = すべてのリクエストを許可
    total_entries = len(whitelist["team_ids"]) + len(whitelist["user_ids"]) + len(whitelist["channel_ids"])
    if total_entries == 0:
        return AuthorizationResult(authorized=True, team_id=team_id, user_id=user_id, channel_id=channel_id)
    
    # 条件付きAND条件: 設定されているエンティティのみをチェック
    unauthorized_entities = []
    
    # team_id がホワイトリストに設定されている場合のみチェック
    if len(whitelist["team_ids"]) > 0:
        if not team_id or team_id not in whitelist["team_ids"]:
            unauthorized_entities.append("team_id")
    
    # user_id がホワイトリストに設定されている場合のみチェック
    if len(whitelist["user_ids"]) > 0:
        if not user_id or user_id not in whitelist["user_ids"]:
            unauthorized_entities.append("user_id")
    
    # channel_id がホワイトリストに設定されている場合のみチェック
    if len(whitelist["channel_ids"]) > 0:
        if not channel_id or channel_id not in whitelist["channel_ids"]:
            unauthorized_entities.append("channel_id")
    
    if len(unauthorized_entities) == 0:
        return AuthorizationResult(authorized=True, team_id=team_id, user_id=user_id, channel_id=channel_id)
    else:
        return AuthorizationResult(
            authorized=False,
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id,
            unauthorized_entities=unauthorized_entities,
        )


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    SlackEventHandlerエントリーポイント - Verification Layer (検証層)。

    即座に200を返し、ExecutionApi (API Gateway) を呼び出す。

    Args:
        event: API Gatewayイベント
        context: Lambdaコンテキスト

    Returns:
        API Gatewayレスポンス（即座に返す）

    Raises:
        None（すべてのエラーをキャッチしてHTTPレスポンスとして返す）
    """
    correlation_id = context.aws_request_id

    try:
        # ヘッダーとボディを抽出
        headers = event.get("headers", {})
        body = event.get("body", "")

        signature = headers.get("X-Slack-Signature", "")
        timestamp = headers.get("X-Slack-Request-Timestamp", "")

        # 署名を検証
        signing_secret = get_signing_secret()
        if not verify_slack_signature(signing_secret, timestamp, body, signature):
            print(json.dumps({
                "level": "WARN",
                "event": "signature_verification_failed",
                "correlation_id": correlation_id
            }))
            return {
                "statusCode": 401,
                "body": json.dumps({"text": "無効な署名"})
            }

        # リクエストをパース（URLエンコードされたボディ）
        parsed_body = dict(
            item.split("=")
            for item in body.split("&")
            if "=" in item
        )

        # URLデコード
        team_id = urllib.parse.unquote_plus(parsed_body.get("team_id", ""))
        user_id = urllib.parse.unquote_plus(parsed_body.get("user_id", ""))
        channel_id = urllib.parse.unquote_plus(parsed_body.get("channel_id", ""))
        text = urllib.parse.unquote_plus(parsed_body.get("text", ""))
        response_url = urllib.parse.unquote_plus(parsed_body.get("response_url", ""))

        # Existence Check (Two-Key Defense - 鍵2)
        # Bot Tokenを使用してteam_id, user_id, channel_idの実在性を確認
        from existence_check import check_entity_existence, ExistenceCheckError
        
        bot_token = get_bot_token(team_id)  # DynamoDBまたは環境変数から取得
        if bot_token:
            try:
                check_entity_existence(
                    bot_token=bot_token,
                    team_id=team_id,
                    user_id=user_id,
                    channel_id=channel_id,
                )
            except ExistenceCheckError as e:
                print(json.dumps({
                    "level": "ERROR",
                    "event": "existence_check_failed",
                    "correlation_id": correlation_id,
                    "team_id": team_id,
                    "user_id": user_id,
                    "channel_id": channel_id,
                    "error": str(e)
                }))
                return {
                    "statusCode": 403,
                    "body": json.dumps({"text": "エンティティ検証に失敗しました"})
                }
        
        # ホワイトリスト認可 (3c): エンティティがホワイトリストに含まれているか確認
        from authorization import authorize_request, AuthorizationError
        
        auth_result = authorize_request(
            team_id=team_id,
            user_id=user_id,
            channel_id=channel_id,
        )
        
        if not auth_result.authorized:
            # 認可失敗 - リクエストを拒否（fail-closed）
            print(json.dumps({
                "level": "ERROR",
                "event": "whitelist_authorization_failed",
                "correlation_id": correlation_id,
                "team_id": team_id,
                "user_id": user_id,
                "channel_id": channel_id,
                "unauthorized_entities": auth_result.unauthorized_entities,
            }))
            return {
                "statusCode": 403,
                "body": json.dumps({"text": "認可に失敗しました"})
            }
        
        # 認可成功 - 処理を継続
        print(json.dumps({
            "level": "INFO",
            "event": "whitelist_authorization_success",
            "correlation_id": correlation_id,
            "team_id": team_id,
            "user_id": user_id,
            "channel_id": channel_id,
        }))

        # ExecutionApi (API Gateway) を呼び出し
        # 認証方法は環境変数 EXECUTION_API_AUTH_METHOD で制御（デフォルト: api_key）
        # IAM認証: SigV4署名を使用
        # APIキー認証: Secrets Managerから取得したAPIキーをx-api-keyヘッダーに設定
        from api_gateway_client import invoke_execution_api
        
        execution_api_url = os.environ.get("EXECUTION_API_URL")
        auth_method = os.environ.get("EXECUTION_API_AUTH_METHOD", "api_key").lower()
        api_key_secret_name = os.environ.get("EXECUTION_API_KEY_SECRET_NAME", "execution-api-key")
        
        payload = {
            "channel": channel_id,
            "text": text,
            "bot_token": bot_token,
            "thread_ts": thread_ts,  # スレッドタイムスタンプ（オプション）
            "attachments": attachments  # 添付ファイルメタデータ（オプション）
        }
        
        # API Gateway を呼び出し（IAM認証 または APIキー認証）
        response = invoke_execution_api(
            api_url=execution_api_url,
            payload=payload,
            auth_method=auth_method,
            api_key_secret_name=api_key_secret_name if auth_method == "api_key" else None
        )

        print(json.dumps({
            "level": "INFO",
            "event": "async_lambda_invoked",
            "correlation_id": correlation_id,
            "user_id": user_id,
            "message_length": len(text)
        }))

        # Slackに即座に応答（3秒以内）
        return {
            "statusCode": 200,
            "body": json.dumps({
                "text": "考え中です... 少々お待ちください",
                "response_type": "in_channel"  # チャネル全体に表示
            })
        }

    except SignatureVerificationError as e:
        print(json.dumps({
            "level": "ERROR",
            "event": "signature_error",
            "correlation_id": correlation_id,
            "error": str(e)
        }))
        return {
            "statusCode": 401,
            "body": json.dumps({"text": "署名検証に失敗しました"})
        }

    except AuthorizationError as e:
        print(json.dumps({
            "level": "ERROR",
            "event": "authorization_error",
            "correlation_id": correlation_id,
            "error": str(e)
        }))
        return {
            "statusCode": 403,
            "body": json.dumps({"text": "未認可"})
        }

    except Exception as e:
        print(json.dumps({
            "level": "ERROR",
            "event": "internal_error",
            "correlation_id": correlation_id,
            "error": str(e)
        }))
        return {
            "statusCode": 500,
            "body": json.dumps({"text": "内部サーバーエラー"})
        }
```

---

## 7.2 BedrockProcessor（実行層 Execution Layer） - Python

**ファイル**: `cdk/lib/execution/lambda/bedrock-processor/handler.py`

```python
"""
Execution Layer (実行層) - AWS Bedrock Converse API + Slack API投稿版。

このモジュールは、SlackEventHandlerで認可が検証された後、AWS Bedrock Converse APIを呼び出し、
結果を SQS キュー（ExecutionResponseQueue）に送信します。検証ゾーンの SlackResponseHandler が SQS メッセージを処理し、Slack API (chat.postMessage) でスレッド返信として投稿します。
会話、画像生成、コード生成、データ分析など多様なAI機能に対応します。

主な機能:
- Bedrock Converse API: 統一インターフェース、マルチモーダル入力
- スレッド履歴取得: conversations.replies APIで会話履歴を取得
- スレッド返信: thread_tsを使用してスレッド内に投稿
- 添付ファイル処理: 画像・ドキュメントのダウンロードと処理
"""

import json
import os
import time
from typing import Dict, Any, List, Optional
from botocore.exceptions import ClientError, ReadTimeoutError
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError

from bedrock_client_converse import invoke_bedrock
from response_formatter import format_success_response, format_error_response
from sqs_client import send_response_to_queue
from thread_history import get_thread_history
from attachment_processor import process_attachments

# 実装は cdk/lib/execution/lambda/bedrock-processor/handler.py を参照
# 主要な機能:
# - invoke_bedrock(): Bedrock Converse API呼び出し（bedrock_client_converse.py）
# - get_thread_history(): スレッド履歴取得（thread_history.py）
# - process_attachments(): 添付ファイル処理（attachment_processor.py）
# - format_success_response(): 成功レスポンスのフォーマット（response_formatter.py）
# - format_error_response(): エラーレスポンスのフォーマット（response_formatter.py）
# - send_response_to_queue(): SQS キューへの送信（sqs_client.py）


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    BedrockProcessorエントリーポイント - Execution Layer (実行層)。

    SlackEventHandlerからAPI Gateway経由で呼び出しされ、Bedrock Converse APIを呼び出した後、
    SQS キュー（ExecutionResponseQueue）にレスポンスを送信します。
    検証ゾーンの SlackResponseHandler が SQS メッセージを処理し、Slack API (chat.postMessage) でスレッド返信として投稿します。
    会話、画像生成、コード生成、データ分析など多様なAI機能に対応します。

    Args:
        event: SlackEventHandlerからのペイロード
            - channel: SlackチャネルID
            - text: ユーザーのリクエストテキスト
            - bot_token: Slack Bot Token
            - thread_ts: スレッドタイムスタンプ（オプション）
            - attachments: 添付ファイルメタデータ（オプション）
        context: Lambdaコンテキスト

    Returns:
        実行結果（Slackには直接返さず、Slack APIに投稿）
    """
    # 実装詳細は cdk/lib/execution/lambda/bedrock-processor/handler.py を参照
    
    # 主な処理フロー:
    # 1. ペイロード検証（channel, text, bot_token）
    # 2. 添付ファイル処理（process_attachments）
    # 3. スレッド履歴取得（get_thread_history if thread_ts）
    # 4. Bedrock Converse API呼び出し（invoke_bedrock）
    #    - テキスト、画像、ドキュメントテキストを統合
    #    - 会話履歴を含む
    # 5. SQS キューにレスポンス送信（send_response_to_queue）
    #    検証ゾーンの SlackResponseHandler が SQS メッセージを処理し、Slack API に投稿
```

---

## 8.3 添付ファイル処理の実装

### 概要

システムは Slack メッセージに添付された画像とドキュメントを処理し、AI 分析に含めることができます。処理は以下の 3 段階で実行されます：

1. **メタデータ抽出** (SlackEventHandler): Slack イベントから添付ファイル情報を抽出
2. **ダウンロードと処理** (BedrockProcessor): Slack CDN からファイルをダウンロードし、内容を抽出
3. **AI 統合** (BedrockProcessor): 抽出した内容を Bedrock API に送信

### 8.3.1 添付ファイルメタデータ抽出 (SlackEventHandler)

`cdk/lib/verification/lambda/slack-event-handler/attachment_extractor.py` モジュールは、Slack イベントから添付ファイル情報を抽出します：

```python
def extract_attachment_metadata(event: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract attachment metadata from Slack event payload.
    
    Args:
        event: Slack event dictionary containing 'files' array
        
    Returns:
        List of attachment metadata dictionaries, each containing:
        - id: Slack file ID
        - name: File name
        - mimetype: MIME type
        - size: File size in bytes
        - url_private_download: Download URL (may be None)
    """
    files = event.get("files", [])
    if not files or not isinstance(files, list):
        return []
    
    attachments = []
    for file_info in files:
        file_id = file_info.get("id")
        file_name = file_info.get("name")
        mime_type = file_info.get("mimetype")
        file_size = file_info.get("size")
        download_url = file_info.get("url_private_download")
        
        # Validate required fields
        if not file_id or not file_name or not mime_type or file_size is None:
            continue
        
        attachment = {
            "id": file_id,
            "name": file_name,
            "mimetype": mime_type,
            "size": file_size,
            "url_private_download": download_url,
        }
        attachments.append(attachment)
    
    return attachments
```

**SlackEventHandler の統合**:

```python
# cdk/lib/verification/lambda/slack-event-handler/handler.py
from attachment_extractor import extract_attachment_metadata

def lambda_handler(event, context):
    # ... 署名検証、認可 ...
    
    # Extract attachment metadata
    attachments = extract_attachment_metadata(slack_event)
    
    # Include attachments in payload to BedrockProcessor
    payload = {
        "user_id": user_id,
        "channel_id": channel_id,
        "text": user_message,
        "attachments": attachments,  # 添付ファイルメタデータ
        "response_url": response_url,
        "correlation_id": correlation_id,
    }
    
    # Invoke BedrockProcessor asynchronously
    # ...
```

### 8.3.2 添付ファイル処理 (BedrockProcessor)

`cdk/lib/execution/lambda/bedrock-processor/attachment_processor.py` モジュールは、添付ファイルのダウンロードと処理を実行します：

**主要関数**:

```python
def process_attachments(
    attachments: List[Dict[str, Any]], 
    bot_token: str, 
    correlation_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Process all attachments: download, extract content, and prepare for AI processing.
    
    Returns:
        List of processed attachment dictionaries, each containing:
        - file_id: Original Slack file ID
        - file_name: File name
        - mimetype: MIME type
        - content_type: "image", "document", or "unknown"
        - processing_status: "success", "failed", or "skipped"
        - content: Binary data (images) or text (documents) if successful
        - error_message: Description of failure if not successful
        - error_code: Machine-readable error code for categorization
    """
    processed = []
    
    for attachment in attachments:
        file_id = attachment.get("id")
        file_name = attachment.get("name")
        mime_type = attachment.get("mimetype")
        file_size = attachment.get("size")
        
        # Validate file size
        if is_image_attachment(mime_type):
            if file_size > MAX_IMAGE_SIZE:  # 10MB
                processed.append({
                    "processing_status": "failed",
                    "error_code": "file_too_large",
                    "error_message": f"Image exceeds {MAX_IMAGE_SIZE} bytes",
                })
                continue
        elif is_document_attachment(mime_type):
            if file_size > MAX_DOCUMENT_SIZE:  # 5MB
                processed.append({
                    "processing_status": "failed",
                    "error_code": "file_too_large",
                    "error_message": f"Document exceeds {MAX_DOCUMENT_SIZE} bytes",
                })
                continue
        
        # Get fresh download URL from files.info API
        fresh_download_url = get_file_download_url(file_id, bot_token)
        effective_url = fresh_download_url or attachment.get("url_private_download")
        
        if not effective_url:
            processed.append({
                "processing_status": "failed",
                "error_code": "url_not_available",
            })
            continue
        
        # Download file
        file_bytes = download_file(effective_url, bot_token)
        
        if not file_bytes:
            processed.append({
                "processing_status": "failed",
                "error_code": "download_failed",
            })
            continue
        
        # Process based on file type
        if is_image_attachment(mime_type):
            # Store image as binary data (Converse API uses binary, not Base64)
            processed.append({
                "file_id": file_id,
                "file_name": file_name,
                "mimetype": mime_type,
                "content_type": "image",
                "processing_status": "success",
                "content": file_bytes,  # Binary image data
            })
        elif is_document_attachment(mime_type):
            # Extract text from document
            text_content = extract_document_text(file_bytes, mime_type)
            if text_content:
                processed.append({
                    "file_id": file_id,
                    "file_name": file_name,
                    "mimetype": mime_type,
                    "content_type": "document",
                    "processing_status": "success",
                    "content": text_content,  # Extracted text
                })
            else:
                processed.append({
                    "processing_status": "failed",
                    "error_code": "extraction_failed",
                })
        else:
            # Unsupported file type
            processed.append({
                "processing_status": "skipped",
                "error_code": "unsupported_type",
            })
    
    return processed
```

### 8.3.3 ドキュメントテキスト抽出

`cdk/lib/execution/lambda/bedrock-processor/document_extractor.py` モジュールは、各種ドキュメント形式からテキストを抽出します：

**対応形式**:

- **PDF**: PyPDF2 を使用
- **DOCX**: python-docx または XML パース（フォールバック）
- **CSV**: 標準ライブラリ
- **XLSX**: openpyxl を使用
- **PPTX**: python-pptx または XML パース（フォールバック）、LibreOffice による画像変換（オプション）
- **TXT**: 標準ライブラリ

**実装例**:

```python
def extract_text_from_pdf(file_bytes: bytes) -> Optional[str]:
    """Extract text from PDF file."""
    try:
        from PyPDF2 import PdfReader
        import io
        
        pdf_file = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_file)
        
        text_parts = []
        for page in reader.pages:
            text_parts.append(page.extract_text())
        
        return "\n".join(text_parts)
    except Exception as e:
        print(f"PDF extraction failed: {e}")
        return None

def extract_text_from_docx(file_bytes: bytes) -> Optional[str]:
    """Extract text from DOCX file."""
    try:
        from docx import Document
        import io
        
        docx_file = io.BytesIO(file_bytes)
        doc = Document(docx_file)
        
        text_parts = []
        for paragraph in doc.paragraphs:
            text_parts.append(paragraph.text)
        
        # Extract from tables
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    text_parts.append(cell.text)
        
        return "\n".join(text_parts)
    except ImportError:
        # Fallback to XML parsing if python-docx is not available
        return _extract_text_from_docx_xml(file_bytes)
    except Exception as e:
        print(f"DOCX extraction failed: {e}")
        return None
```

### 8.3.4 BedrockProcessor での統合

`cdk/lib/execution/lambda/bedrock-processor/handler.py` は、処理された添付ファイルを Bedrock Converse API に送信します：

```python
def lambda_handler(event, context):
    # ... 既存の処理 ...
    
    attachments_metadata = event.get("attachments", [])
    processed_attachments = []
    
    if attachments_metadata:
        try:
            # Process attachments
            processed_attachments = process_attachments(
                attachments_metadata,
                bot_token,
                correlation_id=correlation_id
            )
            
            # Separate images and documents
            images = [
                a.get("content") for a in processed_attachments
                if a.get("content_type") == "image" 
                and a.get("processing_status") == "success"
            ]
            image_formats = [
                a.get("mimetype", "image/png").split("/")[-1].lower()
                for a in processed_attachments
                if a.get("content_type") == "image" 
                and a.get("processing_status") == "success"
            ]
            document_texts = [
                a.get("content") for a in processed_attachments
                if a.get("content_type") == "document"
                and a.get("processing_status") == "success"
            ]
            
            # Invoke Bedrock Converse API with multimodal inputs
            ai_response = invoke_bedrock(
                prompt=text or "",  # Empty string if no text (attachments only)
                conversation_history=conversation_history,
                images=images if images else None,  # Binary image data (not Base64)
                image_formats=image_formats if image_formats else None,
                document_texts=document_texts if document_texts else None,
            )
            
        except Exception as e:
            # Graceful degradation: continue with text-only if attachment processing fails
            log_exception("attachment_processing_failed", {...}, e)
            processed_attachments = []
    
    # Post to Slack with thread_ts
    post_to_slack(channel, ai_response, bot_token, thread_ts)
```

### 8.3.5 エラーハンドリング

すべての添付ファイル処理エラーは、ユーザーフレンドリーなメッセージにマッピングされます：

```python
ERROR_MESSAGES = {
    "unsupported_file_type": "このファイル形式には対応していません。画像（PNG, JPEG, GIF, WebP）またはドキュメント（PDF, DOCX, CSV, XLSX, PPTX, TXT）を送信してください。",
    "file_too_large": "ファイルが大きすぎます（画像: 最大 10MB、ドキュメント: 最大 5MB）。",
    "download_failed": "ファイルのダウンロードに失敗しました。ファイルが共有されているチャンネルにボットが追加されているか確認してください。",
    "extraction_failed": "ドキュメントの内容を読み取れませんでした。別のファイルを試してください。",
}

def _get_error_message_for_attachment_failure(error_code: str) -> str:
    """Map attachment processor error codes to user-friendly messages."""
    error_code_mapping = {
        "unsupported_type": "unsupported_file_type",
        "file_too_large": "file_too_large",
        "download_failed": "download_failed",
        "extraction_failed": "extraction_failed",
    }
    message_key = error_code_mapping.get(error_code, "generic")
    return ERROR_MESSAGES.get(message_key, ERROR_MESSAGES["generic"])
```

### 8.3.6 パフォーマンス考慮事項

- **ファイルサイズ制限**: 画像 10MB、ドキュメント 5MB（処理時間とメモリ使用量を考慮）
- **タイムアウト**: 添付ファイル処理は 30 秒以内に完了する必要がある
- **部分成功**: 複数添付ファイルがある場合、一部が失敗しても成功したファイルは処理を継続
- **並列処理**: 現在は順次処理（将来の最適化で並列処理を検討）

---

## 7.3 スレッド履歴取得の実装

**ファイル**: `cdk/lib/execution/lambda/bedrock-processor/thread_history.py`

スレッド内の会話履歴を取得し、Bedrock Converse APIに渡すことで文脈を理解した応答を実現します。

**実装フロー**:

1. **スレッドタイムスタンプ取得**: `event.thread_ts` または `event.ts` から取得
2. **履歴取得**: `conversations.replies` APIでスレッド内のメッセージを取得
3. **形式変換**: Slackメッセージ形式をBedrock Converse API形式に変換
4. **Bedrock呼び出し**: 会話履歴を含めてBedrock Converse APIを呼び出し
5. **スレッド返信**: `chat.postMessage` with `thread_ts`でスレッド内に投稿

**実装例**:

```python
# cdk/lib/execution/lambda/bedrock-processor/handler.py
thread_ts = payload.get("thread_ts")  # Optional: timestamp for thread replies

if thread_ts:
    try:
        client = WebClient(token=bot_token)
        thread_messages = get_thread_history(client, channel, thread_ts)
        
        if thread_messages:
            # Use thread history directly (already in Converse API format)
            conversation_history = thread_messages
        else:
            conversation_history = None
    except SlackApiError as e:
        # Log error but continue without history (graceful degradation)
        log_warn("thread_history_retrieval_failed", {...}, e)
        conversation_history = None

# Invoke Bedrock with conversation history
ai_response = invoke_bedrock(
    prompt=text or "",
    conversation_history=conversation_history,
    images=images,
    image_formats=image_formats,
    document_texts=document_texts,
)

# Post to Slack in thread
post_to_slack(channel, ai_response, bot_token, thread_ts)
```

## 7.4 Bedrock Converse API の実装

**ファイル**: `cdk/lib/execution/lambda/bedrock-processor/bedrock_client_converse.py`

Bedrock Converse APIは統一インターフェースを提供し、マルチモーダル入力（テキスト+画像）をサポートします。

**主な特徴**:

- **統一インターフェース**: すべてのサポートモデルで同じAPI形式
- **マルチモーダル入力**: テキストと画像を同時に送信可能
- **バイナリ画像データ**: Base64エンコード不要（直接バイナリデータ）
- **会話履歴管理**: メッセージ配列で会話履歴を管理

**実装例**:

```python
# cdk/lib/execution/lambda/bedrock-processor/bedrock_client_converse.py
def invoke_bedrock(
    prompt: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    images: Optional[List[bytes]] = None,
    image_formats: Optional[List[str]] = None,
    document_texts: Optional[List[str]] = None,
) -> str:
    # Build content array for current message
    content_parts = []
    
    # Add text prompt if present
    if prompt and prompt.strip():
        content_parts.append({"text": prompt.strip()})
    
    # Add document texts if present
    if document_texts:
        for doc_text in document_texts:
            if doc_text:
                content_parts.append({"text": f"\n\n[Document content]\n{doc_text}"})
    
    # Add images if present (binary data, no Base64 encoding)
    if images:
        formats = image_formats if image_formats else ["png"] * len(images)
        for image_bytes, image_format in zip(images, formats):
            content_parts.append({
                "image": {
                    "format": image_format,
                    "source": {
                        "bytes": image_bytes  # Binary data directly
                    }
                }
            })
    
    # Build messages array with conversation history
    messages = []
    if conversation_history:
        messages = conversation_history.copy()
    
    # Add current message
    messages.append({
        "role": "user",
        "content": content_parts
    })
    
    # Call Converse API
    response = bedrock_runtime.converse(
        modelId=model_id,
        messages=messages,
        inferenceConfig={
            "maxTokens": max_tokens,  # Model-specific limit (Claude: 4096, Nova Pro: 8192)
            "temperature": TEMPERATURE,
        }
    )
    
    # Extract AI response
    output = response.get("output", {})
    message = output.get("message", {})
    content_blocks = message.get("content", [])
    ai_response = content_blocks[0].get("text", "").strip()
    
    return ai_response
```

## 関連ドキュメント

- [アーキテクチャ概要](./overview.md) - システム全体像
## 7.5 レート制限の実装

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/rate_limiter.py`

レート制限は、DynamoDB ベースのトークンバケットアルゴリズムを使用して、ユーザー単位のスロットリングを実装します。

**実装フロー**:

1. **レート制限キー生成**: `{team_id}#{user_id}` をキーとして使用
2. **時間ウィンドウ**: 1分間（60秒）ごとにリセット
3. **DynamoDB 条件付き更新**: アトミックにリクエスト数をカウント
4. **制限超過チェック**: 制限を超えた場合は `RateLimitExceededError` を発生

**DynamoDB テーブル**: `slack-rate-limit`
- Partition Key: `rate_limit_key` (String, 形式: `{team_id}#{user_id}#{window_start}`)
- TTL Attribute: `ttl` (Number, Unix timestamp)
- Billing Mode: PAY_PER_REQUEST

**コード例**:

```python
from rate_limiter import check_rate_limit, RateLimitExceededError

# レート制限チェック
try:
    is_allowed, remaining = check_rate_limit(
        team_id=team_id,
        user_id=user_id,
        limit=10,  # デフォルト: 環境変数 RATE_LIMIT_PER_MINUTE
        window_seconds=60,
    )
    
    if not is_allowed:
        return {
            "statusCode": 429,
            "body": json.dumps({"error": "Rate limit exceeded"}),
        }
except RateLimitExceededError as e:
    return {
        "statusCode": 429,
        "body": json.dumps({"error": "Rate limit exceeded"}),
    }
```

**CloudWatch メトリクス**:
- `RateLimitExceeded`: レート制限超過回数（Sum）
- `RateLimitRequests`: レート制限チェック回数（Sum）

**CloudWatch アラーム**:
- `RateLimitExceededAlarm`: 5分間に10回以上のレート制限超過でトリガー

**環境変数**:
- `RATE_LIMIT_PER_MINUTE`: レート制限値（デフォルト: 10）
- `RATE_LIMIT_TABLE_NAME`: DynamoDB テーブル名（デフォルト: `slack-rate-limit`）

## 7.6 トークン数制限の実装

**ファイル**: `cdk/lib/execution/lambda/bedrock-processor/bedrock_client_converse.py`

トークン数制限は、モデルごとの最大値を自動的に決定します。

**実装フロー**:

1. **モデルID検出**: 環境変数 `BEDROCK_MODEL_ID` からモデルIDを取得
2. **最大トークン数決定**: `get_max_tokens_for_model()` 関数でモデルごとの最大値を決定
   - Claude 4.5 Sonnet/Haiku/Opus: 8192 tokens (すべての4.5シリーズ)
   - Amazon Nova Pro: 8192 tokens
   - Amazon Nova Lite: 4096 tokens
3. **環境変数上書き**: `BEDROCK_MAX_TOKENS` が設定されている場合は上書き

**コード例**:

```python
def get_max_tokens_for_model(model_id: str) -> int:
    """モデルごとの最大トークン数を取得"""
    # 環境変数で上書き可能
    env_max_tokens = os.environ.get("BEDROCK_MAX_TOKENS")
    if env_max_tokens:
        return int(env_max_tokens)
    
    # Claude 4.5 series models (8192 tokens) - all variants
    if (
        "claude-sonnet-4-5" in model_id
        or "claude-haiku-4-5" in model_id
        or "claude-opus-4-5" in model_id
    ):
        return 8192
    
    # Amazon Nova Pro (8192 tokens)
    if "amazon.nova-pro" in model_id:
        return 8192
    
    # Amazon Nova Lite (4096 tokens)
    if "amazon.nova-lite" in model_id:
        return 4096
    
    return 4096  # デフォルト

# 使用例
model_id = os.environ.get("BEDROCK_MODEL_ID", "jp.anthropic.claude-haiku-4-5-20251001-v1:0")
max_tokens = get_max_tokens_for_model(model_id)

inference_config = {
    "maxTokens": max_tokens,
    "temperature": TEMPERATURE,
}
```
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
grep

- [ユーザー体験](./user-experience.md) - UX設計とフロー
- [セキュリティ実装](../security/implementation.md) - セキュリティコード実装
- [ADR-003](../explanation/adr/003-response-url-async.md) - 非同期パターンの採用理由
