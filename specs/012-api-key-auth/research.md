# 研究: スタック間通信のデュアル認証対応

**機能**: 012-api-key-auth  
**日付**: 2025-01-30  
**目的**: Verification Stack と Execution Stack の間の通信に API キー認証を追加するための技術的決定を解決

## 研究質問

### RQ-01: API Gateway REST API での API キー認証サポート

**質問**: API Gateway REST API は IAM 認証と API キー認証の両方を同時にサポートできますか？

**決定**: はい、API Gateway REST API は複数の認証方法を同時にサポートできます。IAM 認証と API キー認証を組み合わせて使用できます。

**根拠**:
- API Gateway REST API は複数の認証方法（IAM、API キー、Lambda オーソライザー）を同時にサポート
- リクエストに IAM 署名または API キーが含まれている場合、API Gateway は両方を検証
- いずれかの認証が成功すれば、リクエストは許可される
- リソースポリシーと API キーの両方が評価される（両方の条件を満たす必要がある場合もある）

**実装パターン**:
- API Gateway REST API に API キーを設定
- リソースポリシーで IAM 認証を要求（既存の実装）
- リクエストに IAM 署名または API キー（`x-api-key` ヘッダー）を含める
- API Gateway は両方を検証し、いずれかが成功すればリクエストを許可

**代替案の検討**:
- **IAM 認証のみ**: 却下 - 将来の非 AWS API との統合をサポートできない
- **API キー認証のみ**: 却下 - 既存の IAM 認証機能を失う
- **別々のエンドポイント**: 検討したが却下 - 複雑さが増し、設定管理が困難

**参考文献**:
- AWS API Gateway API キー認証: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-keys.html
- API Gateway 複数認証方法: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html

---

### RQ-02: API キーの保存と取得方法

**質問**: API キーを安全に保存し、実行時に取得するにはどうすればよいですか？

**決定**: AWS Secrets Manager を使用して API キーを保存し、boto3 で実行時に取得します。

**根拠**:
- AWS Secrets Manager は暗号化、アクセス制御、ローテーションをサポート
- Lambda 実行ロールに Secrets Manager へのアクセス権限を付与できる（最小権限の原則）
- boto3 は Secrets Manager へのアクセスを簡単に提供
- API キーのローテーションをサポート（ダウンタイムなし）
- CloudTrail でアクセスを監査可能

**実装パターン**:
```python
import boto3
import json

def get_api_key(secret_name: str, region: str = "ap-northeast-1") -> str:
    """
    AWS Secrets Manager から API キーを取得
    
    Args:
        secret_name: Secrets Manager のシークレット名
        region: AWS リージョン
    
    Returns:
        API キー文字列
    """
    client = boto3.client('secretsmanager', region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    secret = json.loads(response['SecretString'])
    return secret.get('api_key')  # または secret が直接文字列の場合
```

**パフォーマンス考慮事項**:
- Secrets Manager の取得は通常 50-100ms（キャッシュなし）
- Lambda 関数のコールドスタート時のみ取得し、ウォームスタート時は再利用可能
- 必要に応じてメモリ内キャッシュを実装（TTL 5 分など）

**代替案の検討**:
- **環境変数**: 却下 - セキュリティリスク（ログに露出する可能性）、ローテーションが困難
- **Systems Manager Parameter Store**: 検討したが却下 - Secrets Manager の方が暗号化とローテーションのサポートが優れている
- **ハードコード**: 却下 - セキュリティリスク、ローテーション不可

**参考文献**:
- AWS Secrets Manager: https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html
- Secrets Manager のベストプラクティス: https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html

---

### RQ-03: 認証方法の選択ロジック

**質問**: 設定に基づいて IAM 認証と API キー認証をどのように選択しますか？

**決定**: 環境変数または Secrets Manager の設定に基づいて認証方法を選択します。設定がない場合は IAM 認証をデフォルトとして使用します（後方互換性）。

**根拠**:
- 環境変数による設定はシンプルで、コード変更なしで切り替え可能
- Secrets Manager の設定により、より動的な設定が可能
- デフォルトで IAM 認証を使用することで、既存の動作を維持
- 設定エラー時は明確なエラーメッセージを提供

**実装パターン**:
```python
import os

# 環境変数から認証方法を取得
AUTH_METHOD = os.environ.get('EXECUTION_API_AUTH_METHOD', 'iam').lower()
API_KEY_SECRET_NAME = os.environ.get('EXECUTION_API_KEY_SECRET_NAME', '')

def get_auth_method() -> str:
    """
    設定に基づいて認証方法を返す
    
    Returns:
        'iam' または 'api_key'
    """
    if AUTH_METHOD == 'api_key' and API_KEY_SECRET_NAME:
        return 'api_key'
    return 'iam'  # デフォルト
```

**設定の優先順位**:
1. 環境変数 `EXECUTION_API_AUTH_METHOD` が 'api_key' で、`EXECUTION_API_KEY_SECRET_NAME` が設定されている場合 → API キー認証
2. それ以外 → IAM 認証（デフォルト、後方互換性）

**エラーハンドリング**:
- API キー認証が設定されているが、Secrets Manager から取得できない場合 → エラーログと共に IAM 認証にフォールバック（またはエラーを返す）
- 無効な認証方法が設定されている場合 → エラーログと共に IAM 認証にフォールバック

**代替案の検討**:
- **常に両方を試行**: 却下 - パフォーマンスオーバーヘッド、複雑さ
- **リクエストごとに設定を読み取り**: 却下 - パフォーマンスオーバーヘッド、環境変数の読み取りで十分
- **Lambda レイヤーでの設定**: 検討したが却下 - 環境変数の方がシンプル

**参考文献**:
- Lambda 環境変数: https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html

---

### RQ-04: API Gateway での API キー検証

**質問**: API Gateway で API キーをどのように検証しますか？

**決定**: API Gateway REST API に API キーを設定し、使用量プランと API キーを関連付けます。リクエストの `x-api-key` ヘッダーで API キーを検証します。

**根拠**:
- API Gateway はネイティブで API キー認証をサポート
- 使用量プランと API キーを関連付けることで、レート制限やクォータを設定可能
- `x-api-key` ヘッダーは標準的な API キー認証パターン
- Lambda オーソライザーは不要（API Gateway が検証）

**実装パターン**:
1. **CDK での設定**:
```typescript
// API キーを作成
const apiKey = new apigateway.ApiKey(this, 'ExecutionApiKey', {
  apiKeyName: 'execution-api-key',
});

// 使用量プランを作成（オプション）
const usagePlan = new apigateway.UsagePlan(this, 'ExecutionApiUsagePlan', {
  name: 'execution-api-usage-plan',
  apiStages: [{
    api: restApi,
    stage: deploymentStage,
  }],
});

// API キーを使用量プランに関連付け
usagePlan.addApiKey(apiKey);
```

2. **リクエストでの使用**:
```python
headers = {
    'Content-Type': 'application/json',
    'x-api-key': api_key  # API キーをヘッダーに含める
}
response = requests.post(api_gateway_url, headers=headers, json=payload)
```

**セキュリティ考慮事項**:
- API キーは Secrets Manager に保存（暗号化）
- API キーはログに記録しない（FR-011）
- 使用量プランでレート制限を設定可能
- API キーのローテーション時は、新しいキーを作成してから古いキーを削除

**代替案の検討**:
- **Lambda オーソライザー**: 却下 - レイテンシの追加、カスタムコードが必要
- **カスタムヘッダー名**: 検討したが却下 - `x-api-key` が標準的
- **クエリパラメータ**: 却下 - セキュリティリスク（URL に露出）

**参考文献**:
- API Gateway API キー: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-keys.html
- API Gateway 使用量プラン: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-usage-plans.html

---

### RQ-05: IAM 認証と API キー認証の共存

**質問**: IAM 認証と API キー認証を同じ API Gateway エンドポイントで共存させるにはどうすればよいですか？

**決定**: API Gateway REST API で IAM 認証（リソースポリシー）と API キー認証の両方を有効にします。リクエストに IAM 署名または API キーが含まれていれば、リクエストは許可されます。

**根拠**:
- API Gateway REST API は複数の認証方法を同時にサポート
- リソースポリシーで IAM 認証を要求（既存の実装）
- API キーを設定し、使用量プランに関連付け
- リクエストに IAM 署名または API キーが含まれていれば、API Gateway はリクエストを許可

**実装パターン**:
1. **リソースポリシー**: IAM 認証を要求（既存の実装を維持）
2. **API キー**: API Gateway に API キーを設定
3. **リクエスト**: IAM 署名または API キーを含める（設定に基づいて選択）

**注意事項**:
- リソースポリシーが `aws:PrincipalArn` 条件を使用している場合、API キー認証ではこの条件が満たされない可能性がある
- リソースポリシーを調整して、IAM 認証または API キー認証のいずれかを許可する必要がある場合がある
- または、リソースポリシーを緩和して、API キー認証も許可する

**リソースポリシーの例**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_ID:API_ID/*",
      "Condition": {
        "StringEquals": {
          "aws:SourceVpc": "vpc-xxx"  // オプション: VPC 制限
        }
      }
    }
  ]
}
```

**代替案の検討**:
- **別々のエンドポイント**: 却下 - 複雑さが増し、設定管理が困難
- **Lambda オーソライザーで統合**: 却下 - レイテンシの追加、カスタムコードが必要
- **IAM 認証のみ**: 却下 - 将来の非 AWS API との統合をサポートできない

**参考文献**:
- API Gateway リソースポリシー: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html

---

### RQ-06: API キー認証のエラーハンドリング

**質問**: API キー認証の失敗をどのように処理しますか？

**決定**: API Gateway は無効な API キーに対して 403 Forbidden を返します。Verification Stack はこのエラーをログに記録し、Slack に適切なエラーメッセージを返します。

**根拠**:
- API Gateway は無効な API キーに対して 403 Forbidden を返す（標準的な動作）
- 認証失敗はセキュリティイベントとして記録すべき
- エラーメッセージは内部詳細を露出しない（FR-011）
- CloudWatch アラームで認証失敗率を監視可能

**エラーハンドリングフロー**:
1. API Gateway が無効な API キーを検出 → 403 Forbidden を返す
2. Verification Stack が 403 エラーを受信 → エラーログに記録（API キー値は含めない）
3. Verification Stack が Slack にエラーメッセージを返す（ユーザーフレンドリー）
4. CloudWatch アラームが認証失敗率を監視

**エラーメッセージ**:
- ユーザー向け: "AI処理中にエラーが発生しました。しばらくしてから再度お試しください。"
- ログメッセージ: "API Gateway API key authentication failed: {error_details}"（API キー値は含めない）

**代替案の検討**:
- **認証失敗時のリトライ**: 却下 - 認証失敗は一時的な問題ではない
- **IAM 認証へのフォールバック**: 検討したが却下 - セキュリティリスク、設定と矛盾
- **詳細なエラーメッセージ**: 却下 - 内部詳細を露出するリスク

**参考文献**:
- API Gateway エラーレスポンス: https://docs.aws.amazon.com/apigateway/latest/developerguide/handle-errors-in-lambda-integration.html

---

### RQ-07: API キーローテーション

**質問**: API キーをローテーションするにはどうすればよいですか？

**決定**: Secrets Manager で API キーを更新し、新しい API キーを API Gateway に設定します。古い API キーを削除する前に、新しい API キーが動作することを確認します。

**根拠**:
- Secrets Manager で API キーを更新することで、コード変更なしでローテーション可能
- 新しい API キーを API Gateway に設定してから、古いキーを削除することで、ダウンタイムを回避
- Lambda 関数は次回の Secrets Manager 取得時に新しいキーを取得（キャッシュ TTL 後）

**ローテーション手順**:
1. Secrets Manager で新しい API キーを保存
2. API Gateway に新しい API キーを作成
3. 使用量プランに新しい API キーを関連付け
4. 新しい API キーが動作することを確認
5. 古い API キーを API Gateway から削除
6. Secrets Manager から古い API キーを削除（オプション）

**ダウンタイム回避**:
- 新しい API キーと古い API キーの両方を一時的に有効にする
- Lambda 関数のキャッシュ TTL（5 分）後、新しいキーが使用される
- 古いキーを削除する前に、すべてのリクエストが新しいキーを使用していることを確認

**代替案の検討**:
- **自動ローテーション**: 検討したが却下 - Secrets Manager の自動ローテーションは Lambda 関数が必要、複雑
- **手動ローテーション**: 採用 - シンプルで制御可能

**参考文献**:
- Secrets Manager ローテーション: https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html

---

## 決定の要約

| 決定 | 選択 | 根拠 |
|----------|--------|-----------|
| API Gateway API キー認証 | REST API で API キーを設定 | ネイティブサポート、IAM 認証と共存可能 |
| API キー保存 | AWS Secrets Manager | 暗号化、アクセス制御、ローテーションサポート |
| 認証方法の選択 | 環境変数による設定 | シンプル、コード変更なしで切り替え可能 |
| API キー検証 | API Gateway ネイティブ検証 | `x-api-key` ヘッダーで検証、Lambda オーソライザー不要 |
| IAM と API キーの共存 | 同じエンドポイントで両方をサポート | API Gateway が複数認証方法をサポート |
| エラーハンドリング | 403 Forbidden + ログ記録 | セキュリティ監視、ユーザーフレンドリーなエラー |
| API キーローテーション | Secrets Manager で手動更新 | ダウンタイム回避、コード変更不要 |

## 解決された未解決の質問

すべての技術的質問が解決されました。NEEDS CLARIFICATION マーカーは残っていません。

## 次のステップ

Phase 1（設計とコントラクト）に進みます:
1. リクエスト/レスポンスエンティティを含む data-model.md を作成
2. IAM と API キー認証をサポートする contracts/execution-api-dual-auth.yaml OpenAPI 仕様を作成
3. 設定とテスト手順を含む quickstart.md を作成

