# Research: Cross-Account Zones Architecture

**Feature**: 010-cross-account-zones  
**Date**: 2025-12-27

## Research Topics

### 1. AWS CDK クロスアカウントデプロイパターン

**Decision**: 各スタックを独立したアプリケーションとしてデプロイし、パラメータ（環境変数、CDK コンテキスト）で相互参照情報を渡す

**Rationale**:

- CloudFormation のクロスアカウントスタック参照は制限が多く、デプロイ順序の依存関係が複雑になる
- SSM Parameter Store や Secrets Manager を使ったクロスアカウント参照は、追加の IAM 権限設定が必要
- 環境変数/CDK コンテキストによるパラメータ渡しが最もシンプルで、単一アカウント/クロスアカウント両方で動作する

**Alternatives considered**:

1. **CloudFormation Exports/Imports**: クロスアカウントでは使用不可
2. **SSM Parameter Store クロスアカウント参照**: 追加の IAM 設定が必要、複雑性が増す
3. **AWS Service Catalog**: オーバーエンジニアリング

### 2. API Gateway クロスアカウント IAM 認証

**Decision**: API Gateway リソースポリシーで呼び出し元アカウント/ロール ARN を明示的に許可し、Lambda は SigV4 署名で API を呼び出す

**Rationale**:

- 既存の ExecutionApi コンストラクトは IAM 認証を使用しており、このパターンを拡張するのが最も自然
- API Gateway リソースポリシーはクロスアカウントアクセス制御の標準パターン
- SigV4 署名は AWS SDK/boto3 で標準サポートされており、追加実装不要

**Alternatives considered**:

1. **Lambda 関数 URL + IAM 認証**: API Gateway より機能が限定的（スロットリング、キャッシュなし）
2. **VPC PrivateLink**: 単一アカウント検証では不要な複雑性
3. **STS AssumeRole**: クロスアカウントロール引き受けは設定が複雑

### 3. デプロイ順序と依存関係の管理

**Decision**: Execution Stack を先にデプロイし、出力（API URL）を取得してから Verification Stack をデプロイ

**Rationale**:

- Verification Stack は Execution API の URL を環境変数として必要とする
- Execution Stack は Verification Lambda のロール ARN をリソースポリシーに設定する必要があるが、これはデプロイ後の更新で対応可能
- この順序により、循環依存を回避できる

**Deployment Flow**:

```
1. Execution Stack デプロイ（API Gateway URL 出力）
2. Verification Stack デプロイ（API URL を環境変数に設定、Lambda ロール ARN 出力）
3. Execution Stack 更新（Verification Lambda ロール ARN をリソースポリシーに追加）
```

**Alternatives considered**:

1. **同時デプロイ**: 循環依存により不可能
2. **Verification Stack 先にデプロイ**: API URL が存在しないため不可能
3. **プレースホルダー URL**: 不必要な複雑性

### 4. リソース配置の決定

**Decision**: 以下のリソース配置を採用

| リソース                  | 配置先             | 理由                         |
| ------------------------- | ------------------ | ---------------------------- |
| SlackEventHandler Lambda  | Verification Stack | Slack 署名検証を担当         |
| Function URL              | Verification Stack | Lambda に付随                |
| DynamoDB テーブル（5 つ） | Verification Stack | 検証層で使用                 |
| Secrets Manager           | Verification Stack | Slack 認証情報は検証層で使用 |
| BedrockProcessor Lambda   | Execution Stack    | AI 処理を担当                |
| API Gateway               | Execution Stack    | 実行層のエントリポイント     |
| CloudWatch アラーム       | 各スタック         | 各スタックのリソースに対応   |

**Rationale**:

- 検証層は「信頼境界」として機能し、すべての認証・認可を担当
- 実行層は「AI 処理」に集中し、Bedrock アクセスを担当
- この分離により、セキュリティ要件の異なるチームが各層を独立して管理可能

### 5. 既存スタックとの後方互換性

**Decision**: 既存の SlackBedrockStack を維持し、非推奨（deprecated）としてマーク。新規デプロイは分離スタック構成を推奨。

**Rationale**:

- 既存ユーザーの移行を強制しない
- 段階的な移行パスを提供
- 既存の E2E テストは引き続き動作

**Migration Path**:

1. 既存スタックをそのまま運用可能
2. 新規デプロイは分離スタック構成を使用
3. 移行ガイドを提供し、ユーザーのタイミングで移行

### 6. テスト戦略

**Decision**: 以下のテストレベルを実装

| テストレベル     | 対象             | ツール            |
| ---------------- | ---------------- | ----------------- |
| Unit Test        | 各コンストラクト | Jest              |
| Integration Test | スタック間通信   | Jest + AWS SDK    |
| E2E Test         | Slack → AI 応答  | 手動 + スクリプト |

**Rationale**:

- 既存のテストパターンを踏襲
- スタック分離による新しいテストケースを追加

## 技術的決定のまとめ

| 領域                 | 決定                                                 |
| -------------------- | ---------------------------------------------------- |
| スタック分離         | VerificationStack + ExecutionStack の 2 スタック構成 |
| クロスアカウント通信 | API Gateway リソースポリシー + SigV4 署名            |
| デプロイ順序         | Execution → Verification → Execution 更新            |
| パラメータ管理       | CDK コンテキスト + 環境変数                          |
| 後方互換性           | 既存 SlackBedrockStack を非推奨として維持            |
