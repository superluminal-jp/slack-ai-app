# 付録

A: 用語集

| 用語                                        | 定義                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| **HMAC SHA256**                             | SHA-256 ハッシュ関数を使用したハッシュベースメッセージ認証コード               |
| **IAM SigV4**                               | AWS Signature Version 4、AWS API リクエストの暗号化署名プロトコル              |
| **Two-Key Defense (2鍵防御)**              | Signing Secret と Bot Token の両方を使用した多層認証モデル。いずれか漏洩時も攻撃面を縮小 |
| **Existence Check**                         | Slack API を使用して team_id, user_id, channel_id の実在性を動的に確認するセキュリティ機能 |
| **プロンプトインジェクション**              | 悪意のある入力で AI のシステムプロンプトを上書きまたはジェイルブレイクする攻撃 |
| **Bedrock Guardrails**                      | AWS Bedrock の安全機能。有害コンテンツ、PII、プロンプトインジェクションを検出  |
| **PII (Personal Identifiable Information)** | 個人を識別できる情報（メール、電話、住所、名前など）                           |
| **トークン**                                | LLM が処理するテキストの最小単位。日本語では約 4 文字 = 1 トークン             |
| **ジェイルブレイク**                        | AI の安全制約を回避して不適切な応答を引き出す試み                              |
| **fail-closed**                             | セキュリティ失敗時にリクエストを拒否する原則（セキュリティを可用性より優先）   |

---

## 付録 B: 参考資料

- [Slack: Slack からのリクエストの検証](https://api.slack.com/authentication/verifying-requests-from-slack)
- [Slack API: team.info](https://api.slack.com/methods/team.info)
- [Slack API: users.info](https://api.slack.com/methods/users.info)
- [Slack API: conversations.info](https://api.slack.com/methods/conversations.info)
- [Slack API Rate Limits](https://api.slack.com/docs/rate-limits)
- [AWS Bedrock Guardrails](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)
- [AWS Bedrock Security Best Practices](https://docs.aws.amazon.com/bedrock/latest/userguide/security-best-practices.html)
- [AWS DynamoDB TTL](https://docs.aws.amazon.com/amazon-dynamodb/latest/developerguide/TTL.html)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [EU AI Act](https://artificialintelligenceact.eu/)

---

## 関連ドキュメント

- [機能要件](./requirements/functional-requirements.md) - 用語の定義と文脈
- [アーキテクチャ概要](./architecture/overview.md) - システム全体の理解
