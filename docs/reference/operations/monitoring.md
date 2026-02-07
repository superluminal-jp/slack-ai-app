# モニタリング & インシデントレスポンス

## 10.1 CloudWatch アラーム（AI 特有を含む）

| アラーム                             | メトリクス                              | 閾値                     | アクション                           |
| ------------------------------------ | --------------------------------------- | ------------------------ | ------------------------------------ |
| **署名検証失敗**                     | カスタム: `SignatureVerificationFailed` | 5 分間に 5 回以上        | SNS → PagerDuty → セキュリティチーム |
| **Guardrails ブロック**              | カスタム: `GuardrailsBlocked`           | 1 時間に 20 回以上       | SNS → AI 運用チーム                  |
| **Bedrock コスト超過**               | Cost Explorer                           | ユーザー単位で$10/月超過 | SNS → 財務チーム                     |
| **Bedrock エラー率**                 | `Errors`                                | 5%以上                   | SNS → エンジニアリングチーム         |
| **レイテンシ**                       | `Duration`                              | p95 で 5 秒以上          | SNS → エンジニアリングチーム         |
| **Existence Check 失敗**             | カスタム: `ExistenceCheckFailed` (namespace: `SlackEventHandler`) | 5 分間に 5 回以上        | SNS → PagerDuty → セキュリティチーム |
| **Slack API レート制限**             | カスタム: `ExistenceCheckFailed` (rate_limit エラー) | 1 時間に 10 回以上       | SNS → エンジニアリングチーム         |
| **Existence Check キャッシュヒット率** | カスタム: `ExistenceCheckCacheHit` / (`ExistenceCheckCacheHit` + `ExistenceCheckCacheMiss`) | <80% が 10 分間継続      | SNS → エンジニアリングチーム         |
| **Slack API レイテンシ**             | カスタム: `SlackAPILatency` (namespace: `SlackEventHandler`) | p95 > 500ms が 5 分間継続 | SNS → エンジニアリングチーム         |

---

## 10.2 インシデントレスポンスプレイブック

### シナリオ: 不正リクエストの大規模試行

**検出**:

- 署名検証失敗アラームが継続的にトリガー
- 特定ユーザーまたは IP から大量の不正リクエスト
- Guardrails ブロック率の急増

**対応手順**:

1. **即時対応（T+0 分）**:

   - 攻撃元ユーザー ID を特定（CloudWatch ログ）
   - 該当ユーザーを一時的にホワイトリストから削除
   - WAF ルールで攻撃パターンをブロック
   - セキュリティチームにアラート

2. **短期対応（T+1 時間）**:

   - CloudWatch Logs で攻撃パターンを分析
   - 新しいインジェクションパターンを検出ルールに追加
   - Bedrock Guardrails 設定を強化
   - 影響を受けたコンテキスト履歴を確認

3. **中期対応（T+24 時間）**:

   - セキュリティ検出ルールを更新
   - SlackEventHandler と BedrockProcessor のコードをデプロイ
   - 攻撃パターンをドキュメント化
   - 脅威モデルを更新

4. **長期対応（T+1 週間）**:
   - Red Team によるペネトレーションテスト実施
   - プロンプトエンジニアリングトレーニング（ユーザー向け）
   - Bedrock Guardrails のカスタムワードリスト更新

### シナリオ: Existence Check 失敗の大規模発生（Signing Secret 漏洩疑い）

**検出**:

- Existence Check 失敗アラームが継続的にトリガー
- 偽造された team_id/user_id/channel_id を使用した大量のリクエスト
- CloudWatch Logs に "team_not_found" エラーが頻発

**初期対応（0-15 分）**:

1. セキュリティチームにページャー通知
2. CloudWatch Logs Insights でアクセスパターンを分析:
   ```
   fields @timestamp, team_id, user_id, channel_id, source_ip
   | filter event = "ExistenceCheckFailed"
   | stats count() by team_id, source_ip
   | sort count desc
   ```
3. 攻撃元 IP を特定し、WAF でブロック
4. Signing Secret 漏洩の可能性を評価

**封じ込め（15-60 分）**:

1. **Signing Secret の即時ローテーション**:
   - AWS Secrets Manager で新しい Signing Secret を生成
   - Slack App 設定で新しい Signing Secret を更新
   - 古い Signing Secret は無効化
2. Bot Token のローテーション（念のため）
3. すべてのチーム・ユーザーに通知

**根絶（1-4 時間）**:

1. GitHub、CloudWatch Logs、S3 で Signing Secret 漏洩元を調査
2. 漏洩原因を特定し、修正
3. 侵害されたリソースを洗い出し

**回復（4-24 時間）**:

1. 通常運用に復帰
2. モニタリング強化（異常検知）
3. インシデントレポート作成

**事後対応（1-2 週間）**:

1. Signing Secret ローテーションプロセスの自動化を検討
2. Existence Check のしきい値調整
3. セキュリティトレーニング実施

---

## 結論

このアーキテクチャは、**Slack ワークスペースから AWS Bedrock を利用して AI 機能を提供する**ことを実現します。ユーザーは Slack 上で多様な AI 機能を利用し、高品質なレスポンスを得ることができます。

**主な成果**:

1. **機能実現**: Slack から AI 機能を利用できる環境を構築（会話、画像生成、コード生成、データ分析など）
2. **優れたユーザー体験**: 2 秒以内の初期応答、Bedrock の処理完了後に最終レスポンス、非ブロッキング処理
3. **コンテキスト履歴管理**: コンテキストを保持した連続的な処理が可能
4. **セキュリティ保護**: 多層防御、Guardrails により安全に運用
5. **モデル選択の柔軟性**: AWS Bedrock の多様な Foundation Model から要件に応じて選択可能
6. **コスト管理**: トークン制限でユーザー単位$10/月以下を実現
7. **スケーラビリティ**: サーバーレスアーキテクチャで自動スケール

**技術仕様（2025 年 11 月最新）**:

- **モデル**: AWS Bedrock Foundation Model（要件に応じて選択：Claude、Titan、Llama など）
- **Model ID**: 環境変数 `BEDROCK_MODEL_ID` で設定（デフォルト例: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`）
- **Guardrails**: Automated Reasoning checks、60 言語対応、コーディングユースケース対応
- **セキュリティ**: 多層防御による安全な実行

**次のステップ**:

- 提供されたコード例を使用して SlackEventHandler と BedrockProcessor を実装
- セキュリティ設計を実装
- 要件に応じて適切な Bedrock Foundation Model を選択
- Bedrock Guardrails を設定（Automated Reasoning、有害コンテンツ）
- DynamoDB コンテキスト履歴テーブルを作成（KMS 暗号化有効化）
- ユーザー単位の Bedrock コストモニタリングを設定

**参考資料（2025 年最新）**:

- [Amazon Bedrock Foundation Models](https://docs.aws.amazon.com/bedrock/latest/userguide/foundation-models.html)
- [Amazon Bedrock Guardrails - Coding Use Cases (Nov 2025)](https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-bedrock-guardrails-coding-use-cases/)
- [Automated Reasoning checks in Bedrock Guardrails (Aug 2025)](https://aws.amazon.com/about-aws/whats-new/2025/08/automated-reasoning-checks-amazon-bedrock-guardrails/)
- [Slack API response_url Webhooks](https://api.slack.com/messaging/webhooks)

---

## 10.5 AgentCore A2A メトリクス（Feature Flag: USE_AGENTCORE）

AgentCore A2A パスが有効な場合、以下の追加メトリクスが監視対象となります：

| メトリクス | 名前空間 | 説明 |
|-----------|---------|------|
| `A2AInvocationSuccess` | VerificationAgent | A2A 通信成功回数 |
| `A2AInvocationFailed` | VerificationAgent | A2A 通信失敗回数 |
| `A2AInvocationLatency` | VerificationAgent | A2A 通信レイテンシ（ミリ秒） |
| `AsyncTaskCompleted` | ExecutionAgent | 非同期タスク完了回数 |
| `AsyncTaskFailed` | ExecutionAgent | 非同期タスク失敗回数 |
| `BedrockInvocationLatency` | ExecutionAgent | Bedrock 呼び出しレイテンシ（ミリ秒） |

### AgentCore Runtime ログ

AgentCore Runtime のログは CloudWatch Logs に出力されます：

```bash
# Verification Agent ログ
aws logs tail /aws/agentcore/verification-agent --follow

# Execution Agent ログ
aws logs tail /aws/agentcore/execution-agent --follow
```

---

## 関連ドキュメント

- [テストと検証](./testing.md) - テスト戦略と検証手順
- [セキュリティ実装](../security/implementation.md) - セキュリティ実装詳細
- [実装ロードマップ](../../implementation/roadmap.md) - 実装計画とフェーズ
- [ゾーン間通信](../architecture/zone-communication.md) - 通信パスの詳細
