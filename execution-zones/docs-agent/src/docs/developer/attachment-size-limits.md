# 添付ファイルサイズ上限の制約と活用状況

**目的**: 添付ファイルのサイズ上限が何の制約に基づいているか、および上限を最大限活用できているかを整理する。  
**対象**: ユーザー→アプリ（受信）および アプリ→Slack（生成ファイル投稿）。

---

## 1. 制約の種類と出所

### 1.1 ユーザーが送る添付（受信）

| 制約 | 出所 | 画像 | ドキュメント |
|------|------|------|--------------|
| **Amazon Bedrock Converse API** | [Message - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Message.html), [API restrictions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api-restrictions.html) | 1枚あたり **3.75 MB**（高さ・幅は各 8000 px まで） | 1件あたり **4.5 MB**（PDF 等はモデルにより例外あり） |
| Lambda / メモリ・タイムアウト | 実装・運用 | 大きなファイルはメモリ・時間を消費 | 同左 |
| Slack 側の制限 | ワークスペース設定 | ユーザーがアップロード可能なサイズはワークスペース次第（本アプリの検証対象外） | 同左 |

実質的な**ボトルネックは Bedrock Converse API**（画像 3.75 MB、ドキュメント 4.5 MB）。

### 1.2 アプリが Slack に投稿する生成ファイル（送信）

| 制約 | 出所 | 値 |
|------|------|-----|
| **Slack ワークスペースのファイル共有上限** | ワークスペース設定・プラン（コメント上 "Slack workspace limit"） | 本アプリでは **10 MB** をデフォルトに設定 |
| SQS ペイロード | 大きなファイルは S3 経由（028） | 200 KB 超で S3 + プリサインド URL に切り替え |

実質的な**ボトルネックは Slack のアップロード許容量**。現状は 10 MB を上限として運用。

---

## 2. 現在の実装値

### 2.1 受信（ユーザー添付）

| 箇所 | 画像 | ドキュメント | ファイル |
|------|------|--------------|----------|
| `attachment_processor.py` (Execution Agent / Lambda) | 10 MB | 5 MB | — |
| `bedrock_client_converse.py` の `prepare_image_content_converse` | 5 MB（送信前チェック） | — | — |
| ドキュメント | `docs/user/usage-policy.md`, `docs/developer/security.md` (SR-07-01) | 10 MB / 5 MB と記載 | — |

### 2.2 送信（生成ファイル）

| 箇所 | 値 |
|------|-----|
| `file_config.py` | 全体 10 MB、テキスト 1 MB、Office 10 MB、画像 5 MB（環境変数で上書き可） |

---

## 3. 最大限活用できているか

### 3.1 受信（ユーザー添付）

**結論: 現状は Bedrock の上限と一致しておらず、最大限にはなっていない。**

- **画像**
  - Bedrock: **3.75 MB/枚**。
  - 実装: 入口で 10 MB、Converse 送信前に 5 MB でチェック。
  - 3.75 MB ～ 5 MB の画像はダウンロード・送信まで行われるが、Bedrock で拒否される可能性がある。また 5 MB は Bedrock の公式値より大きい。
  - **最大限活用するなら**: 入口・送信前の両方で **3.75 MB** に合わせるのがよい（早い段階で明確に弾ける）。

- **ドキュメント**
  - Bedrock: **4.5 MB/件**（PDF 等はモデルにより例外あり）。
  - 実装: 5 MB まで許可。
  - 4.5 MB ～ 5 MB のファイルは受け付けた後に Bedrock でエラーになり得る。
  - **最大限活用するなら**: **4.5 MB** に合わせると、Bedrock の許容いっぱいまで使いつつ、ランタイムエラーを避けられる。

### 3.2 送信（生成ファイル）

**結論: Slack の「ワークスペース制限」を 10 MB と解釈しているなら、その範囲では活用できている。**

- 全体 10 MB、種別ごと（テキスト 1 MB、Office 10 MB、画像 5 MB）は `file_config.py` で一貫しており、環境変数で調整可能。
- Slack の公式の「ファイル共有の上限」はプラン・設定依存のため、実際のワークスペース上限が 10 MB より大きい場合は、その限りでは「さらに大きくする余地」はあるが、一般的な目安としては 10 MB で妥当。

---

## 4. 推奨アクション（受信側の整合性）

Bedrock の制限に合わせて「受け付ける上限」を揃えると、利用可能な範囲を最大限にしつつ、ユーザーには早い段階で明確なエラーを返せる。

| 項目 | 現状 | 推奨 | 主な変更箇所 |
|------|------|------|----------------|
| 画像（受信） | 10 MB（入口）→ 5 MB（送信前） | **3.75 MB** に統一 | `attachment_processor.py` の `MAX_IMAGE_SIZE`, `bedrock_client_converse.py` の `prepare_image_content_converse` 内の `max_size` |
| ドキュメント（受信） | 5 MB | **4.5 MB** | `attachment_processor.py` の `MAX_DOCUMENT_SIZE` |

あわせて以下を更新するとよい。

- `docs/user/usage-policy.md` の「最大サイズ」表
- `docs/developer/security.md` の SR-07-01
- `specs/004-slack-attachments/research.md` のサイズ記述（10MB/5MB の根拠を Bedrock 3.75/4.5 に合わせて修正）

---

## 5. 参照

- [Message - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Message.html) — 画像 3.75 MB/枚、ドキュメント 4.5 MB/件
- [API restrictions - Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api-restrictions.html)
- 004-slack-attachments/research.md §5（サイズ制限の決定）
- 024-slack-file-attachment/spec.md FR-006（10 MB / 5 MB）
- 027-slack-file-generation-best-practices（生成ファイルの 10 MB 等）
