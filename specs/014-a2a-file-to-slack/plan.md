# Implementation Plan: A2A ファイルを Execution Zone で生成し Slack スレッドに返す

**Branch**: `014-a2a-file-to-slack` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-a2a-file-to-slack/spec.md`

## Summary

Execution Zone で AI が生成したファイルを A2A レスポンスの artifact に載せ（`kind: "file"` の part または別 artifact）、Verification Zone がその内容を取得して Slack スレッドに投稿する。既存のテキストのみフローはそのまま維持し、ファイルサイズ・タイプの上限と許可タイプを適用する。具体的な仕様は調査・検証しながら実装する。

## Technical Context

**Language/Version**: Python 3.11（Execution / Verification エージェント）、TypeScript 5.x（CDK）  
**Primary Dependencies**:
- 既存: `bedrock-agentcore`、`strands-agents[a2a]`、`uvicorn`、`fastapi`、`boto3`、`slack-sdk`
- 追加: Slack ファイル投稿用（`files.getUploadURLExternal` / `files.completeUploadExternal` または SDK の `upload_v2`）

**Storage**: なし（ファイルは A2A レスポンスでメモリ上のみ受け渡し。永続化は本機能スコープ外）  
**Testing**: pytest（Execution / Verification エージェント）、Jest（CDK）  
**Target Platform**: AWS AgentCore Runtime（ARM64）、Slack API  
**Project Type**: 013 と同じクラウドネイティブ（Execution / Verification エージェント拡張）  
**Performance Goals**: テキストのみフローは現状維持。ファイル付き応答はサイズ制限内で許容レイテンシ  
**Constraints**: A2A ペイロードサイズ制限、Slack ファイルアップロード制限（新 API 推奨）、最大ファイルサイズ・許可 MIME タイプのポリシー  
**Scale/Scope**: 1 レスポンスあたり 1 ファイルを初回スコープ（複数ファイルは将来拡張）

## Constitution Check

*GATE: Phase 0 調査前にパス。Phase 1 設計後に再確認。*

Constitution はテンプレートのため、プロジェクト共通原則で評価:

| Gate | Status | Notes |
|------|--------|-------|
| セキュリティ（多層防御維持） | PASS | Execution Zone は Slack を直接叩かない。ファイルは Verification 経由でのみ投稿 |
| 後方互換性 | PASS | テキストのみレスポンスは既存形式のまま。ファイルは artifact 追加で拡張 |
| オブザーバビリティ | PASS | ファイルサイズ超過・タイプ拒否・Slack アップロード失敗を構造化ログ・メトリクスで記録 |
| 最小権限の原則 | PASS | Verification に `files:write`（または新 API 用スコープ）のみ追加。Execution は変更なし |
| テスト可能性 | PASS | ファイル artifact のモック、Slack アップロードのモックで単体・結合テスト可能 |

## Project Structure

### Documentation (this feature)

```text
specs/014-a2a-file-to-slack/
├── plan.md              # 本ファイル
├── research.md          # Phase 0 成果物（A2A file part、Slack アップロード、制限値）
├── data-model.md        # Phase 1 成果物（ファイル artifact、ExecutionResponse 拡張）
├── quickstart.md        # Phase 1 成果物（開発・検証手順）
├── contracts/           # Phase 1 成果物（A2A レスポンス拡張、Slack ファイル投稿）
└── tasks.md             # Phase 2 成果物（/speckit.tasks で生成）
```

### Source Code (repository root)

013 の構成を継承し、以下のみ追加・変更:

```text
cdk/lib/
├── execution/
│   └── agent/
│       └── execution-agent/
│           ├── main.py                   # 変更: ファイル生成フロー、artifact に file part 追加
│           ├── response_formatter.py     # 変更: 成功時 response に file_artifact 対応
│           ├── file_generator.py         # 新規（オプション）: ファイル生成ロジックの集約
│           └── tests/
│               └── test_main.py          # 変更: ファイル artifact のテスト追加
├── verification/
│   └── agent/
│       └── verification-agent/
│           ├── main.py                   # 変更: A2A レスポンスから file artifact 取得、Slack 投稿
│           ├── slack_poster.py           # 変更: post_file_to_slack 追加（files.getUploadURLExternal + completeUploadExternal）
│           └── tests/
│               └── test_main.py          # 変更: ファイル投稿モック・テスト追加
```

**Structure Decision**: 013 の Execution / Verification エージェントを拡張するのみ。新スタックは作らない。ファイル生成は Execution の Bedrock 連携の延長（例: 構造化出力を CSV/JSON に変換）として実装する。

## Complexity Tracking

> 現時点で Constitution 違反なし。複雑性の正当化は不要。
