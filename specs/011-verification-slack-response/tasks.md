# Implementation Tasks: Verification Zone Slack Response Handling

**Feature**: 011-verification-slack-response  
**Branch**: `011-verification-slack-response`  
**Date**: 2025-01-30  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

このタスクリストは、Execution Zone（実行層）からのレスポンスを Verification Zone（検証層）経由で Slack に投稿するようにアーキテクチャを変更する実装タスクを定義します。

**MVP Scope**: Phase 1-3 (User Story 1 まで) で基本的な機能を実装

## Dependencies

### User Story Completion Order

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational)
    ↓
Phase 3 (US1: 検証ゾーン経由でのSlack投稿) ← MVP
    ↓
Phase 4 (US2: 実行ゾーンの外部API呼び出し専念)
    ↓
Phase 5 (US3: 検証ゾーンによるSlack通信の一元管理)
    ↓
Phase 6 (US4: エラーハンドリングとフォールバック)
    ↓
Phase 7 (Polish)
```

### Parallel Execution Opportunities

- **Phase 3**: SQS 送信実装とレスポンスハンドラー実装は並行可能（異なるファイル）
- **Phase 4**: IAM ロール更新とコード削除は並行可能
- **Phase 5**: 監査ログとセキュリティテストは並行可能

## Implementation Strategy

**MVP First**: Phase 1-3 で基本的な機能を実装し、検証ゾーン経由での Slack 投稿を実現

**Incremental Delivery**:

1. Phase 1-2: インフラと基盤の準備
2. Phase 3: 基本的なフロー実装（MVP）
3. Phase 4-5: 責任分離とセキュリティ強化
4. Phase 6: エラーハンドリング強化
5. Phase 7: 統合テストとドキュメント更新

---

## Phase 1: Setup

**Goal**: SQS キューと IAM ロールの設定

**Independent Test**: SQS キューが作成され、実行ゾーンのロールから送信可能であることを確認

### Infrastructure Setup

- [x] T001 Create SQS queue `execution-response-queue` in `cdk/lib/verification-stack.ts`
- [x] T002 Create DLQ `execution-response-dlq` in `cdk/lib/verification-stack.ts`
- [x] T003 Configure SQS queue visibility timeout (30 seconds) in `cdk/lib/verification-stack.ts`
- [x] T004 Configure SQS queue message retention period (14 days) in `cdk/lib/verification-stack.ts`
- [x] T005 [P] Add SQS send permission to execution zone Lambda role in `cdk/lib/execution-stack.ts`
- [x] T006 [P] Configure SQS queue resource policy to allow execution zone role ARN in `cdk/lib/verification-stack.ts`
- [x] T007 Export SQS queue URL as stack output in `cdk/lib/verification-stack.ts`
- [x] T008 Export SQS queue ARN as stack output in `cdk/lib/verification-stack.ts`

---

## Phase 2: Foundational

**Goal**: レスポンスフォーマッターと SQS クライアントの実装

**Independent Test**: ExecutionResponse 形式でレスポンスをフォーマットし、SQS に送信できることを確認

### Response Formatter

- [x] T009 [P] Create `lambda/execution-stack/bedrock-processor/response_formatter.py` with `format_success_response()` function
- [x] T010 [P] Create `lambda/execution-stack/bedrock-processor/response_formatter.py` with `format_error_response()` function
- [x] T011 [P] Add validation for ExecutionResponse format in `lambda/execution-stack/bedrock-processor/response_formatter.py`
- [x] T012 [P] Add unit tests for response formatter in `lambda/execution-stack/bedrock-processor/tests/test_response_formatter.py`

### SQS Client

- [x] T013 [P] Create `lambda/execution-stack/bedrock-processor/sqs_client.py` with `send_response_to_queue()` function
- [x] T014 [P] Add error handling for SQS send failures in `lambda/execution-stack/bedrock-processor/sqs_client.py`
- [x] T015 [P] Add retry logic for transient SQS errors in `lambda/execution-stack/bedrock-processor/sqs_client.py`
- [x] T016 [P] Add unit tests for SQS client in `lambda/execution-stack/bedrock-processor/tests/test_sqs_client.py`

---

## Phase 3: User Story 1 - 検証ゾーン経由での Slack 投稿

**Goal**: 実行ゾーンが Bedrock API を呼び出してレスポンスを生成し、検証ゾーンが Slack に投稿する

**Independent Test**: Slack からメッセージを送信し、検証ゾーンが実行ゾーンからのレスポンスを受け取り、Slack に投稿することを確認

### Execution Zone Changes

- [x] T017 [US1] Remove `post_to_slack()` call from success path in `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T018 [US1] Replace `post_to_slack()` with SQS send in success path in `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T019 [US1] Remove `post_to_slack()` call from error paths in `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T020 [US1] Replace error `post_to_slack()` calls with SQS send in `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T021 [US1] Add SQS queue URL environment variable to BedrockProcessor Lambda in `cdk/lib/constructs/bedrock-processor.ts`
- [x] T022 [US1] Update handler to use response formatter and SQS client in `lambda/execution-stack/bedrock-processor/handler.py`

### Verification Zone Changes

- [x] T023 [US1] [P] Create new Lambda function `slack-response-handler` in `cdk/lib/constructs/slack-response-handler.ts`
- [x] T024 [US1] [P] Configure SQS event source mapping for `slack-response-handler` in `cdk/lib/constructs/slack-response-handler.ts`
- [x] T025 [US1] [P] Create `lambda/verification-stack/slack-response-handler/handler.py` with SQS event handler
- [x] T026 [US1] [P] Create `lambda/verification-stack/slack-response-handler/response_handler.py` with `parse_execution_response()` function
- [x] T027 [US1] [P] Create `lambda/verification-stack/slack-response-handler/slack_poster.py` with `post_to_slack()` function (moved from execution zone)
- [x] T028 [US1] [P] Add Slack API permissions to `slack-response-handler` Lambda role in `cdk/lib/constructs/slack-response-handler.ts`
- [x] T029 [US1] [P] Implement message size splitting (4000 char limit) in `lambda/verification-stack/slack-response-handler/slack_poster.py`
- [ ] T030 [US1] Add integration test for end-to-end flow in `tests/integration/test_verification_slack_response.py`

---

## Phase 4: User Story 2 - 実行ゾーンの外部 API 呼び出し専念

**Goal**: 実行ゾーンが Slack API への直接アクセスを持たず、外部 API 呼び出しに専念できる

**Independent Test**: 実行ゾーンの IAM ロールとコードを確認し、Slack API へのアクセス権限や呼び出しコードが存在しないことを確認

### IAM Role Updates

- [x] T031 [US2] Remove Slack API permissions from BedrockProcessor Lambda role in `cdk/lib/constructs/bedrock-processor.ts`
- [x] T032 [US2] Verify Slack API permissions are removed in `cdk/lib/execution-stack.ts`

### Code Cleanup

- [x] T033 [US2] [P] Delete `lambda/execution-stack/bedrock-processor/slack_poster.py` file
- [x] T034 [US2] [P] Remove `slack_poster` import from `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T035 [US2] [P] Remove any remaining Slack SDK dependencies from execution zone in `lambda/execution-stack/bedrock-processor/requirements.txt`
- [ ] T036 [US2] Add verification test to ensure no Slack API calls in execution zone code

---

## Phase 5: User Story 3 - 検証ゾーンによる Slack 通信の一元管理

**Goal**: Slack への通信が検証ゾーンで一元管理され、セキュリティ境界が明確になる

**Independent Test**: 検証ゾーンが Slack API へのすべての通信を担当し、実行ゾーンが Slack API にアクセスしないことを確認

### Security Audit

- [ ] T037 [US3] [P] Add CloudWatch Logs Insights query to verify all Slack API calls come from verification zone
- [ ] T038 [US3] [P] Add IAM policy check to ensure execution zone has no Slack API permissions
- [ ] T039 [US3] Add documentation for security boundary in `docs/reference/architecture/overview.md`

### Monitoring

- [x] T040 [US3] [P] Add CloudWatch metric for Slack API calls from verification zone in `cdk/lib/constructs/slack-response-handler.ts`
- [x] T041 [US3] [P] Add CloudWatch alarm for Slack API failures in `cdk/lib/constructs/slack-response-handler.ts`
- [x] T042 [US3] Add correlation ID tracking across SQS message flow

---

## Phase 6: User Story 4 - エラーハンドリングとフォールバック

**Goal**: 実行ゾーンまたは検証ゾーンでエラーが発生した場合でも、適切なエラーメッセージが Slack に表示される

**Independent Test**: 各種エラーシナリオ（実行ゾーンエラー、検証ゾーンエラー、ネットワークエラー）で適切なエラーメッセージが表示されることを確認

### Error Handling in Execution Zone

- [x] T043 [US4] Ensure all error paths send error response to SQS in `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T044 [US4] Add user-friendly error messages for all error codes in `lambda/execution-stack/bedrock-processor/handler.py`
- [x] T045 [US4] Add error response formatting for attachment processing errors in `lambda/execution-stack/bedrock-processor/handler.py`

### Error Handling in Verification Zone

- [x] T046 [US4] [P] Add validation for ExecutionResponse format in `lambda/verification-stack/slack-response-handler/response_handler.py`
- [x] T047 [US4] [P] Add error handling for invalid SQS message format in `lambda/verification-stack/slack-response-handler/handler.py`
- [x] T048 [US4] [P] Add retry logic for Slack API failures in `lambda/verification-stack/slack-response-handler/slack_poster.py`
- [x] T049 [US4] [P] Add DLQ processing for failed messages in `cdk/lib/constructs/slack-response-handler.ts`
- [x] T050 [US4] Add timeout handling for SQS message processing in `lambda/verification-stack/slack-response-handler/handler.py`

### Error Scenarios Testing

- [ ] T051 [US4] Add test for Bedrock API timeout error handling
- [ ] T052 [US4] Add test for SQS send failure error handling
- [ ] T053 [US4] Add test for Slack API post failure error handling
- [ ] T054 [US4] Add test for invalid ExecutionResponse format handling

---

## Phase 7: Polish & Cross-Cutting Concerns

**Goal**: 統合テスト、ドキュメント更新、パフォーマンス最適化

### Integration Testing

- [ ] T055 Add end-to-end integration test for successful flow in `tests/integration/test_verification_slack_response_e2e.py`
- [ ] T056 Add integration test for error flow in `tests/integration/test_verification_slack_response_e2e.py`
- [ ] T057 Add integration test for large message splitting in `tests/integration/test_verification_slack_response_e2e.py`
- [ ] T058 Add integration test for cross-account SQS access in `tests/integration/test_cross_account_sqs.py`

### Documentation Updates

- [x] T059 Update architecture diagram in `docs/reference/architecture/overview.md` to show SQS flow
- [x] T060 Update implementation details in `docs/reference/architecture/implementation-details.md`
- [x] T061 Update README.md with new architecture flow
- [x] T062 Update README.ja.md with new architecture flow
- [x] T063 Add SQS configuration to quickstart guide in `docs/quickstart.md`

### Performance Optimization

- [ ] T064 Verify response time meets 30-second SLA
- [ ] T065 Optimize SQS batch processing if needed
- [ ] T066 Add CloudWatch dashboard for SQS metrics

### Code Quality

- [ ] T067 Run linter and fix any issues
- [ ] T068 Run type checker and fix any issues
- [ ] T069 Update code comments and docstrings
- [ ] T070 Review and update error messages for consistency

---

## Task Summary

**Total Tasks**: 70

**By Phase**:

- Phase 1 (Setup): 8 tasks
- Phase 2 (Foundational): 8 tasks
- Phase 3 (US1): 14 tasks
- Phase 4 (US2): 6 tasks
- Phase 5 (US3): 6 tasks
- Phase 6 (US4): 12 tasks
- Phase 7 (Polish): 16 tasks

**By User Story**:

- User Story 1: 14 tasks
- User Story 2: 6 tasks
- User Story 3: 6 tasks
- User Story 4: 12 tasks

**Parallel Opportunities**: 25 tasks marked with [P]

**MVP Scope**: Phase 1-3 (30 tasks) - 基本的な機能実装
