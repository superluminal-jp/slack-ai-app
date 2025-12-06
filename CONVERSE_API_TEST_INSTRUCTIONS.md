# Converse API テスト手順

**デプロイ完了**: 2025-12-06 14:27 JST  
**Status**: ✅ デプロイ成功 - テスト準備完了

---

## 🚀 **デプロイ結果**

```
✅  SlackBedrockStack

Outputs:
SlackBedrockStack.SlackEventHandlerUrl = https://xnurenw36wlmeqmvt7gyyqb6my0kirje.lambda-url.ap-northeast-1.on.aws/

✨  Total time: 80.44s
```

**変更内容**:
- ✅ `bedrock_client_converse.py` (Converse API実装)
- ✅ `attachment_processor.py` (Base64エンコード削除)
- ✅ `handler.py` (画像データをバイナリで処理)
- ✅ `thread_history.py` (Converse API形式に対応)

---

## 🧪 **テストケース**

### Test 1: テキスト + 画像 (PNG)
**目的**: Converse APIで画像処理が正常に動作することを確認

**手順**:
1. Slackでボットにメンションして、PNG画像を添付
2. メッセージ: `@SlackAIBot この画像には何が写っていますか？`

**期待される結果**:
- ✅ ボットが画像を正常に認識して返答
- ✅ エラーが発生しない
- ✅ CloudWatch Logsに `Converse API` のログが出力される

**確認ログ**:
```
Invoking Bedrock model (Converse API): anthropic.claude-haiku-4-5-20251001-v1:0
Image count: 1
  Image 0: XXXX bytes, format: png
Bedrock response received (Converse API)
api_type: converse
```

---

### Test 2: テキスト + 画像 (JPEG)
**目的**: JPEG形式の画像も正常に処理されることを確認

**手順**:
1. Slackでボットにメンションして、JPEG画像を添付
2. メッセージ: `@SlackAIBot この写真を分析してください`

**期待される結果**:
- ✅ JPEG画像が正常に認識される
- ✅ `format: jpeg` がログに出力される

---

### Test 3: 複数画像
**目的**: 複数画像の同時処理を確認

**手順**:
1. Slackでボットにメンションして、2枚以上の画像を添付
2. メッセージ: `@SlackAIBot これらの画像の違いを説明してください`

**期待される結果**:
- ✅ 複数画像が正常に処理される
- ✅ ログに `Image count: 2` (または添付数)

---

### Test 4: PDF ドキュメント
**目的**: テキスト抽出機能が正常に動作することを確認

**手順**:
1. Slackでボットにメンションして、PDFファイルを添付
2. メッセージ: `@SlackAIBot この文書を要約してください`

**期待される結果**:
- ✅ PDFからテキストが抽出される
- ✅ 要約が返答される
- ✅ ログに `Document text count: 1`

---

### Test 5: スレッド返信 + 画像
**目的**: 会話履歴との組み合わせが正常に動作することを確認

**手順**:
1. Slackでボットにメンションして最初のメッセージを送信
2. ボットの返信に対して、スレッドで画像を添付して返信
3. メッセージ: `この画像について教えてください`

**期待される結果**:
- ✅ 会話履歴が正しく保持される
- ✅ 画像が正常に処理される
- ✅ `ValidationException` エラーが発生しない（これが重要！）

---

## 📊 **ログ確認方法**

### CloudWatch Logs (Bedrock Processor)

```bash
export AWS_PROFILE=amplify-admin
aws logs tail /aws/lambda/SlackBedrockStack-BedrockProcessorHandler26E88FBB-V5T0bI2i2y8B --follow --since 1m
```

**確認ポイント**:
1. `Invoking Bedrock model (Converse API)` が出力される
2. `api_type: converse` が出力される
3. `ValidationException` エラーが発生しない
4. 画像カウントとフォーマットが正しい

### CloudWatch Logs (Event Handler)

```bash
export AWS_PROFILE=amplify-admin
aws logs tail /aws/lambda/SlackBedrockStack-SlackEventHandler898FE80E-RZ0I52zUvLDT --follow --since 1m
```

**確認ポイント**:
1. `attachments_detected` ログが出力される
2. `execution_api_invocation_success` が出力される
3. 502エラーが発生しない

---

## ✅ **成功の判定基準**

### 必須項目:
- [ ] 画像添付メッセージに対してボットが正常に返答
- [ ] CloudWatch Logsに `Converse API` のログが出力
- [ ] `ValidationException: Could not process image` エラーが発生しない
- [ ] `api_type: converse` がログに記録される

### 追加確認:
- [ ] 複数画像の処理が成功
- [ ] ドキュメント（PDF, DOCX）の処理が成功
- [ ] スレッド返信で画像が正常に処理される
- [ ] 502エラーが発生しない

---

## 🔍 **トラブルシューティング**

### エラーケース 1: `ValidationException`
**原因**: Converse API形式が間違っている  
**対処**: ログで画像データの形式を確認

### エラーケース 2: `TypeError: expected bytes, got str`
**原因**: Base64エンコードされた文字列がバイナリと混在  
**対処**: `attachment_processor.py` で正しくバイナリデータを返しているか確認

### エラーケース 3: 502 Internal Server Error
**原因**: Lambda関数で未処理の例外  
**対処**: CloudWatch Logsでスタックトレースを確認

---

## 📝 **テスト記録**

### Test 1: テキスト + 画像 (PNG)
- **実施日時**: ___________
- **結果**: [ ] 成功 / [ ] 失敗
- **ログ確認**: [ ] OK / [ ] NG
- **備考**: _______________________________

### Test 2: テキスト + 画像 (JPEG)
- **実施日時**: ___________
- **結果**: [ ] 成功 / [ ] 失敗
- **ログ確認**: [ ] OK / [ ] NG
- **備考**: _______________________________

### Test 3: 複数画像
- **実施日時**: ___________
- **結果**: [ ] 成功 / [ ] 失敗
- **ログ確認**: [ ] OK / [ ] NG
- **備考**: _______________________________

### Test 4: PDF ドキュメント
- **実施日時**: ___________
- **結果**: [ ] 成功 / [ ] 失敗
- **ログ確認**: [ ] OK / [ ] NG
- **備考**: _______________________________

### Test 5: スレッド返信 + 画像
- **実施日時**: ___________
- **結果**: [ ] 成功 / [ ] 失敗
- **ログ確認**: [ ] OK / [ ] NG
- **備考**: _______________________________

---

## 🎯 **次のステップ**

1. **今すぐテスト**: Slackで画像を添付してメッセージを送信
2. **ログ監視**: CloudWatch Logsをリアルタイムで確認
3. **結果確認**: エラーが解決されたか確認
4. **ドキュメント更新**: テスト結果を記録

---

**準備完了！さっそくSlackで画像を送信してテストしましょう！** 🚀

