# Quickstart: エコーモード削除

**Branch**: `023-remove-echo-mode` | **Date**: 2026-02-11

## 概要

不要になったエコーモード（`VALIDATION_ZONE_ECHO_MODE`）を全レイヤーから除去する。削除のみで新規コード追加なし。

## 前提条件

- Feature 022 で正常フロー検証テスト完了済み
- エコーモードは本番環境で無効化されている

## 検証手順

### 1. Python テスト（Verification Agent）

```bash
cd cdk/lib/verification/agent/verification-agent
pytest tests/test_main.py -v
```

期待結果:
- `Test018EchoModeAtRuntime`, `Test018EchoContentAndTarget`, `Test018EchoModeOff` が**存在しない**
- `Test022NormalFlowDelegation` 等の Feature 022 テストが全パス
- `VALIDATION_ZONE_ECHO_MODE` への参照がテストコードに残っていない

### 2. Lambda テスト

```bash
cd cdk/lib/verification/lambda/slack-event-handler
pytest tests/test_handler.py -v
```

期待結果:
- `Test017EchoMode`, `Test017EchoModeOff`, Feature 018 Lambda テストが**存在しない**
- 既存の通常フローテストが全パス

### 3. CDK テスト

```bash
cd cdk
npx jest
```

期待結果:
- echo mode 関連テスト（`should not have VALIDATION_ZONE_ECHO_MODE`, `should set VALIDATION_ZONE_ECHO_MODE`, `CdkConfig validationZoneEchoMode type safety`）が**存在しない**
- 全 CDK テストがパス

### 4. コードベース検証

```bash
# specs/ と CHANGELOG.md を除く全ファイルで参照が 0 件であることを確認
grep -r "VALIDATION_ZONE_ECHO_MODE" --include="*.py" --include="*.ts" --include="*.sh" .
grep -r "validationZoneEchoMode" --include="*.py" --include="*.ts" --include="*.sh" .
```

期待結果: 出力なし（specs/ ディレクトリと CHANGELOG.md を除く）

## トラブルシューティング

### テストが失敗する場合

1. エコーモード分岐削除後に `pipeline.py` の `os` import が不要になっていないか確認（他で使用されている場合は残す）
2. Feature 022 テストから `patch.dict(os.environ, {"VALIDATION_ZONE_ECHO_MODE": ""})` が完全に除去されているか確認
3. CDK の型エラーが出る場合、`stack-config.ts` と `cdk-config.ts` の両方から `validationZoneEchoMode` が除去されているか確認
