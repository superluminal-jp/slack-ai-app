# Tasks: スタック間通信のデュアル認証対応

**入力**: 設計ドキュメント `/specs/012-api-key-auth/`
**前提条件**: plan.md, spec.md, research.md, data-model.md, contracts/execution-api-dual-auth.yaml, quickstart.md

**開発アプローチ**: 既存の IAM 認証に API キー認証を追加。設定により認証方法を切り替え可能。既存の IAM 認証機能は維持（後方互換性）。

**テスト**: API Gateway クライアントのユニットテスト、Secrets Manager クライアントのユニットテスト、API Gateway API キー認証の統合テスト、認証方法切り替えのテスト。

## フォーマット: `[ID] [P?] [Story?] 説明`

- **[P]**: 並列実行可能（異なるファイル、依存関係なし）
- **[US1], [US2], [US3]**: ユーザーストーリーラベル（spec.md のユーザーストーリーに対応）
- 説明には正確なファイルパスを含める
- 各フェーズの終わりに次のフェーズに進む前に検証する **CHECKPOINT** を設定

## パス規則

plan.md の構造に基づく:

- **インフラストラクチャ**: `cdk/lib/execution/constructs/` (TypeScript)
- **Verification Layer**: `cdk/lib/verification/lambda/slack-event-handler/` (Python 3.11)
- **Execution Layer**: `cdk/lib/execution/lambda/bedrock-processor/` (Python 3.11) - 変更なし
- **環境変数**: CDK 経由で設定

---

## Phase 1: セットアップ - API Gateway API キー認証インフラストラクチャ

**目的**: API Gateway REST API に API キー認証を追加（既存の IAM 認証は維持）

**推定時間**: 1-2 時間

### インフラストラクチャ

- [x] T001 Execution API Gateway コンストラクトを更新して API キー認証を追加 `cdk/lib/execution/constructs/execution-api.ts`

  - `enableApiKeyAuth` プロパティを `ExecutionApiProps` インターフェースに追加
  - `enableApiKeyAuth` が true の場合、API キーを作成
  - 使用量プランを作成（レート制限用、オプション）
  - API キーを使用量プランに関連付け
  - `/execute` エンドポイントに API キー認証メソッドを追加（`apiKeyRequired: true`）
  - 既存の IAM 認証メソッドは維持
  - API キー ID を出力（オプション）
  - 参照: `quickstart.md` ステップ 1.1, `research.md` RQ-01, RQ-04

- [x] T002 Execution Stack を更新して API キー認証を有効化 `cdk/lib/execution/execution-stack.ts`

  - `ExecutionApi` コンストラクトの作成時に `enableApiKeyAuth: true` を設定
  - API キー ID を CfnOutput に追加（オプション）
  - 参照: `quickstart.md` ステップ 1.2

- [ ] T003 インフラストラクチャをデプロイ (`cdk deploy`)

  - API Gateway が作成されていることを確認
  - API キーが作成されていることを確認
  - 使用量プランが作成されていることを確認
  - API キーが使用量プランに関連付けられていることを確認
  - 既存の IAM 認証が機能していることを確認
  - API Gateway URL を出力から取得

**✅ CHECKPOINT Phase 1**:

- API Gateway REST API に API キー認証が追加されている
- 既存の IAM 認証が機能している
- `/execute` エンドポイントが IAM と API キー認証の両方をサポートしている
- API キー ID が取得されている
- **テスト**: API Gateway が存在することを確認: `aws apigateway get-rest-apis --query "items[?name=='Execution Layer API']"`
- **テスト**: API キーが存在することを確認: `aws apigateway get-api-keys --query "items[?name=='execution-api-key']"`

---

## Phase 2: 基盤 - Secrets Manager クライアント実装

**目的**: Secrets Manager から API キーを安全に取得するクライアントを実装

**推定時間**: 1-2 時間

### Secrets Manager クライアント

- [x] T004 Secrets Manager クライアントモジュールを作成 `cdk/lib/verification/lambda/slack-event-handler/secrets_manager_client.py`

  - 関数: `get_secret(secret_name, region)` - 汎用シークレット取得
  - 関数: `get_api_key(secret_name, region)` - API キー取得専用
  - boto3 Secrets Manager クライアントを使用
  - JSON 文字列のパース処理
  - エラーハンドリング（ResourceNotFoundException, InvalidParameterException など）
  - 型ヒントを追加
  - 参照: `research.md` RQ-02, `quickstart.md` ステップ 3.1

- [x] T005 [P] Secrets Manager クライアントのユニットテストを作成 `cdk/lib/verification/lambda/slack-event-handler/tests/test_secrets_manager_client.py`

  - JSON 形式のシークレット取得のテスト
  - API キー取得のテスト
  - シークレットが見つからない場合のテスト
  - 無効なシークレット形式のテスト
  - boto3 クライアントのモックを使用
  - 参照: `quickstart.md` ステップ 3.2

- [x] T006 Verification Stack Lambda に Secrets Manager アクセス権限を付与 `cdk/lib/verification/constructs/slack-event-handler.ts`

  - `secretsmanager:GetSecretValue` 権限を追加
  - リソース: `arn:aws:secretsmanager:REGION:ACCOUNT:secret:execution-api-key*`
  - 最小権限の原則に従う
  - 参照: `quickstart.md` ステップ 2.3

**✅ CHECKPOINT Phase 2**:

- Secrets Manager クライアントが実装されている
- ユニットテストがすべてパスしている
- Lambda 関数に Secrets Manager へのアクセス権限が付与されている
- **テスト**: ユニットテストを実行: `pytest cdk/lib/verification/lambda/slack-event-handler/tests/test_secrets_manager_client.py -v`

---

## Phase 3: ユーザーストーリー 1 - API キー認証サポート (Priority: P1)

**目的**: システムが API キー認証をサポートし、IAM 認証をサポートしない API と統合できるようにする

**独立テスト**: API キー認証を使用するようにシステムを設定し、リクエストが正常に認証・処理されることを確認（IAM 認証と同じ機能を維持）

### API Gateway クライアント拡張

- [x] T007 [P] [US1] API Gateway クライアントを更新して API キー認証をサポート `cdk/lib/verification/lambda/slack-event-handler/api_gateway_client.py`

  - `invoke_execution_api` 関数に `auth_method` パラメータを追加（'iam' または 'api_key'）
  - `api_key_secret_name` パラメータを追加（API キー認証の場合）
  - IAM 認証の場合: 既存の SigV4 署名ロジックを使用
  - API キー認証の場合: Secrets Manager から API キーを取得し、`x-api-key` ヘッダーに追加
  - 認証方法の検証（無効な認証方法の場合はエラー）
  - 既存の IAM 認証機能は維持（後方互換性）
  - 参照: `research.md` RQ-02, RQ-03, `quickstart.md` ステップ 4.1

- [x] T008 [P] [US1] API Gateway クライアントのユニットテストを更新 `cdk/lib/verification/lambda/slack-event-handler/tests/test_api_gateway_client.py`

  - API キー認証のテストを追加
  - Secrets Manager クライアントのモックを使用
  - IAM 認証の既存テストがパスすることを確認
  - 無効な認証方法のテスト
  - API キー取得失敗のテスト
  - 参照: `quickstart.md` ステップ 4.2

### Handler 更新

- [x] T009 [US1] Handler を更新して認証方法を選択 `cdk/lib/verification/lambda/slack-event-handler/handler.py`

  - 環境変数から認証方法を取得: `EXECUTION_API_AUTH_METHOD`（デフォルト: 'iam'）
  - 環境変数から API キーシークレット名を取得: `EXECUTION_API_KEY_SECRET_NAME`
  - `invoke_execution_api` 呼び出し時に認証方法と API キーシークレット名を渡す
  - 認証方法のログ記録（API キー値は含めない）
  - 既存の IAM 認証ロジックは維持（後方互換性）
  - 参照: `research.md` RQ-03, `quickstart.md` ステップ 5.1

- [x] T010 [US1] CDK スタックで環境変数を設定 `cdk/lib/verification/constructs/slack-event-handler.ts`

  - `EXECUTION_API_AUTH_METHOD` 環境変数を追加（デフォルト: 'iam'）
  - `EXECUTION_API_KEY_SECRET_NAME` 環境変数を追加（API キー認証の場合）
  - `EXECUTION_API_URL` 環境変数は既存のまま
  - 参照: `quickstart.md` ステップ 5.2

### 統合テスト

- [ ] T011 [US1] API キー認証の統合テストを実行

  - API キー認証を使用するように環境変数を設定
  - Secrets Manager に有効な API キーを保存
  - Verification Stack から Execution Stack へのリクエストを送信
  - リクエストが正常に認証・処理されることを確認
  - CloudWatch ログで認証方法を確認（API キー値は含まれていないことを確認）
  - 参照: `quickstart.md` ステップ 6.2

- [ ] T012 [US1] 無効な API キーでの認証失敗テスト

  - Secrets Manager に無効な API キーを一時的に保存
  - Verification Stack から Execution Stack へのリクエストを送信
  - 403 Forbidden エラーが返されることを確認
  - エラーログに API キー値が含まれていないことを確認
  - 有効な API キーに戻す
  - 参照: `quickstart.md` ステップ 6.3

**✅ CHECKPOINT Phase 3 (US1)**:

- API キー認証が実装されている
- 有効な API キーでリクエストが正常に認証・処理される
- 無効な API キーでリクエストが拒否される（403 Forbidden）
- 既存の IAM 認証が機能している（後方互換性）
- API キー値がログに露出していない
- **テスト**: API キー認証の統合テストがパスしている
- **テスト**: 無効な API キーでの認証失敗テストがパスしている

---

## Phase 4: ユーザーストーリー 2 - シームレスな認証方法の選択 (Priority: P1)

**目的**: 設定に基づいて適切な認証方法を自動的に選択し、コード変更なしで IAM と API キー認証を切り替え可能にする

**独立テスト**: 設定を変更して IAM と API キー認証を切り替え、システムが正しい方法を使用することを確認

### 認証方法の選択ロジック

- [x] T013 [US2] 認証方法の選択ロジックを実装 `cdk/lib/verification/lambda/slack-event-handler/handler.py`

  - 環境変数 `EXECUTION_API_AUTH_METHOD` を読み取り（デフォルト: 'iam'）
  - `EXECUTION_API_AUTH_METHOD` が 'api_key' で、`EXECUTION_API_KEY_SECRET_NAME` が設定されている場合 → API キー認証
  - それ以外 → IAM 認証（デフォルト、後方互換性）
  - 無効な認証方法が設定されている場合のエラーハンドリング
  - 認証方法のログ記録（デバッグ用）
  - 参照: `research.md` RQ-03

- [x] T014 [P] [US2] 認証方法の選択ロジックのユニットテストを作成 `cdk/lib/verification/lambda/slack-event-handler/tests/test_handler.py`

  - IAM 認証が選択される場合のテスト
  - API キー認証が選択される場合のテスト
  - 無効な認証方法が設定されている場合のテスト
  - デフォルトで IAM 認証が使用されるテスト（後方互換性）
  - 環境変数のモックを使用

### 設定切り替えテスト

- [ ] T015 [US2] IAM 認証への切り替えテスト

  - 環境変数を IAM 認証に設定
  - Verification Stack から Execution Stack へのリクエストを送信
  - リクエストが IAM 認証（SigV4 署名）を使用することを確認
  - CloudWatch ログで認証方法を確認

- [ ] T016 [US2] API キー認証への切り替えテスト

  - 環境変数を API キー認証に設定
  - Verification Stack から Execution Stack へのリクエストを送信
  - リクエストが API キー認証（`x-api-key` ヘッダー）を使用することを確認
  - CloudWatch ログで認証方法を確認

- [ ] T017 [US2] 設定変更による認証方法切り替えテスト

  - 最初に IAM 認証でリクエストを送信
  - 環境変数を API キー認証に変更（コードデプロイなし）
  - 再度リクエストを送信
  - 新しい認証方法が使用されることを確認
  - 参照: `spec.md` User Story 2 Acceptance Scenario 3

**✅ CHECKPOINT Phase 4 (US2)**:

- 認証方法の選択ロジックが実装されている
- IAM 認証と API キー認証を設定により切り替え可能
- コードデプロイなしで認証方法を切り替え可能
- リクエストごとに 1 つの認証方法のみが使用される（デュアル認証なし）
- **テスト**: IAM 認証への切り替えテストがパスしている
- **テスト**: API キー認証への切り替えテストがパスしている
- **テスト**: 設定変更による認証方法切り替えテストがパスしている

---

## Phase 5: ユーザーストーリー 3 - セキュアな API キー管理 (Priority: P2)

**目的**: API キーを安全に保存・管理し、API キーへの不正アクセスを防止する

**独立テスト**: API キーが安全なストレージ（AWS Secrets Manager）に保存され、ログ、環境変数、コードに露出していないことを確認

### API キーの安全な保存

- [ ] T018 [US3] Secrets Manager に API キーを保存する手順を文書化 `specs/012-api-key-auth/quickstart.md`

  - API キーを取得する手順
  - Secrets Manager に API キーを保存する手順
  - API キーの形式（JSON または文字列）
  - 参照: `quickstart.md` ステップ 2.1, 2.2

- [ ] T019 [US3] API キーがログに露出していないことを確認

  - Handler のログ記録を確認
  - API Gateway クライアントのログ記録を確認
  - Secrets Manager クライアントのログ記録を確認
  - エラーメッセージに API キー値が含まれていないことを確認
  - 参照: `spec.md` FR-011

- [ ] T020 [US3] API キーが環境変数に露出していないことを確認

  - 環境変数の設定を確認
  - API キー値が直接環境変数に設定されていないことを確認
  - Secrets Manager のシークレット名のみが環境変数に設定されていることを確認

- [ ] T021 [US3] API キーがコードにハードコードされていないことを確認

  - コードベース全体を検索して API キー値が含まれていないことを確認
  - Secrets Manager から取得するロジックのみが実装されていることを確認

### API キーローテーション

- [ ] T022 [US3] API キーローテーション手順を文書化 `specs/012-api-key-auth/quickstart.md`

  - 新しい API キーを API Gateway に作成する手順
  - Secrets Manager で API キーを更新する手順
  - ダウンタイムなしでローテーションする手順
  - 古い API キーを削除する手順
  - 参照: `research.md` RQ-07

- [ ] T023 [US3] API キーローテーションのテスト

  - 新しい API キーを API Gateway に作成
  - Secrets Manager で API キーを更新
  - 新しい API キーでリクエストが正常に認証・処理されることを確認
  - 古い API キーでリクエストが拒否されることを確認（403 Forbidden）
  - ダウンタイムなしでローテーションが完了することを確認

**✅ CHECKPOINT Phase 5 (US3)**:

- API キーが Secrets Manager に安全に保存されている
- API キーがログ、環境変数、コードに露出していない
- API キーローテーション手順が文書化されている
- ダウンタイムなしで API キーをローテーション可能
- **テスト**: API キーがログに露出していないことを確認
- **テスト**: API キーが環境変数に露出していないことを確認
- **テスト**: API キーがコードにハードコードされていないことを確認
- **テスト**: API キーローテーションのテストがパスしている

---

## Phase 6: 最終仕上げと横断的関心事

**目的**: エラーハンドリング、ログ記録、モニタリング、ドキュメント更新

**推定時間**: 2-3 時間

### エラーハンドリング

- [ ] T024 認証方法設定エラーのハンドリング `cdk/lib/verification/lambda/slack-event-handler/handler.py`

  - 無効な認証方法が設定されている場合のエラーハンドリング
  - API キー認証が設定されているが、シークレット名が設定されていない場合のエラーハンドリング
  - 明確なエラーメッセージを返す
  - 参照: `spec.md` FR-013

- [ ] T025 API キー取得失敗のハンドリング `cdk/lib/verification/lambda/slack-event-handler/api_gateway_client.py`

  - Secrets Manager から API キーを取得できない場合のエラーハンドリング
  - 適切なエラーメッセージをログに記録
  - ユーザーフレンドリーなエラーメッセージを返す（内部詳細を露出しない）
  - 参照: `research.md` RQ-06

### ログ記録とモニタリング

- [ ] T026 認証方法のログ記録を追加 `cdk/lib/verification/lambda/slack-event-handler/handler.py`

  - 各リクエストで使用された認証方法をログに記録（API キー値は含めない）
  - 認証成功/失敗をログに記録
  - 相関 ID を含める
  - 参照: `spec.md` FR-009

- [ ] T027 CloudWatch メトリクスとアラームの設定（オプション）

  - API キー認証失敗率のメトリクス
  - 認証方法別のリクエスト数のメトリクス
  - 認証失敗率が閾値を超えた場合のアラーム
  - 参照: `spec.md` SC-009

### ドキュメント更新

- [ ] T028 README.md を更新

  - API キー認証機能の説明を追加
  - 環境変数の説明を更新
  - 参照: Documentation Maintenance Policy

- [ ] T029 アーキテクチャドキュメントを更新 `docs/reference/architecture/implementation-details.md`

  - API キー認証の実装詳細を追加
  - Secrets Manager 統合の説明を追加
  - 認証方法の選択ロジックの説明を追加

- [ ] T030 セキュリティドキュメントを更新 `docs/reference/security/implementation.md`

  - API キー認証のセキュリティ実装を追加
  - Secrets Manager のセキュリティ考慮事項を追加
  - API キーローテーションのセキュリティベストプラクティスを追加

**✅ CHECKPOINT Phase 6**:

- エラーハンドリングが適切に実装されている
- 認証方法がログに記録されている（API キー値は含まれていない）
- ドキュメントが更新されている
- **テスト**: 認証方法設定エラーのハンドリングが動作している
- **テスト**: API キー取得失敗のハンドリングが動作している

---

## 依存関係グラフ

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational)
    ↓
Phase 3 (US1: API Key Auth Support) ──┐
    ↓                                  │
Phase 4 (US2: Auth Method Selection) ─┤ (並列実行可能)
    ↓                                  │
Phase 5 (US3: Secure API Key Mgmt) ───┘
    ↓
Phase 6 (Polish)
```

**並列実行の機会**:

- Phase 3 と Phase 4 は部分的に並列実行可能（異なるファイルを変更）
- Phase 5 は Phase 3 と Phase 4 の完了後に開始可能

## 実装戦略

### MVP スコープ（最小実装）

**推奨 MVP**: Phase 1 + Phase 2 + Phase 3 (US1) のみ

これにより、API キー認証の基本機能が実装され、IAM 認証をサポートしない API との統合が可能になります。

### インクリメンタル配信

1. **Phase 1-2**: インフラストラクチャと基盤コンポーネント（ブロッキング）
2. **Phase 3 (US1)**: API キー認証サポート（コア機能）
3. **Phase 4 (US2)**: 認証方法の選択（運用柔軟性）
4. **Phase 5 (US3)**: セキュアな API キー管理（セキュリティ強化）
5. **Phase 6**: 最終仕上げ（品質向上）

## タスク統計

- **総タスク数**: 30
- **Phase 1 (Setup)**: 3 タスク
- **Phase 2 (Foundational)**: 3 タスク
- **Phase 3 (US1)**: 6 タスク
- **Phase 4 (US2)**: 5 タスク
- **Phase 5 (US3)**: 6 タスク
- **Phase 6 (Polish)**: 7 タスク

**並列実行可能タスク**: 8 タスク（[P] マーカー付き）

## 独立テスト基準

### User Story 1 (US1)

- API キー認証を使用するようにシステムを設定
- 有効な API キーでリクエストが正常に認証・処理される
- 無効な API キーでリクエストが拒否される（403 Forbidden）
- 既存の IAM 認証が機能している（後方互換性）

### User Story 2 (US2)

- 環境変数を変更して IAM と API キー認証を切り替え
- システムが正しい認証方法を使用する
- コードデプロイなしで認証方法を切り替え可能

### User Story 3 (US3)

- API キーが Secrets Manager に保存されている
- API キーがログ、環境変数、コードに露出していない
- ダウンタイムなしで API キーをローテーション可能
