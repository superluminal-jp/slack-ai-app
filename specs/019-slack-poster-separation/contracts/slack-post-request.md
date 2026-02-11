# Slack Post Request (SQS Message Body)

Verification Agent は Slack に直接投稿せず、この形式のメッセージを SQS（slack-post-request）に送信する。Slack Poster Lambda が SQS を消費し、Slack API で投稿する。

## Message Body (JSON)

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `channel` | string | Yes | Slack チャンネル ID |
| `thread_ts` | string \| null | No | スレッドの ts（省略時はチャンネルに直投稿） |
| `message_ts` | string \| null | No | 元メッセージの ts（👀→✅ リアクション差し替え用） |
| `text` | string \| null | No | 投稿するテキスト（最大 4000 文字は Poster 側で分割） |
| `file_artifact` | object \| null | No | ファイル投稿時。下記参照 |
| `bot_token` | string | Yes | Slack Bot Token (xoxb-...) |
| `correlation_id` | string | No | トレース用 |

`text` と `file_artifact` の少なくとも一方は必須。両方ある場合は Poster が先に text を投稿し、続けて file を投稿する。

### file_artifact

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `contentBase64` | string | ファイル内容の Base64 |
| `fileName` | string | ファイル名 |
| `mimeType` | string | MIME タイプ |

## フロー

1. Verification Agent が検証・実行結果を処理したあと、投稿すべき内容をこの形式で 1 メッセージにまとめる。
2. `boto3.client("sqs").send_message(QueueUrl=SLACK_POST_REQUEST_QUEUE_URL, MessageBody=json.dumps(body))` で送信。
3. Slack Poster Lambda が SQS から取得し、`text` があれば `chat.postMessage`、`file_artifact` があれば `files.upload`（または files_upload_v2）を実行。
