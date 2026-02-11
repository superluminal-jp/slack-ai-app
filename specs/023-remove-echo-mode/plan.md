# Implementation Plan: エコーモード削除

**Branch**: `023-remove-echo-mode` | **Date**: 2026-02-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/023-remove-echo-mode/spec.md`

## Summary

Feature 017〜018 で導入され Feature 022 で検証完了したエコーモード（`VALIDATION_ZONE_ECHO_MODE`）を全レイヤーから除去する。対象は Python パイプラインコード、CDK コンストラクト・型定義・エントリポイント、デプロイスクリプト、テスト、E2E テスト、ドキュメント。削除のみで新規機能追加なし。

## Technical Context

**Language/Version**: Python 3.11 (Verification Agent), TypeScript 5.x (CDK), Bash (deploy scripts)
**Primary Dependencies**: FastAPI, uvicorn, boto3, aws-cdk-lib, zod
**Storage**: N/A (削除のみ)
**Testing**: pytest (Python), Jest (CDK TypeScript)
**Target Platform**: AWS (Lambda, AgentCore Runtime, DynamoDB, SQS)
**Project Type**: Serverless microservices (CDK IaC)
**Performance Goals**: N/A (削除のみ、動作変更なし)
**Constraints**: 既存の正常フローテスト（Feature 022）が全パスすること
**Scale/Scope**: 14ファイル修正、3テストクラス削除、1 E2E テストクラス削除

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution は未設定（テンプレート状態）のため、ゲートチェック N/A。
本変更はデッドコード削除のみであり、新規アーキテクチャ決定を伴わない。

## Project Structure

### Documentation (this feature)

```text
specs/023-remove-echo-mode/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (N/A — 削除のみ)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code — 影響を受けるファイル

```text
# Layer 1: Python パイプライン (Verification Agent)
cdk/lib/verification/agent/verification-agent/
├── pipeline.py                     # L205-216: エコーモード分岐削除
└── tests/test_main.py              # L447-651: 3テストクラス削除、L827+: 022テストから env var patch 更新

# Layer 2: CDK コンストラクト・型定義
cdk/lib/types/
├── stack-config.ts                 # L73-76: validationZoneEchoMode プロパティ削除
└── cdk-config.ts                   # L48-49, L100: validationZoneEchoMode フィールド・Zod スキーマ削除
cdk/lib/verification/
├── verification-stack.ts           # L95-98, L181, L200: echo mode 変数・props 削除
└── constructs/
    ├── slack-event-handler.ts      # L25-26, L106-109: props・env var 削除
    └── verification-agent-runtime.ts # L39-40, L204-206: props・env var 削除

# Layer 3: CDK エントリポイント
cdk/bin/cdk.ts                      # L157-164, L197-199: echo mode 変数・context 設定削除

# Layer 4: CDK テスト
cdk/test/verification-stack.test.ts # L129-137, L234-271, L299-334: echo mode テスト削除

# Layer 5: Lambda テスト
cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py
                                    # L777-1127: Test017EchoMode, Test017EchoModeOff, Test018 クラス削除

# Layer 6: デプロイスクリプト
scripts/deploy-split-stacks.sh      # L15, L277-282: echo mode コメント・分岐削除

# Layer 7: E2E テスト
tests/e2e/test_slack_flow.py        # L216+: TestEchoModeFullFlow クラス削除
tests/e2e/README.md                 # echo mode 関連セクション削除

# Layer 8: ドキュメント (参照更新)
docs/how-to/troubleshooting.md      # echo mode セクション削除
docs/how-to/troubleshooting-no-reply.md  # echo_mode_response 参照削除
README.md                           # echo mode 関連記述更新
README.ja.md                        # echo mode 関連記述更新
CHANGELOG.md                        # echo mode 参照は過去履歴のため保持
CLAUDE.md                           # 022-echo-mode-disable-validation テクノロジー記述更新
```

**Structure Decision**: 既存プロジェクト構造を維持。新規ファイル作成なし。全変更は既存ファイルからの削除・編集のみ。

## Deletion Strategy

### 依存順序（ボトムアップ削除）

削除は依存関係の末端から開始し、ビルドを壊さずに段階的に進める。

```
Phase A: テスト削除（テストが実装に依存）
  ├── Python テスト: test_main.py (018 テストクラス 3つ)
  ├── Lambda テスト: test_handler.py (017/018 テストクラス 3つ)
  ├── CDK テスト: verification-stack.test.ts (echo mode テスト)
  └── E2E テスト: test_slack_flow.py (TestEchoModeFullFlow)

Phase B: 実装削除（テストが消えたので安全）
  ├── pipeline.py: エコーモード分岐 (L205-216)
  ├── slack-event-handler.ts: props + env var (L25-26, L106-109)
  ├── verification-agent-runtime.ts: props + env var (L39-40, L204-206)
  └── verification-stack.ts: echo mode 変数 + props 渡し (L95-98, L181, L200)

Phase C: 型定義・設定削除（実装が参照しなくなったので安全）
  ├── stack-config.ts: validationZoneEchoMode (L73-76)
  ├── cdk-config.ts: validationZoneEchoMode + Zod (L48-49, L100)
  └── cdk.ts: echo mode 変数 + context (L157-164, L197-199)

Phase D: スクリプト・ドキュメント
  ├── deploy-split-stacks.sh: echo mode 分岐
  ├── .claude/settings.local.json: VALIDATION_ZONE_ECHO_MODE 許可エントリ
  └── docs/, README, CLAUDE.md 更新
```

### Feature 022 テスト更新方針

Feature 022 テスト（`Test022NormalFlowDelegation` 等）は `VALIDATION_ZONE_ECHO_MODE` を `""` にパッチして正常フローをテストしている。エコーモード削除後、この環境変数は存在しないため：

- `patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": ""}, clear=False)` → **削除**
- エコーモード分岐が消えるため、環境変数の有無は動作に影響しない
- テストの意図（正常フロー検証）は維持され、テスト自体は引き続き有効

## Complexity Tracking

本変更はデッドコード削除のみ。新規の複雑性は導入されない。
