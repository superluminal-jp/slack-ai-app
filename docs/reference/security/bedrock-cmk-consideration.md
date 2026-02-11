# Bedrock / AgentCore CMK 検討ガイド

**ドキュメントタイプ**: セキュリティガイド
**ステータス**: 推奨
**バージョン**: 1.0
**最終更新日**: 2026-02-11
**関連 spec**: 026-best-practices-alignment

---

## 概要

Amazon Bedrock および Bedrock AgentCore は、デフォルトで AWS 管理キー（SSE）によりデータを暗号化します。規制要件（HIPAA、PCI-DSS、GDPR 等）や組織ポリシーでカスタマー管理キー（CMK）の使用が求められる場合、本ガイドを参照して検討してください。

## 現状

- **Bedrock Converse API**（Execution Agent の bedrock-runtime クライアント）: AWS 管理キー使用
- **InvokeAgentRuntime**（AgentCore）: AWS 管理キー使用
- **AgentCore Runtime コンテナ**: デフォルトの EBS/ボリューム暗号化

## CMK が必要なケース

| 要件 | 説明 |
|------|------|
| HIPAA | 医療データの暗号化キーを顧客管理とする要件 |
| PCI-DSS | クレジットカードデータのキー管理要件 |
| 組織ポリシー | すべての AI 入出力を CMK で暗号化する方針 |
| キーローテーション | 独自のローテーション周期でキーを管理したい場合 |

## Bedrock での CMK 有効化

- [Encryption of agent resources with customer managed keys (CMK)](https://docs.aws.amazon.com/bedrock/latest/userguide/cmk-agent-resources.html)
- CMK 対応フィールド: エージェントの説明、指示、プロンプトテンプレート等。アクション名・知識ベース名は CMK 非対応のため、PII を含めないこと。

## AgentCore Runtime での CMK

- AgentCore Runtime はコンテナベース。ランタイムの暗号化設定は AWS ドキュメントで確認。
- コンテナイメージ（ECR）: ECR の暗号化設定で CMK を指定可能。

## 推奨アクション

1. **規制要件がない場合**: 現状の AWS 管理キーで十分。追加対応不要。
2. **規制要件がある場合**: 
   - Bedrock の CMK 対応フィールドを確認
   - KMS キーポリシーを作成し、Bedrock サービスに必要な権限を付与
   - デプロイ前に cdk.config 等で CMK ARN を設定
3. **検討時**: キー管理の運用負荷（ローテーション、アクセス監査）を評価する。

## 参照

- [Preventative security best practice for agents](https://docs.aws.amazon.com/bedrock/latest/userguide/security-best-practice-agents.html)
- [Security, privacy, and responsible AI](https://aws.amazon.com/bedrock/security-privacy-responsible-ai/)
