# セキュリティ要件

> **🔒 セキュリティファースト原則**
>
> 本システムは、AI の特性を考慮した**多層認証・認可**を採用しています。
> すべてのリクエストは以下の認証・認可レイヤーを通過する必要があります：
>
> 1. ✅ Slack 署名検証（HMAC SHA256）
> 2. ✅ Slack API 動的実在性確認（team_id, user_id, channel_id）
> 3. ✅ ホワイトリスト認可
> 4. ✅ IAM 認証（内部 API）
>
> **2 鍵防御**: いずれかの鍵（Signing Secret または Bot Token）が漏洩しても、
> 両方なければ攻撃は成功しません。

## 防御可能な脅威一覧

本システムの多層防御アーキテクチャは、以下の脅威に対して効果的な防御を提供します：

### 認証・認可関連の脅威

- **T-01: 署名シークレット漏洩** → 2 鍵防御（Existence Check）により影響を「高」から「中」に軽減
- **T-02: Slack アカウント乗っ取り** → SSO + MFA、IP 制限で防御
- **T-03: リプレイアタック** → タイムスタンプ検証（±5 分）で防御
- **T-04: API Gateway URL 漏洩** → 署名検証により不正アクセスをブロック
- **T-05: Lambda IAM ロール侵害** → 最小権限の原則、認証情報ローテーション
- **T-08: 権限昇格** → ホワイトリスト認可、IAM ポリシーレビュー

### AI 特有の脅威

- **T-09: プロンプトインジェクション** → Bedrock Guardrails（99%精度）で検出・ブロック
- **T-10: PII 漏洩** → PII 検出・自動マスキング（日本語対応、85%以上精度）
- **T-11: モデル乱用（コスト）** → トークン制限、ユーザー単位クォータ
- **T-12: コンテキスト履歴情報漏洩** → コンテキスト ID 分離、DynamoDB 暗号化

### その他の脅威

- **T-06: コマンドインジェクション** → 入力検証、パラメータ化クエリ
- **T-07: DDoS / レート乱用** → WAF レート制限、ユーザー単位スロットリング

## 認証・認可フロー

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Slack User Request                                       │
│    ↓ SSO + MFA (Slack レイヤー)                            │
├─────────────────────────────────────────────────────────────┤
│ 2. verification-api                                            │
│    ↓ WAF レート制限                                         │
├─────────────────────────────────────────────────────────────┤
│ 3. verification-lambda (検証層)                                │
│    ├─ 3a. 署名検証 (Signing Secret) ← 鍵1                  │
│    ├─ 3b. Existence Check (Bot Token) ← 鍵2                │
│    │   └─ Slack API (team.info, users.info, conversations) │
│    ├─ 3c. 認可 (ホワイトリスト)                            │
│    └─ 3d. プロンプト検証                                    │
│    ↓ すべて成功時のみ次へ                                   │
├─────────────────────────────────────────────────────────────┤
│ 4. execution-api (IAM 認証)                                 │
│    ↓                                                         │
├─────────────────────────────────────────────────────────────┤
│ 5. execution-lambda → Bedrock                                       │
│    ├─ Guardrails (プロンプトインジェクション検出)          │
│    └─ PII 検出                                              │
└─────────────────────────────────────────────────────────────┘
```

## 4.1 機能的セキュリティ要件

### SR-01: Slack 署名検証

- Slack からのすべてのリクエストは、HMAC SHA256 署名を使用して検証されなければなりません
- タイムスタンプが ±5 分以内であることを確認し、リプレイアタックを防止

### SR-02: 認可

- team_id、user_id、channel_id によるホワイトリスト認可

### SR-03: プロンプトインジェクション防止（AI 特有）

- すべてのユーザー入力は、Bedrock Guardrails で検証され、プロンプトインジェクション攻撃を防がなければなりません
- verification-lambda での基本的なパターン検出と、execution-lambda での Guardrails 適用による多層防御

### SR-04: PII 保護（AI 特有）

- Bedrock のレスポンスからすべての個人識別情報（PII）を削除しなければなりません
- 正規表現ベースの PII 検出（日本語対応）

### SR-05: トークン数制限（AI 特有）

- 各リクエストは最大 4000 トークンを超えてはなりません

### SR-06: Slack API Existence Check (Dynamic Entity Verification)

すべてのリクエストは、Slack API を使用して team_id、user_id、channel_id が実在するエンティティであることを動的に検証しなければなりません。

**セキュリティモデル**:

- Slack API (team.info, users.info, conversations.info) による実在性確認
- Bot Token (xoxb-...) を使用した API 呼び出し
- 2 鍵防御モデル: Signing Secret と Bot Token の両方が必要

**実装レイヤー**: verification-lambda（検証層）

**キャッシュ戦略**:

- 検証成功したエンティティを 5 分間キャッシュ（DynamoDB）
- キャッシュキー: `{team_id}#{user_id}#{channel_id}`
- TTL: 300 秒

**パフォーマンス要件**: Slack API 呼び出しレイテンシ ≤500ms (p95)

## 4.2 非機能的セキュリティ要件

| ID     | 要件                               | 目標値                          | 測定方法                       |
| ------ | ---------------------------------- | ------------------------------- | ------------------------------ |
| NFR-01 | 署名検証レイテンシ                 | ≤50ms（p99）                    | CloudWatch メトリクス          |
| NFR-02 | シークレットローテーション         | 90 日ごと                       | AWS Secrets Manager            |
| NFR-03 | 認証失敗アラートレイテンシ         | ≤1 分                           | CloudWatch アラーム            |
| NFR-04 | セキュリティログ保持               | 365 日                          | S3 + Glacier                   |
| NFR-05 | IAM ポリシーレビュー               | 30 日ごと                       | 手動監査                       |
| NFR-06 | 脆弱性スキャン                     | 週次                            | Snyk、Trivy                    |
| NFR-07 | ペネトレーションテスト             | 四半期ごと                      | 外部企業                       |
| NFR-08 | Bedrock 呼び出しレイテンシ         | ≤5 秒（p95）                    | CloudWatch メトリクス          |
| NFR-09 | プロンプトインジェクション検出率   | ≥95%                            | Guardrails Automated Reasoning |
| NFR-10 | PII 検出精度（日本語）             | ≥85% Recall                     | 正規表現パターンテスト         |
| NFR-11 | ユーザー単位 Bedrock コスト        | ≤$10/月                         | Cost Explorer                  |
| NFR-12 | コンテキスト履歴暗号化             | すべての DynamoDB データ        | KMS 暗号化確認                 |
| NFR-13 | Existence Check レイテンシ         | ≤500ms（p95、キャッシュミス時） | CloudWatch メトリクス          |
| NFR-14 | Existence Check キャッシュヒット率 | ≥80%                            | DynamoDB + CloudWatch          |
| NFR-15 | Slack API 呼び出し成功率           | ≥99%                            | CloudWatch メトリクス          |

---

## 関連ドキュメント

- [アーキテクチャ概要](../architecture/overview.md) - セキュリティ設計の原則
- [脅威モデル](./threat-model.md) - リスク分析とアクター
- [セキュリティ実装](./implementation.md) - 多層防御の実装詳細
- [テストと検証](../operations/testing.md) - セキュリティ検証シナリオ
- [ADR-004](../adr/004-slack-api-existence-check.md) - Existence Check の採用理由
