# Quickstart: S3-backed Large File Artifact (028)

**Branch**: `028-s3-large-file-transfer`

## 目的

ユーザーが AI に大きなファイル（PowerPoint、Excel、画像など）の生成を依頼した際、200 KB を超えるファイルを SQS の 256 KB 制限を回避して Slack に投稿できるようにする。

## 変更概要

| 変更対象 | 内容 |
|----------|------|
| S3 バケット | `generated_files/` プレフィックス用ライフサイクルルール（1 日）追加 |
| Verification Agent | `generated_files/*` への Read/Write 権限追加 |
| s3_file_manager | `upload_generated_file_to_s3`, `generate_presigned_url_for_generated_file` 追加 |
| pipeline | サイズ > 200 KB で S3 アップロード、S3 形式の file_artifact を構築 |
| Slack Poster | `s3PresignedUrl` がある場合に HTTP GET で取得して投稿 |

## ローカル検証

### 1. S3 ファイルマネージャのユニットテスト

```bash
cd cdk/lib/verification/agent/verification-agent
pytest tests/test_s3_file_manager.py -v
```

### 2. パイプラインの閾値・S3 経路テスト

```bash
pytest tests/test_pipeline.py -v
```

### 3. Slack Poster の s3PresignedUrl テスト

`slack-poster` の試験: `s3PresignedUrl` 指定時のファイル取得と Slack 投稿を手動または統合テストで検証。

## デプロイ

既存の CDK デプロイと同一。`cdk deploy` の実行で変更が反映される。

## 動作確認

1. Slack で AI に大きなファイル（例: 200 KB 超の PowerPoint）の生成を依頼
2. ファイルがスレッドに添付されることを確認
3. 小さいファイル（< 200 KB）も従来どおり投稿されることを確認
