# クイックスタート: スタック間通信のデュアル認証対応

**機能**: 012-api-key-auth  
**日付**: 2025-01-30  
**目的**: Verification Stack と Execution Stack の間の通信に API キー認証を追加するための実装ガイド

## 概要

このガイドでは、既存の IAM 認証に加えて API キー認証を追加する手順を説明します。既存の IAM 認証機能は維持され、設定により IAM 認証と API キー認証を切り替え可能になります。

## 前提条件

- AWS CDK CLI がインストールされ、設定されている
- API Gateway、Lambda、IAM、Secrets Manager リソースを作成する権限を持つ AWS 資格情報
- 既存の slack-ai-app デプロイメント（002-iam-layer-auth が完了していること）
- Lambda 関数用の Python 3.11+ 環境
- CDK 用の Node.js/TypeScript 環境

## 実装手順

### ステップ 1: API Gateway に API キー認証を追加

**1.1 Execution API Gateway コンストラクトを更新**

`cdk/lib/constructs/execution-api.ts` を更新して API キー認証を追加:

```typescript
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface ExecutionApiProps {
  executionLambda: lambda.Function;
  verificationLambdaRoleArn: string;
  enableApiKeyAuth?: boolean;  // 新規: API キー認証を有効化するか
}

export class ExecutionApi extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly apiUrl: string;
  public readonly apiKey?: apigateway.ApiKey;  // 新規: API キー

  constructor(scope: Construct, id: string, props: ExecutionApiProps) {
    super(scope, id);

    // Create REST API (既存の実装)
    this.api = new apigateway.RestApi(this, "ExecutionApi", {
      restApiName: "Execution Layer API",
      description: "Internal API Gateway for Execution Layer with IAM and API key authentication",
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ArnPrincipal(props.verificationLambdaRoleArn)],
            actions: ["execute-api:Invoke"],
            resources: ["*"],
          }),
        ],
      }),
    });

    // Create Lambda integration
    const integration = new apigateway.LambdaIntegration(props.executionLambda, {
      proxy: true,
    });

    // Create /execute endpoint
    const executeResource = this.api.root.addResource("execute");
    
    // IAM 認証メソッド（既存）
    executeResource.addMethod("POST", integration, {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // API キー認証を有効化する場合
    if (props.enableApiKeyAuth) {
      // Create API key
      this.apiKey = new apigateway.ApiKey(this, "ExecutionApiKey", {
        apiKeyName: "execution-api-key",
        description: "API key for Execution Layer API authentication",
      });

      // Create usage plan (optional, for rate limiting)
      const usagePlan = new apigateway.UsagePlan(this, "ExecutionApiUsagePlan", {
        name: "execution-api-usage-plan",
        apiStages: [
          {
            api: this.api,
            stage: this.api.deploymentStage,
          },
        ],
        throttle: {
          rateLimit: 1000,  // リクエスト/秒
          burstLimit: 2000,  // バーストリミット
        },
      });

      // Associate API key with usage plan
      usagePlan.addApiKey(this.apiKey);

      // Add API key authentication method
      executeResource.addMethod("POST", integration, {
        authorizationType: apigateway.AuthorizationType.NONE,  // API キー認証は NONE + API キー要求
        apiKeyRequired: true,
      });
    }

    // Output API URL
    this.apiUrl = this.api.url;
  }
}
```

**1.2 Slack Bedrock Stack を更新**

`cdk/lib/slack-bedrock-stack.ts` を更新して API キー認証を有効化:

```typescript
// ExecutionApi コンストラクトの作成時に enableApiKeyAuth を設定
const executionApi = new ExecutionApi(this, "ExecutionApi", {
  executionLambda: bedrockProcessor.function,
  verificationLambdaRoleArn: slackEventHandler.function.role!.roleArn,
  enableApiKeyAuth: true,  // API キー認証を有効化
});

// API キー ID を出力（オプション）
new cdk.CfnOutput(this, "ExecutionApiKeyId", {
  value: executionApi.apiKey?.keyId || "N/A",
  description: "Execution API Gateway API Key ID",
});
```

**1.3 インフラストラクチャをデプロイ**

```bash
cd cdk
npm install  # 依存関係をインストール
cdk deploy
```

**検証**:
```bash
# API Gateway が作成されていることを確認
aws apigateway get-rest-apis --query "items[?name=='Execution Layer API']"

# API キーが作成されていることを確認
aws apigateway get-api-keys --query "items[?name=='execution-api-key']"
```

---

### ステップ 2: Secrets Manager に API キーを保存

**2.1 API キーを取得**

API Gateway から API キー値を取得:

```bash
# API キー ID を取得
API_KEY_ID=$(aws apigateway get-api-keys --query "items[?name=='execution-api-key'].id" --output text)

# API キー値を取得（作成時のみ可能）
aws apigateway create-api-key --name execution-api-key --generate-clone-source $API_KEY_ID
# 注意: 既存の API キーの値は取得できないため、新規作成時に保存する必要がある
```

**2.2 Secrets Manager に API キーを保存**

```bash
# Secrets Manager に API キーを保存
aws secretsmanager create-secret \
  --name execution-api-key \
  --description "API key for Execution Layer API Gateway authentication" \
  --secret-string '{"api_key":"YOUR_API_KEY_VALUE_HERE"}' \
  --region ap-northeast-1
```

**注意**: `YOUR_API_KEY_VALUE_HERE` を実際の API キー値に置き換えてください。

**2.3 Verification Stack Lambda に Secrets Manager アクセス権限を付与**

`cdk/lib/constructs/slack-event-handler.ts` を更新:

```typescript
// Secrets Manager から API キーを読み取る権限を追加
slackEventHandler.function.addToRolePolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["secretsmanager:GetSecretValue"],
    resources: [
      `arn:aws:secretsmanager:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:secret:execution-api-key*`,
    ],
  })
);
```

---

### ステップ 3: Secrets Manager クライアントを実装

**3.1 Secrets Manager クライアントモジュールを作成**

`lambda/verification-stack/slack-event-handler/secrets_manager_client.py` を作成:

```python
"""
AWS Secrets Manager クライアント

API キーなどのシークレットを安全に取得するためのモジュール
"""

import json
import os
from typing import Dict, Any, Optional
import boto3
from botocore.exceptions import ClientError


def get_secret(secret_name: str, region: str = "ap-northeast-1") -> Dict[str, Any]:
    """
    AWS Secrets Manager からシークレットを取得
    
    Args:
        secret_name: Secrets Manager のシークレット名
        region: AWS リージョン
    
    Returns:
        シークレットの辞書（JSON 文字列の場合はパース済み）
    
    Raises:
        ClientError: Secrets Manager アクセスエラー
        ValueError: シークレットが見つからない、または無効な形式
    """
    client = boto3.client("secretsmanager", region_name=region)
    
    try:
        response = client.get_secret_value(SecretId=secret_name)
        secret_string = response["SecretString"]
        
        # JSON 文字列の場合はパース
        try:
            return json.loads(secret_string)
        except json.JSONDecodeError:
            # JSON でない場合は文字列として返す
            return {"value": secret_string}
    
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        if error_code == "ResourceNotFoundException":
            raise ValueError(f"Secret {secret_name} not found") from e
        elif error_code == "InvalidParameterException":
            raise ValueError(f"Invalid secret name: {secret_name}") from e
        elif error_code == "InvalidRequestException":
            raise ValueError(f"Invalid request for secret: {secret_name}") from e
        elif error_code == "DecryptionFailureException":
            raise ValueError(f"Failed to decrypt secret: {secret_name}") from e
        else:
            raise


def get_api_key(secret_name: str, region: str = "ap-northeast-1") -> str:
    """
    Secrets Manager から API キーを取得
    
    Args:
        secret_name: Secrets Manager のシークレット名
        region: AWS リージョン
    
    Returns:
        API キー文字列
    
    Raises:
        ValueError: API キーが見つからない、または無効な形式
    """
    secret = get_secret(secret_name, region)
    
    # API キーを取得（JSON オブジェクトまたは文字列）
    if "api_key" in secret:
        api_key = secret["api_key"]
    elif "value" in secret:
        api_key = secret["value"]
    else:
        raise ValueError(f"API key not found in secret: {secret_name}")
    
    if not api_key or not isinstance(api_key, str):
        raise ValueError(f"Invalid API key format in secret: {secret_name}")
    
    return api_key
```

**3.2 ユニットテストを作成**

`lambda/verification-stack/slack-event-handler/tests/test_secrets_manager_client.py` を作成:

```python
"""Secrets Manager クライアントのユニットテスト"""

import pytest
from unittest.mock import Mock, patch
from secrets_manager_client import get_secret, get_api_key


@patch("secrets_manager_client.boto3.client")
def test_get_secret_json(mock_boto3_client):
    """JSON 形式のシークレットを取得するテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"api_key": "test-api-key-123"}'
    }
    mock_boto3_client.return_value = mock_client
    
    result = get_secret("test-secret")
    
    assert result == {"api_key": "test-api-key-123"}
    mock_client.get_secret_value.assert_called_once_with(SecretId="test-secret")


@patch("secrets_manager_client.boto3.client")
def test_get_api_key(mock_boto3_client):
    """API キーを取得するテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.return_value = {
        "SecretString": '{"api_key": "test-api-key-123"}'
    }
    mock_boto3_client.return_value = mock_client
    
    result = get_api_key("test-secret")
    
    assert result == "test-api-key-123"


@patch("secrets_manager_client.boto3.client")
def test_get_secret_not_found(mock_boto3_client):
    """シークレットが見つからない場合のテスト"""
    mock_client = Mock()
    mock_client.get_secret_value.side_effect = Exception(
        {"Error": {"Code": "ResourceNotFoundException"}}
    )
    mock_boto3_client.return_value = mock_client
    
    with pytest.raises(ValueError, match="Secret test-secret not found"):
        get_secret("test-secret")
```

---

### ステップ 4: API Gateway クライアントを拡張

**4.1 API Gateway クライアントを更新**

`lambda/verification-stack/slack-event-handler/api_gateway_client.py` を更新して API キー認証をサポート:

```python
"""
API Gateway クライアント（IAM 認証と API キー認証をサポート）

このモジュールは IAM 認証（SigV4）と API キー認証の両方をサポートします。
"""

import json
import os
from typing import Dict, Any, Optional
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
import requests
from secrets_manager_client import get_api_key


def invoke_execution_api(
    api_url: str,
    payload: Dict[str, Any],
    region: str = "ap-northeast-1",
    auth_method: str = "iam",
    api_key_secret_name: Optional[str] = None,
) -> requests.Response:
    """
    Execution API Gateway を呼び出す
    
    Args:
        api_url: API Gateway エンドポイント URL
        payload: リクエストペイロード
        region: AWS リージョン
        auth_method: 認証方法 ('iam' または 'api_key')
        api_key_secret_name: API キーが保存されている Secrets Manager のシークレット名（api_key 認証の場合）
    
    Returns:
        requests.Response オブジェクト
    
    Raises:
        ValueError: 無効な認証方法または API キー取得エラー
        requests.RequestException: API Gateway 呼び出しエラー
    """
    url = f"{api_url}/execute"
    headers = {"Content-Type": "application/json"}
    
    # 認証方法に基づいてヘッダーを設定
    if auth_method == "iam":
        # IAM 認証（SigV4 署名）
        session = boto3.Session()
        credentials = session.get_credentials()
        signer = SigV4Auth(credentials, "execute-api", region)
        
        request = AWSRequest(method="POST", url=url, data=json.dumps(payload))
        signer.add_auth(request)
        
        headers.update(dict(request.headers))
    
    elif auth_method == "api_key":
        # API キー認証
        if not api_key_secret_name:
            raise ValueError("api_key_secret_name is required for API key authentication")
        
        api_key = get_api_key(api_key_secret_name, region)
        headers["x-api-key"] = api_key
    
    else:
        raise ValueError(f"Invalid auth_method: {auth_method}. Must be 'iam' or 'api_key'")
    
    # リクエストを送信
    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=30,
    )
    
    return response
```

---

### ステップ 5: Handler を更新して認証方法を選択

**5.1 Handler を更新**

`lambda/verification-stack/slack-event-handler/handler.py` を更新:

```python
import os
from api_gateway_client import invoke_execution_api

# 環境変数から認証方法を取得
AUTH_METHOD = os.environ.get("EXECUTION_API_AUTH_METHOD", "iam").lower()
API_KEY_SECRET_NAME = os.environ.get("EXECUTION_API_KEY_SECRET_NAME", "")
EXECUTION_API_URL = os.environ.get("EXECUTION_API_URL", "")


def lambda_handler(event, context):
    # ... 既存の検証ロジック ...
    
    # Execution Stack を呼び出す
    try:
        response = invoke_execution_api(
            api_url=EXECUTION_API_URL,
            payload={
                "channel": channel,
                "text": text,
                "bot_token": bot_token,
                "team_id": team_id,
                "user_id": user_id,
                "response_url": response_url,
                "correlation_id": correlation_id,
            },
            auth_method=AUTH_METHOD,
            api_key_secret_name=API_KEY_SECRET_NAME if AUTH_METHOD == "api_key" else None,
        )
        
        if response.status_code == 202:
            logger.info("Execution request accepted", extra={"correlation_id": correlation_id})
        elif response.status_code == 403:
            logger.error(
                "API Gateway authentication failed",
                extra={
                    "correlation_id": correlation_id,
                    "auth_method": AUTH_METHOD,
                    "status_code": response.status_code,
                },
            )
            # エラーハンドリング（Slack にエラーメッセージを返す）
        else:
            logger.error(
                "API Gateway request failed",
                extra={
                    "correlation_id": correlation_id,
                    "status_code": response.status_code,
                },
            )
    
    except Exception as e:
        logger.error(
            "Failed to invoke Execution API",
            extra={"correlation_id": correlation_id, "error": str(e)},
            exc_info=True,
        )
        # エラーハンドリング
```

**5.2 環境変数を設定**

CDK スタックで環境変数を設定:

```typescript
// IAM 認証を使用する場合（デフォルト）
slackEventHandler.function.addEnvironment("EXECUTION_API_AUTH_METHOD", "iam");
slackEventHandler.function.addEnvironment("EXECUTION_API_URL", executionApi.apiUrl);

// API キー認証を使用する場合
slackEventHandler.function.addEnvironment("EXECUTION_API_AUTH_METHOD", "api_key");
slackEventHandler.function.addEnvironment("EXECUTION_API_KEY_SECRET_NAME", "execution-api-key");
slackEventHandler.function.addEnvironment("EXECUTION_API_URL", executionApi.apiUrl);
```

---

### ステップ 6: テスト

**6.1 ユニットテストを実行**

```bash
cd lambda/verification-stack/slack-event-handler
pytest tests/ -v
```

**6.2 統合テスト**

**IAM 認証のテスト**:
```bash
# 環境変数を IAM 認証に設定
export EXECUTION_API_AUTH_METHOD=iam
export EXECUTION_API_URL=https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod

# Lambda 関数をテスト
# （既存の IAM 認証テストと同じ）
```

**API キー認証のテスト**:
```bash
# 環境変数を API キー認証に設定
export EXECUTION_API_AUTH_METHOD=api_key
export EXECUTION_API_KEY_SECRET_NAME=execution-api-key
export EXECUTION_API_URL=https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod

# Lambda 関数をテスト
# API キー認証が動作することを確認
```

**6.3 認証失敗のテスト**

無効な API キーでテスト:
```bash
# Secrets Manager に無効な API キーを一時的に保存
aws secretsmanager update-secret \
  --secret-id execution-api-key \
  --secret-string '{"api_key":"invalid-api-key"}' \
  --region ap-northeast-1

# Lambda 関数をテスト
# 403 Forbidden エラーが返されることを確認

# 有効な API キーに戻す
aws secretsmanager update-secret \
  --secret-id execution-api-key \
  --secret-string '{"api_key":"VALID_API_KEY"}' \
  --region ap-northeast-1
```

---

### ステップ 7: デプロイ

**7.1 CDK スタックをデプロイ**

```bash
cd cdk
cdk deploy
```

**7.2 Lambda 関数をデプロイ**

```bash
# Lambda 関数のコードを更新
cd lambda/verification-stack/slack-event-handler
# （デプロイスクリプトを実行）
```

**7.3 動作確認**

1. Slack でメッセージを送信
2. CloudWatch ログで認証方法を確認
3. API Gateway メトリクスで認証成功/失敗を確認

---

## トラブルシューティング

### API キー認証が失敗する

**問題**: 403 Forbidden エラーが返される

**解決策**:
1. Secrets Manager に API キーが正しく保存されているか確認
2. Lambda 関数に Secrets Manager へのアクセス権限があるか確認
3. API Gateway で API キーが正しく設定されているか確認
4. 使用量プランに API キーが関連付けられているか確認

### IAM 認証と API キー認証の両方が失敗する

**問題**: どちらの認証方法でも 403 Forbidden エラーが返される

**解決策**:
1. API Gateway リソースポリシーを確認（IAM 認証の場合）
2. API キーが有効か確認（API キー認証の場合）
3. CloudWatch ログで詳細なエラーメッセージを確認

### Secrets Manager から API キーを取得できない

**問題**: `ValueError: Secret execution-api-key not found`

**解決策**:
1. Secrets Manager にシークレットが存在するか確認
2. Lambda 関数の IAM ロールに `secretsmanager:GetSecretValue` 権限があるか確認
3. シークレット名が正しいか確認

---

## 次のステップ

- API キーのローテーション手順を実装
- CloudWatch アラームで認証失敗を監視
- パフォーマンスメトリクスを監視（API キー取得のオーバーヘッド）

---

## 参考資料

- [research.md](research.md) - 技術的決定の詳細
- [data-model.md](data-model.md) - データモデルの定義
- [contracts/execution-api-dual-auth.yaml](contracts/execution-api-dual-auth.yaml) - OpenAPI 仕様
- [plan.md](plan.md) - 実装計画

