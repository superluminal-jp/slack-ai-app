# Slack Attachments Testing Instructions

**Deployment Date**: 2025-12-06  
**Status**: ✅ Deployed Successfully

## 📋 **What Was Deployed**

The following features are now live:

1. ✅ **Image Attachment Processing** - Send PNG, JPG, GIF, WEBP images to the bot
2. ✅ **Document Text Extraction** - Send PDF, DOCX, CSV, XLSX, PPTX, TXT files
3. ✅ **Multiple Attachments** - Send multiple files in a single message
4. ✅ **Attachments Only** - Send files without text (the bot will analyze them)

## 🧪 **Test Cases**

### Test 1: Image Attachment (Vision AI)
1. Open Slack
2. Go to the channel with the AI bot or DM the bot
3. Upload an image (PNG, JPG, GIF, or WEBP)
4. Add a message: "この画像には何が写っていますか？" (What's in this image?)
5. Send the message
6. **Expected**: Bot analyzes the image and describes what it sees

### Test 2: PDF Document
1. Upload a PDF file
2. Add a message: "このPDFを要約してください" (Summarize this PDF)
3. Send the message
4. **Expected**: Bot extracts text from PDF and provides a summary

### Test 3: Excel File
1. Upload an XLSX file
2. Add a message: "このExcelファイルのデータを分析してください" (Analyze this Excel data)
3. Send the message
4. **Expected**: Bot extracts data from all sheets and analyzes it

### Test 4: PowerPoint File
1. Upload a PPTX file
2. Add a message: "このプレゼンの内容を教えてください" (Tell me about this presentation)
3. Send the message
4. **Expected**: Bot extracts text from all slides and summarizes the content

### Test 5: Multiple Attachments
1. Upload multiple files (e.g., 1 image + 1 PDF)
2. Add a message: "これらのファイルを確認してください" (Please review these files)
3. Send the message
4. **Expected**: Bot processes all attachments and provides analysis

### Test 6: Attachments Only (No Text)
1. Upload an image WITHOUT any message text
2. Send just the image
3. **Expected**: Bot analyzes the image automatically

## 📊 **Monitoring**

Two terminal windows are now running, monitoring CloudWatch Logs in real-time:

### Terminal 1: BedrockProcessor Logs
- Watch for: `attachment_processing_started`, `attachment_download_success`, `attachments_processed`
- This shows file downloads and AI processing

### Terminal 2: SlackEventHandler Logs
- Watch for: `attachments_detected`, `execution_api_invocation_started`
- This shows attachment detection and forwarding

## 🔍 **What to Look For**

### Success Indicators:
- ✅ `"event": "attachments_detected"` - Bot detected the attachment
- ✅ `"event": "attachment_download_started"` - Started downloading
- ✅ `"event": "attachment_download_success"` - Successfully downloaded
- ✅ `"event": "attachments_processed"` - Processing complete
- ✅ `"event": "bedrock_response_received"` - AI response generated
- ✅ Bot posts a response in Slack

### Error Indicators:
- ❌ `"event": "attachment_download_failed"` - Download error
- ❌ `"event": "attachment_processing_failed"` - Processing error
- ❌ `"event": "bedrock_api_error"` - AI service error

## 🐛 **Troubleshooting**

### If the bot doesn't respond:
1. Check CloudWatch Logs for errors
2. Verify file size limits:
   - Images: Max 10MB
   - Documents: Max 5MB
3. Verify file types are supported:
   - Images: PNG, JPG, GIF, WEBP
   - Documents: PDF, DOCX, CSV, XLSX, PPTX, TXT

### If image analysis doesn't work:
1. Check logs for `ValidationException: Could not process image`
2. Verify the Bedrock model supports vision (Claude Haiku 4.5 does)
3. Check `image_content_prepared` log for image size

### If document text is empty:
1. Check logs for extraction errors
2. Verify the document actually contains text (not just images)
3. For XLSX: Check if cells contain data
4. For PPTX: Check if slides contain text

## 📝 **Sample Test Messages**

Japanese:
```
画像: "この画像について教えてください"
PDF: "このPDFの要点をまとめてください"
Excel: "このデータの傾向を分析してください"
PowerPoint: "このプレゼンの主要なポイントは？"
複数: "これらのファイルの関連性を分析してください"
```

English:
```
Image: "What do you see in this image?"
PDF: "Summarize this PDF document"
Excel: "Analyze the trends in this data"
PowerPoint: "What are the key points in this presentation?"
Multiple: "How are these files related?"
```

## ✅ **Success Criteria**

- [  ] Image attachment: Bot describes the image content
- [  ] PDF attachment: Bot extracts and analyzes text
- [  ] Excel attachment: Bot reads data from all sheets
- [  ] PowerPoint attachment: Bot extracts text from all slides
- [  ] Multiple attachments: Bot processes all files
- [  ] Attachments only: Bot works without text message

## 🚀 **Next Steps After Testing**

1. ✅ Test all file types
2. ✅ Verify error handling
3. ✅ Check performance with large files
4. 📝 Document any issues found
5. 🔧 Fix any bugs discovered
6. ✨ (Optional) Add LibreOffice Layer for PPTX image conversion

---

**Ready to test!** 🎉

