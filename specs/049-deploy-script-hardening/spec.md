# Feature Specification: Deploy Script Hardening

**Feature Branch**: `049-deploy-script-hardening`
**Created**: 2026-03-20
**Status**: Draft
**Input**: User description: "deploy.sh / apply-resource-policy.py の品質改善: エラーハンドリング・セキュリティ・パフォーマンス・コード重複"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AWS API エラーが明確に報告される (Priority: P1)

デプロイオペレーターが `./scripts/deploy.sh policy` を実行したとき、`put_resource_policy` が失敗した場合に原因（権限不足・無効 ARN など）が標準エラーに出力され、ゼロ以外の終了コードで終了する。現状は例外が捕捉されずスクリプトがクラッシュするか無言で継続する。

**Why this priority**: リソースポリシー未適用はエージェント間通信の認可エラーに直結し、デプロイ後の動作不全の主因となる。エラー理由が不明だとトラブルシュートに時間がかかる。

**Independent Test**: `apply-resource-policy.py` を不正な ARN で実行し、エラーメッセージと終了コード 2 が返ることを確認する。

**Acceptance Scenarios**:

1. **Given** 無効な execution-agent-arn が指定されている, **When** `apply-resource-policy.py` を実行する, **Then** `[ERROR] AWS API error: ...` が stderr に出力され終了コード 2 で終了する
2. **Given** 実行ロールに `bedrock-agentcore:PutResourcePolicy` 権限がない, **When** `apply-resource-policy.py` を実行する, **Then** `AccessDenied` を含むエラーメッセージが表示され終了コード 2 で終了する

---

### User Story 2 - シークレットが子プロセスに漏洩しない (Priority: P1)

デプロイオペレーターが `./scripts/deploy.sh` を実行したとき、`SLACK_BOT_TOKEN` および `SLACK_SIGNING_SECRET` が `export` されず、CDK デプロイに必要な範囲のみに渡される。現状は `export` により同一シェルセッション内の全子プロセスがこれらの値を参照できる。

**Why this priority**: シークレットの漏洩範囲を最小化することはセキュリティの基本原則であり、CDK プラグインや npm スクリプトなどの第三者コードへの意図しない流出を防ぐ。

**Independent Test**: デプロイ実行後、`export -p` の出力に `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` が含まれないことを確認する。

**Acceptance Scenarios**:

1. **Given** 設定ファイルから読み込まれた SLACK_BOT_TOKEN, **When** `cmd_deploy` が実行される, **Then** CDK コマンドには渡されるが `export -p` の出力には現れない
2. **Given** SLACK_SIGNING_SECRET が env var で渡されている, **When** `cmd_deploy` が実行される, **Then** CDK 呼び出し後のサブプロセスでその値が参照できない

---

### User Story 3 - `cmd_status` が高速に完了する (Priority: P2)

デプロイオペレーターが `./scripts/deploy.sh status` を実行したとき、5 スタックのステータス取得が並列で行われ、逐次実行と比較して合計所要時間が大幅に短縮される。

**Why this priority**: `status` はデプロイ後の確認やトラブルシュート時に頻繁に使われるコマンドであり、応答速度はオペレーターの生産性に直接影響する。

**Independent Test**: `status` サブコマンドを実行し、完了までの秒数が逐次実行（各 2-5s × 5 回）より短いことを計測で確認する。

**Acceptance Scenarios**:

1. **Given** 5 スタックがすべてデプロイ済み, **When** `./scripts/deploy.sh status` を実行する, **Then** すべてのスタック情報が表示され完了時間が逐次時の 50% 以下である
2. **Given** 一部のスタックが存在しない, **When** `./scripts/deploy.sh status` を実行する, **Then** 存在するスタックの結果は正常に表示され、存在しないスタックはスキップメッセージが出る

---

### User Story 4 - 一時ファイルが確実にクリーンアップされる (Priority: P2)

デプロイオペレーターがデプロイ途中でエラーが発生した場合でも、`mktemp` で作成した一時ファイルが残留しない。現状は `trap` 設定前に `mktemp` が実行されるため、早期エラー時にクリーンアップされない。

**Why this priority**: CDK outputs ファイルにはスタック出力値が含まれる場合があり、残留は情報漏洩リスクとなる。

**Independent Test**: `cmd_deploy` を意図的に前半で失敗させ、残留一時ファイルがないことを確認する。

**Acceptance Scenarios**:

1. **Given** `mktemp` 直後にエラーが発生した, **When** スクリプトが EXIT する, **Then** 作成済みの全一時ファイルが削除されている
2. **Given** デプロイが正常完了した, **When** スクリプトが終了する, **Then** 全一時ファイルが削除されている

---

### User Story 5 - ARN JSON 組み立てが一箇所で管理される (Priority: P3)

デプロイスクリプトのメンテナーが execution agent ARN の JSON 構造を変更する場合、1 箇所の修正で全フェーズに反映される。現状は同一の jq 構造が 3 箇所に重複しており、新規エージェント追加時の変更漏れリスクがある。

**Why this priority**: 動作への即時影響はないが、将来のエージェント追加時に変更漏れを招く保守性リスク。

**Independent Test**: ヘルパー関数を単体呼び出しし、正しい JSON が返ることを確認する。

**Acceptance Scenarios**:

1. **Given** 新しい execution agent が追加された, **When** ヘルパー関数の引数を変更する, **Then** preflight・Phase 6・ARN 保存の全フェーズで同一の変更が反映される

---

### Edge Cases

- `put_resource_policy` が一時的な AWS スロットリングエラーで失敗した場合は即座にエラー終了する（リトライはスコープ外）
- 並列実行中に一部スタックの CloudFormation 呼び出しがタイムアウトした場合、他スタックの結果はそのまま表示しエラーのみスキップメッセージを出す
- `region` 引数が空文字の場合は boto3 のデフォルトリージョン解決に委ねる（`None` を渡す）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `apply-resource-policy.py` は `put_resource_policy` の `ClientError` を捕捉し、エラーコードとメッセージを stderr に出力したうえで終了コード 2 で終了しなければならない
- **FR-002**: `deploy.sh` は `SLACK_BOT_TOKEN` および `SLACK_SIGNING_SECRET` を `export` してはならない。CDK コマンドへは環境変数スコープを限定した形で渡さなければならない
- **FR-003**: `cmd_deploy` の `trap EXIT` は `mktemp` 呼び出しより前に設定されなければならない
- **FR-004**: `cmd_status` の CloudFormation `describe-stacks` 呼び出しは並列で実行され、全呼び出しの完了を `wait` で同期しなければならない
- **FR-005**: execution agent ARN の jq JSON 組み立てロジックはヘルパー関数として 1 箇所に集約し、既存の重複コード 3 箇所を削除しなければならない
- **FR-006**: ARN の有効性チェックは `[[ -n "${var}" && "${var}" != "None" ]]` パターンに統一されなければならない
- **FR-007**: `apply-resource-policy.py` の `import boto3` はモジュールトップレベルに移動しなければならない
- **FR-008**: `apply-resource-policy.py` の `region` 引数は空文字の場合 `None` として boto3 に渡されなければならない
- **FR-009**: `deploy.sh` のヘルプテキストは `all` サブコマンドが常に `--force-rebuild` を伴うことを正確に記述しなければならない

### Key Entities

- **deploy.sh**: 統合デプロイ CLI スクリプト。複数の CDK スタックを順序付きでデプロイし、後処理（リソースポリシー適用・バリデーション）を行う
- **apply-resource-policy.py**: AgentCore ランタイムへのリソースポリシー適用スクリプト。`deploy.sh` から呼び出される
- **一時ファイル**: CDK outputs JSON を保持する `mktemp` ファイル群。EXIT trap でクリーンアップ対象

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `apply-resource-policy.py` が AWS API エラーで失敗した場合、終了コード 2 とエラー原因メッセージが stderr に出力される
- **SC-002**: デプロイ完了後の `export -p` 出力に `SLACK_BOT_TOKEN` および `SLACK_SIGNING_SECRET` が含まれない
- **SC-003**: `./scripts/deploy.sh status` の完了時間が逐次実行と比較して 40% 以上短縮される
- **SC-004**: デプロイが任意のフェーズで失敗した場合、残留する一時ファイルがゼロである
- **SC-005**: jq ARN 組み立てロジックが 1 つのヘルパー関数に集約され、重複コードが存在しない
- **SC-006**: 全 ARN チェック箇所で一貫したパターンが使用されており、`None` 文字列を有効な ARN として誤認しない

## Assumptions

- CDK の `--context` にシークレットを渡す方式はシェル履歴への記録リスクを許容する（対処は本フィーチャのスコープ外）
- `put_resource_policy` のリトライロジックは本フィーチャのスコープ外とし、失敗時は即座にエラー終了する
- `cmd_status` の並列化は bash バックグラウンドジョブ（`&` + `wait`）で実装し、外部ツールは使用しない
- `apply-resource-policy.py` は Python 3.11 以上で実行されることを前提とする
