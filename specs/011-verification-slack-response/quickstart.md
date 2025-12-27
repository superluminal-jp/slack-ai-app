# Quick Start: Verification Zone Slack Response Handling

**Feature**: 011-verification-slack-response  
**Date**: 2025-01-30

## 概要

このガイドは、Execution Zone（実行層）からのレスポンスを Verification Zone（検証層）経由で Slack に投稿するようにアーキテクチャを変更する実装手順を説明します。

## 前提条件

- AWS アカウントへのアクセス権限
- 既存の Verification Stack と Execution Stack がデプロイ済み
- Node.js 18+ と Python 3.11+ がインストール済み
- AWS CDK CLI がインストール済み

## 実装手順

### Phase 1: SQS キューの作成（検証スタック）

1. **SQS キューと DLQ の作成**:
   - 検証スタックに `execution-response-queue` を作成
   - DLQ `execution-response-dlq` を作成
   - 可視性タイムアウト: 30 秒
   - メッセージ保持期間: 14 日

2. **IAM ロールの設定**:
   - 実行ゾーンの Lambda ロールに SQS 送信権限を追加
   - SQS キューのリソースポリシーで実行ゾーンのロール ARN を許可（クロスアカウント対応）

### Phase 2: 実行ゾーンの変更

1. **Slack API 呼び出しの削除**:
   - `handler.py` から `post_to_slack()` 呼び出しを削除
   - `slack_poster.py` を削除（または検証ゾーンに移動）

2. **レスポンスフォーマッターの追加**:
   - `response_formatter.py` を新規作成
   - `ExecutionResponse` 形式でレスポンスを構造化

3. **SQS 送信の実装**:
   - `handler.py` で Bedrock API 呼び出し完了後、SQS キューにメッセージを送信
   - エラー時も SQS にエラーレスポンスを送信

4. **IAM ロールの更新**:
   - Slack API へのアクセス権限を削除
   - SQS 送信権限を追加

### Phase 3: 検証ゾーンの変更

1. **新しい Lambda 関数の作成**:
   - `slack-response-handler` Lambda 関数を新規作成
   - SQS イベントソースマッピングを設定

2. **レスポンスハンドラーの実装**:
   - `response_handler.py` を新規作成
   - SQS メッセージから `ExecutionResponse` を抽出
   - `SlackPostRequest` に変換

3. **Slack 投稿ロジックの実装**:
   - `slack_poster.py` を新規作成（実行ゾーンから移動）
   - Slack API (`chat.postMessage`) に投稿
   - メッセージサイズ制限（4000 文字）を考慮した分割投稿

4. **エラーハンドリング**:
   - 実行ゾーンからのエラーレスポンスをユーザーフレンドリーなメッセージに変換
   - SQS メッセージ処理失敗時の DLQ 処理

### Phase 4: テスト

1. **単体テスト**:
   - レスポンスフォーマッターのテスト
   - レスポンスハンドラーのテスト
   - Slack 投稿ロジックのテスト

2. **統合テスト**:
   - 実行ゾーン → SQS → 検証ゾーン → Slack のフローをテスト
   - エラーケースのテスト（Bedrock API エラー、SQS 送信エラー、Slack API エラー）

3. **パフォーマンステスト**:
   - レスポンス時間が 30 秒以内を維持することを確認
   - 検証ゾーンの即座応答（3 秒以内）を維持することを確認

### Phase 5: デプロイ

1. **検証スタックのデプロイ**:
   ```bash
   cd cdk
   cdk deploy VerificationStack
   ```

2. **実行スタックのデプロイ**:
   ```bash
   cdk deploy ExecutionStack
   ```

3. **動作確認**:
   - Slack からメッセージを送信
   - 検証ゾーンが即座に 200 OK を返すことを確認
   - 実行ゾーンが SQS にメッセージを送信することを確認
   - 検証ゾーンが Slack に投稿することを確認

## ロールバック手順

問題が発生した場合のロールバック手順:

1. **実行ゾーンのロールバック**:
   - 既存の `post_to_slack()` 呼び出しを復元
   - SQS 送信コードを削除
   - IAM ロールに Slack API 権限を再追加

2. **検証ゾーンのロールバック**:
   - `slack-response-handler` Lambda 関数を無効化
   - 既存の動作に戻す

## トラブルシューティング

### SQS メッセージが受信されない

- 実行ゾーンの IAM ロールに SQS 送信権限があるか確認
- SQS キューのリソースポリシーで実行ゾーンのロール ARN が許可されているか確認
- CloudWatch Logs で SQS 送信エラーを確認

### Slack への投稿が失敗する

- 検証ゾーンの Lambda ロールに Slack API 権限があるか確認
- Bot Token が正しく設定されているか確認
- CloudWatch Logs で Slack API エラーを確認

### レスポンスが遅い

- SQS キューの可視性タイムアウトを確認
- Lambda 関数のタイムアウト設定を確認
- CloudWatch Metrics でパフォーマンスを確認

## 関連ドキュメント

- [仕様書](./spec.md)
- [実装計画](./plan.md)
- [データモデル](./data-model.md)
- [API コントラクト](./contracts/execution-response-sqs.yaml)
- [調査結果](./research.md)

