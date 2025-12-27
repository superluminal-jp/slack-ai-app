# Implementation Plan: Verification Zone Slack Response Handling

**Branch**: `011-verification-slack-response` | **Date**: 2025-01-30 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/011-verification-slack-response/spec.md`

## Summary

Execution Zone（実行層）からのレスポンスを Verification Zone（検証層）経由で Slack に投稿するようにアーキテクチャを変更。現状では Execution Zone が Bedrock API を呼び出した後、直接 Slack API にレスポンスを投稿しているが、これを変更し、Execution Zone は外部 API 呼び出しに専念し、Slack への通信は Verification Zone が一元管理する責任分離を実現する。主な変更点:

1. Execution Zone から Slack API への直接アクセスを排除（IAM ロールから権限削除、コードから呼び出し削除）
2. Execution Zone は Bedrock API を呼び出し、結果を構造化された JSON レスポンスとして Verification Zone に返す
3. Verification Zone は Execution Zone からのレスポンスを受け取り、Slack API に投稿する
4. 既存の API Gateway 経由の通信パターンを維持し、レスポンスも同じ経路で返す

## Technical Context

**Language/Version**: Python 3.11 (Lambda), TypeScript 5.x (CDK)  
**Primary Dependencies**:

- Python: slack-sdk, boto3 (Bedrock SDK), requests
- TypeScript: AWS CDK 2.x, aws-cdk-lib, constructs  
  **Storage**: DynamoDB (既存テーブル構造を維持、変更なし)  
  **Testing**: pytest (Lambda), Jest (CDK)  
  **Target Platform**: AWS Lambda, API Gateway, DynamoDB  
  **Project Type**: Serverless (Lambda + API Gateway)  
  **Performance Goals**: 既存と同等（Slack 応答 30 秒以内、検証ゾーン即座応答 3 秒以内）  
  **Constraints**:
- 既存の API Gateway エンドポイントとリクエスト形式を維持（後方互換性）
- 実行ゾーンの Bedrock API 呼び出しは非同期で、完了後に検証ゾーンにレスポンスを返す
- 検証ゾーンは実行ゾーンからのレスポンスを SQS キュー経由で非同期に受け取る（Phase 0 の research.md で決定）
- Slack のメッセージサイズ制限（約 4000 文字）を考慮
- 既存の 30 秒タイムアウトを維持

**Scale/Scope**:

- 2 つの Lambda 関数（検証ゾーン、実行ゾーン）の変更
- API Gateway レスポンス形式の変更
- IAM ロールの権限変更

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                         | Status  | Notes                                                                                                                                  |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| I. Security-First Architecture    | ✅ PASS | 検証ゾーンが Slack 通信を一元管理することで、セキュリティ境界が明確化。実行ゾーンは Slack API へのアクセス権限を削除                   |
| II. Non-Blocking Async Processing | ✅ PASS | 検証ゾーンは即座に 200 OK を返し、実行ゾーンからのレスポンスを SQS キュー経由で非同期に受け取る。Slack の 3 秒タイムアウト制約を満たす |
| III. Context History Management   | ✅ PASS | 変更なし。DynamoDB テーブルは既存のまま維持                                                                                            |
| IV. Observability & Monitoring    | ✅ PASS | 相関 ID を維持し、レスポンスフロー全体をトレーシング可能。構造化ログを維持                                                             |
| V. Error Handling & Resilience    | ✅ PASS | 実行ゾーンエラー、検証ゾーンエラー、タイムアウトの適切なハンドリングを実装                                                             |
| VI. Cost Management               | ✅ PASS | 変更なし。Bedrock トークン制限は維持                                                                                                   |
| VII. Compliance Standards         | ✅ PASS | 監査ログ（CloudTrail）は維持。Slack API へのアクセスは検証ゾーンのみに集約                                                             |
| VIII. Testing Discipline          | ✅ PASS | レスポンスフローの統合テストを追加。エラーハンドリングのテストを追加                                                                   |

**Gate Status**: ✅ PASSED - Phase 0 の research.md で非同期コールバックパターン（SQS）を決定。検証ゾーンは即座に 200 OK を返し、実行ゾーンからのレスポンスを SQS キュー経由で非同期に受け取る

## Project Structure

### Documentation (this feature)

```text
specs/011-verification-slack-response/
├── plan.md              # This file
├── research.md          # Phase 0 output (同期/非同期パターンの検討)
├── data-model.md        # Phase 1 output (ExecutionResponse エンティティ定義)
├── quickstart.md        # Phase 1 output (実装ガイド)
├── contracts/           # Phase 1 output
│   └── execution-response-api.yaml  # Execution Zone から Verification Zone へのレスポンス形式
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
cdk/
├── lib/
│   ├── execution-stack.ts           # 変更: BedrockProcessor Lambda の IAM ロールから Slack API 権限を削除
│   ├── verification-stack.ts        # 変更: SlackEventHandler Lambda にレスポンスハンドラーを追加
│   └── constructs/
│       ├── bedrock-processor.ts     # 変更: Slack API 呼び出しを削除、レスポンス形式を変更
│       └── slack-event-handler.ts   # 変更: 実行ゾーンからのレスポンスを受け取り、Slack に投稿

lambda/
├── execution-stack/
│   └── bedrock-processor/
│       ├── handler.py                # 変更: post_to_slack() 呼び出しを削除、レスポンスを返す形式に変更
│       ├── slack_poster.py           # 削除: Slack API 呼び出しコードを削除（検証ゾーンに移動）
│       └── response_formatter.py    # 新規: レスポンスを構造化された JSON 形式にフォーマット
│
└── verification-stack/
    └── slack-event-handler/
        ├── handler.py                # 変更: 実行ゾーンからのレスポンスを受け取り、Slack に投稿
        ├── response_handler.py       # 新規: 実行ゾーンからのレスポンスを処理し、Slack に投稿
        └── slack_poster.py           # 新規: Slack API への投稿ロジック（実行ゾーンから移動）
```

**Structure Decision**: 既存の Lambda 関数構造を維持しつつ、Slack API 呼び出しロジックを検証ゾーンに集約。実行ゾーンはレスポンスフォーマッターを追加して、構造化された JSON レスポンスを返す。

## Complexity Tracking

> **No violations - this section is not required**

Constitution Check で明確化が必要だった点（Principle II）は Phase 0 の research.md で解決済み。非同期コールバックパターン（SQS）を採用。
