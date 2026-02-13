# Research: エコーモード削除

**Branch**: `023-remove-echo-mode` | **Date**: 2026-02-11

## R1: エコーモード依存関係の完全マッピング

**Decision**: エコーモードは 7 レイヤー（Python パイプライン、CDK コンストラクト、CDK 型定義、CDK エントリポイント、テスト、デプロイスクリプト、ドキュメント）に存在し、全レイヤーから除去する。

**Rationale**: grep 調査により `VALIDATION_ZONE_ECHO_MODE` は 14 ファイルで参照されている（spec ファイルを除く）。依存関係はテスト→実装→型定義→設定の順。逆順（テストから）で削除することで、各段階でビルド・テストが通る状態を維持できる。

**Alternatives considered**:
- フィーチャーフラグとして残す: 本番で使用予定がなく、検証目的を達成済みのため不要
- 段階的削除（複数PR）: 変更量が小さく（削除のみ）、1 PR で完結可能

## R2: Feature 022 テストへの影響

**Decision**: Feature 022 テスト内の `patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": ""}, clear=False)` を全箇所から削除する。

**Rationale**: エコーモード分岐がパイプラインから消えるため、環境変数の有無はテスト結果に影響しない。パッチを残すと「存在しない環境変数をモックしている」という誤解を招く。22 テスト関数で使用されており、全て機械的に削除可能。

**Alternatives considered**:
- パッチを残す: 無害だが、将来の開発者に混乱を与える
- テスト自体を書き直す: 過剰。パッチ行の削除のみで十分

## R3: Lambda ハンドラ内のエコーモード

**Decision**: Lambda ハンドラ（`handler.py`）自体にはエコーモード分岐は存在しない（Feature 018 で削除済み）。Lambda テスト（`test_handler.py`）のエコーモードテストクラス 3 つを削除する。

**Rationale**: Feature 018 で「Lambda はエコーモードの有無にかかわらず SQS に送信する」よう変更された。Lambda ハンドラコードにはエコーモードの条件分岐がないため、テストクラスのみが残存。テストは「SQS に送信すること」「エコー投稿しないこと」を検証しているが、エコーモード自体が消えるためテストの前提が無意味になる。

**Alternatives considered**:
- テストを「SQS 送信の通常テスト」に変換: 既存の通常フローテストと重複するため不要

## R4: デプロイスクリプトとドキュメント

**Decision**: `deploy-split-stacks.sh` のエコーモード分岐、トラブルシューティングドキュメントのエコーモードセクションを削除する。README のエコーモード関連記述を更新する。

**Rationale**: エコーモードのコードが存在しない状態でドキュメントが残ると、ユーザーが使用を試みて混乱する。CHANGELOG は過去の変更履歴として保持（削除しない）。

**Alternatives considered**:
- ドキュメントを後から削除: コードとドキュメントの不整合を避けるため、同時に削除すべき

## R5: E2E テスト

**Decision**: `tests/e2e/test_slack_flow.py` の `TestEchoModeFullFlow` クラスと `tests/e2e/README.md` のエコーモード関連セクションを削除する。

**Rationale**: E2E テストはデプロイ済み環境でエコーモードを前提としたテストであり、エコーモードが存在しない状態では実行不能。

## 全影響ファイル一覧

| File | Action | Lines |
|------|--------|-------|
| `cdk/lib/verification/agent/verification-agent/pipeline.py` | 削除: エコーモード分岐 | L205-216 |
| `cdk/lib/verification/agent/verification-agent/tests/test_main.py` | 削除: 018テスト3クラス、更新: 022テストのenv varパッチ | L447-651, L827+ |
| `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py` | 削除: 017/018テスト3クラス | L777-1127 |
| `cdk/lib/types/stack-config.ts` | 削除: validationZoneEchoMode | L73-76 |
| `cdk/lib/types/cdk-config.ts` | 削除: validationZoneEchoMode | L48-49, L100 |
| `cdk/lib/verification/verification-stack.ts` | 削除: echo mode変数・props | L95-98, L181, L200 |
| `cdk/lib/verification/constructs/slack-event-handler.ts` | 削除: props・env var | L25-26, L106-109 |
| `cdk/lib/verification/constructs/verification-agent-runtime.ts` | 削除: props・env var | L39-40, L204-206 |
| `cdk/bin/cdk.ts` | 削除: echo mode変数・context | L157-164, L197-199 |
| `cdk/test/verification-stack.test.ts` | 削除: echo modeテスト | L129-137, L234-271, L299-334 |
| `scripts/deploy-split-stacks.sh` | 削除: echo mode分岐・コメント | L15, L277-282 |
| `tests/e2e/test_slack_flow.py` | 削除: TestEchoModeFullFlow | L216+ |
| `tests/e2e/README.md` | 削除: echo modeセクション | 複数箇所 |
| `docs/how-to/troubleshooting.md` | 削除: echo modeセクション | L479-544, L580-581 |
| `docs/how-to/troubleshooting-no-reply.md` | 削除: echo_mode_response参照 | L67, L79, L117 |
| `README.md` | 更新: echo mode記述 | L546, L556 |
| `README.ja.md` | 更新: echo mode記述 | L558 |
| `CLAUDE.md` | 更新: 022参照 | L8-9, L29 |
| `.claude/settings.local.json` | 削除: VALIDATION_ZONE_ECHO_MODE許可 | L35 |
