# Converse API 移行完了

**日付**: 2025-12-06 14:30 JST  
**目的**: InvokeModel APIからConverse APIへの移行  
**Status**: ✅ コード変更完了 - デプロイ準備中

---

## 📝 **変更サマリー**

### 主な変更点:

1. **新しいBedrock クライアント作成**
   - `bedrock_client_converse.py` を新規作成
   - Converse API専用の実装

2. **Base64エンコードを削除**
   - `attachment_processor.py` から Base64 エンコード処理を削除
   - 画像をバイナリデータとして保持

3. **Handler 更新**
   - `handler.py` でConverse API用のデータ準備
   - 画像フォーマット情報を追加

4. **Thread History フォーマット更新**
   - `thread_history.py` の返り値をConverse API形式に変更
   - `content` を文字列から配列形式に

---

## 🔧 **実装詳細**

### 1. bedrock_client_converse.py (新規作成)

**主な機能**:
```python
def invoke_bedrock(
    prompt: str,
    conversation_history: Optional[List[Dict[str, Any]]] = None,
    images: Optional[List[bytes]] = None,  # バイナリデータ
    image_formats: Optional[List[str]] = None,  # ["png", "jpeg"]
    document_texts: Optional[List[str]] = None,
) -> str:
```

**変更点**:
- ✅ Base64エンコード不要（バイナリデータ直接送信）
- ✅ `bedrock_runtime.converse()` を使用
- ✅ 統一されたレスポンス形式

**Converse API リクエスト形式**:
```python
response = bedrock_runtime.converse(
    modelId="anthropic.claude-haiku-4-5-20251001-v1:0",
    messages=[
        {
            "role": "user",
            "content": [
                {"text": "この画像には何が写っていますか？"},
                {
                    "image": {
                        "format": "png",
                        "source": {"bytes": image_bytes}  # Binary!
                    }
                }
            ]
        }
    ],
    inferenceConfig={
        "maxTokens": 1024,
        "temperature": 1.0
    }
)
```

### 2. attachment_processor.py

**変更前**:
```python
# Base64 encode image for Bedrock API
base64_image = base64.b64encode(file_bytes).decode('utf-8')
processed.append({
    "content": base64_image,  # Base64文字列
})
```

**変更後**:
```python
# Store image as binary data
processed.append({
    "content": file_bytes,  # バイナリデータ
})
```

### 3. handler.py

**変更前**:
```python
from bedrock_client import invoke_bedrock, prepare_image_content

# Base64エンコード済みの画像コンテンツを準備
image_content = prepare_image_content(base64_image, mimetype)
images.append(image_content)

ai_response = invoke_bedrock(
    text,
    conversation_history,
    images=images,
    document_texts=document_texts
)
```

**変更後**:
```python
from bedrock_client_converse import invoke_bedrock

# バイナリデータと画像フォーマットを準備
images = []
image_formats = []

for attachment in processed_attachments:
    if content_type == "image":
        mimetype = attachment.get("mimetype", "image/png")
        image_format = mimetype.split("/")[-1].lower()
        format_mapping = {"jpg": "jpeg", "jpeg": "jpeg", "png": "png"}
        image_format = format_mapping.get(image_format, "png")
        
        images.append(content)  # バイナリデータ
        image_formats.append(image_format)

ai_response = invoke_bedrock(
    text,
    conversation_history,
    images=images,
    image_formats=image_formats,
    document_texts=document_texts
)
```

### 4. thread_history.py

**変更前**:
```python
def get_thread_history(...) -> List[Dict[str, str]]:
    history.append({
        "role": "user",
        "content": text  # 文字列
    })
```

**変更後**:
```python
def get_thread_history(...) -> List[Dict[str, Any]]:
    history.append({
        "role": "user",
        "content": [{"text": text}]  # 配列形式（Converse API）
    })
```

---

## 📊 **期待される改善**

### パフォーマンス:
- ✅ Base64エンコード処理の削減（CPU使用率 ↓）
- ✅ データサイズの削減（約33%小さくなる）
- ✅ メモリ使用量の削減

### エラー解決:
- ✅ `ValidationException: Could not process image` の解決
- ✅ Base64エンコードエラーの回避
- ✅ 会話履歴との組み合わせ時の問題解決

### コードの質:
- ✅ コードがシンプルになる
- ✅ 統一されたAPI（モデル切り替えが容易）
- ✅ 保守性の向上

---

## 🧪 **テスト計画**

### Test Case 1: 画像のみ
- [ ] PNG画像を送信
- [ ] JPEG画像を送信
- [ ] 複数画像を送信

### Test Case 2: テキスト + 画像
- [ ] テキストメッセージ + PNG画像
- [ ] テキストメッセージ + JPEG画像

### Test Case 3: ドキュメント
- [ ] PDF添付
- [ ] DOCX添付
- [ ] XLSX添付

### Test Case 4: 会話履歴
- [ ] スレッドでの返信（履歴あり）
- [ ] 画像 + スレッド返信

### Test Case 5: エラーケース
- [ ] サイズ超過画像
- [ ] 不正な画像フォーマット
- [ ] サポート外ファイル

---

## 🚀 **デプロイ手順**

1. **変更ファイル確認**:
   - [x] `lambda/bedrock-processor/bedrock_client_converse.py` (新規)
   - [x] `lambda/bedrock-processor/attachment_processor.py` (更新)
   - [x] `lambda/bedrock-processor/handler.py` (更新)
   - [x] `lambda/bedrock-processor/thread_history.py` (更新)

2. **デプロイコマンド**:
```bash
cd /Users/taikiogihara/work/slack-ai-app/cdk
export AWS_PROFILE=amplify-admin
export SLACK_SIGNING_SECRET=3f6da44cab25de5936d8261ced275b5d
export SLACK_BOT_TOKEN=xoxb-***  # Replace with your actual bot token
cdk deploy --require-approval never
```

3. **デプロイ後の確認**:
   - CloudWatch Logsで "Converse API" のログを確認
   - `api_type: "converse"` が出力されることを確認

---

## 🔍 **検証ポイント**

### ログで確認すべき項目:

1. **API呼び出し**:
   ```
   Invoking Bedrock model (Converse API): anthropic.claude-haiku-4-5-20251001-v1:0
   Image count: 1
     Image 0: XXXX bytes, format: png
   ```

2. **成功レスポンス**:
   ```
   Bedrock response received (Converse API)
   Stop reason: end_turn
   api_type: converse
   ```

3. **エラーがないこと**:
   - `ValidationException` が発生しない
   - Base64エンコードエラーが発生しない

---

## 📚 **参考資料**

- [AWS Bedrock Converse API 公式ドキュメント](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- [Converse API 発表記事](https://aws.amazon.com/jp/about-aws/whats-new/2024/05/amazon-bedrock-new-converse-api/)
- Anthropic Claude サポート: Claude 3, Claude 3.5, Claude 4

---

## ✅ **移行チェックリスト**

- [x] bedrock_client_converse.py 作成
- [x] attachment_processor.py からBase64削除
- [x] handler.py でConverse API使用
- [x] thread_history.py フォーマット更新
- [ ] CDK デプロイ
- [ ] 画像添付テスト
- [ ] ドキュメント添付テスト
- [ ] エラー解決確認

---

**次のステップ**: CDK デプロイを実行してテスト

