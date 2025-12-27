# Implementation Plan: Cross-Account Zones Architecture

**Branch**: `010-cross-account-zones` | **Date**: 2025-12-27 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/010-cross-account-zones/spec.md`

## Summary

Verification Zone（検証層）と Execution Zone（実行層）を異なる AWS アカウントにデプロイ可能にするためのアーキテクチャ再設計。現時点では 1 アカウントのみ利用可能なため、クロスアカウント対応のアーキテクチャを設計・実装し、単一アカウント内で動作検証を行う。主な変更点:

1. 単一スタック（SlackBedrockStack）を 2 つの独立スタック（VerificationStack, ExecutionStack）に分離
2. クロスアカウント対応の IAM 認証パターン（API Gateway リソースポリシー + SigV4 署名）を実装
3. CloudFormation クロススタック参照を排除し、パラメータベースの設定に移行

## Technical Context

**Language/Version**: TypeScript 5.x (CDK), Python 3.11 (Lambda)  
**Primary Dependencies**: AWS CDK 2.x, aws-cdk-lib, constructs  
**Storage**: DynamoDB (既存テーブル構造を維持)  
**Testing**: Jest (CDK), pytest (Lambda)  
**Target Platform**: AWS Lambda, API Gateway, DynamoDB  
**Project Type**: Infrastructure as Code (CDK) + Serverless  
**Performance Goals**: 既存と同等（Slack 応答 30 秒以内）  
**Constraints**:

- CloudFormation クロススタック参照なし
- 同一リージョン内でのデプロイ
- デプロイ順序: Execution Stack → Verification Stack

**Scale/Scope**: 2 スタック、同一アカウント内での検証

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status  | Notes                                                                            |
| --------------------------------- | ------- | -------------------------------------------------------------------------------- |
| I. Security-First Architecture    | ✅ PASS | クロスアカウント IAM 認証（SigV4）、API Gateway リソースポリシーで多層防御を維持 |
| II. Non-Blocking Async Processing | ✅ PASS | 変更なし。Lambda①→API Gateway→Lambda② の非同期パターンを維持                     |
| III. Context History Management   | ✅ PASS | 変更なし。DynamoDB テーブルは Verification Stack に配置                          |
| IV. Observability & Monitoring    | ✅ PASS | 各スタックに CloudWatch アラームを配置。相関 ID は維持                           |
| V. Error Handling & Resilience    | ✅ PASS | スタック間通信エラーの適切なハンドリングを追加                                   |
| VI. Cost Management               | ✅ PASS | 変更なし。Bedrock トークン制限は維持                                             |
| VII. Compliance Standards         | ✅ PASS | 監査ログ（CloudTrail）は各アカウントで有効化                                     |
| VIII. Testing Discipline          | ✅ PASS | スタック分離の統合テストを追加                                                   |

**Gate Status**: ✅ PASSED - No violations

## Project Structure

### Documentation (this feature)

```text
specs/010-cross-account-zones/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── cross-account-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cdk/
├── bin/
│   └── cdk.ts                    # エントリポイント（更新）
├── lib/
│   ├── verification-stack.ts     # 新規: 検証層スタック
│   ├── execution-stack.ts        # 新規: 実行層スタック
│   ├── slack-bedrock-stack.ts    # 既存: 後方互換性のため維持（非推奨）
│   └── constructs/               # 既存コンストラクト（変更なし）
│       ├── slack-event-handler.ts
│       ├── bedrock-processor.ts
│       ├── execution-api.ts
│       ├── token-storage.ts
│       ├── event-dedupe.ts
│       ├── existence-check-cache.ts
│       ├── whitelist-config.ts
│       ├── rate-limit.ts
│       └── api-gateway-monitoring.ts
└── test/
    ├── verification-stack.test.ts  # 新規
    ├── execution-stack.test.ts     # 新規
    └── cross-account.test.ts       # 新規: 統合テスト

lambda/
├── slack-event-handler/   # 変更なし
└── bedrock-processor/     # 変更なし
```

**Structure Decision**: 既存の CDK プロジェクト構造を維持しつつ、新しいスタックファイル（verification-stack.ts, execution-stack.ts）を追加。既存の slack-bedrock-stack.ts は後方互換性のため維持するが、非推奨とする。

## Complexity Tracking

> **No violations - this section is not required**

Constitution Check で違反がないため、複雑性の正当化は不要。
