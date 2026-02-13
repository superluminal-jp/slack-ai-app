# 019: Slack 投稿責務の分離

## 概要

Verification Agent から Slack への**投稿**責務を分離し、Agent を Slack に依存しない検証・オーケストレーションに集中させる。

## 変更内容

- **Verification Agent**: `post_to_slack` / `post_file_to_slack` を廃止。代わりに **SQS（slack-post-request）** に「投稿リクエスト」を送信するだけにする。Slack API は **existence_check**（実在性チェック）用の読み取りのみ継続利用。
- **Slack Poster Lambda**: 新規。SQS からメッセージを消費し、`chat.postMessage` / `files.upload_v2` で実際に Slack に投稿する。

## フロー

1. Agent Invoker → InvokeAgentRuntime(Verification Agent)
2. Verification Agent: 検証パイプライン → （エコー or Execution Agent 呼び出し）→ 結果を **send_slack_post_request** で SQS に送信
3. Slack Poster Lambda: SQS トリガーでメッセージ取得 → Slack API で投稿

## 契約

- [slack-post-request.md](contracts/slack-post-request.md): SQS メッセージ body の形式

## 主なファイル

- `cdk/lib/verification/agent/verification-agent/slack_post_request.py`: SQS 送信
- `cdk/lib/verification/agent/verification-agent/main.py`: 投稿処理をすべて `send_slack_post_request` に変更
- `cdk/lib/verification/constructs/slack-poster.ts`: キュー + Slack Poster Lambda
- `cdk/lib/verification/lambda/slack-poster/handler.py`: 投稿実行

## 注意

- Verification Agent の `slack_poster.py` は main からは未使用（existence_check は `existence_check.py` 内で WebClient を直接使用）。必要に応じて削除可能。
