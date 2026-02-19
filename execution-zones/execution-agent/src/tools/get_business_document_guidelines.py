"""
get_business_document_guidelines tool for Execution Agent (document-assistant skill).

Returns structured guidelines for creating McKinsey-style business documents so the model
can apply them when generating strategic analyses, executive summaries, or recommendations.
Use with generate_text_file or generate_word to produce the final document.
"""

from strands import tool

_GUIDELINES = """# ビジネス文書作成ガイドライン（経営層向け）

## 文書構成
1. **エグゼクティブサマリ**（冒頭・3分で把握できる長さ）
   - 冒頭1–2文で結論・推奨を明示する
   - 3–4の主要論点を重複なく網羅する
   - ビジネスへの示唆を簡潔に述べる
   - 推奨アクションと次のステップを記載する

2. **本文**（3–4セクション）
   - 各セクションは1つの論点を証明する（論点同士は重複なく、全体で漏れがないようにする）
   - セクション内: 主張 → 根拠・データ → 示唆 → 次セクションへの接続
   - 見出しを付け、結論を先に、その後に根拠を書く
   - 重要数値・事実は2–3箇所を太字で強調する

3. **推奨事項**
   - 何を・誰が・いつまでに・どの成果を・どのリソースで行うかを具体的に書く
   - 例: 「推奨1: ジャカルタでQ3までにパイロット開始。担当: VP国際展開。投資: 250万USD。成果: 1000顧客、50万USD売上」のように1件ずつ整理する

## 記載ルール
- 数値・単位・範囲は具体的に書く（「多数」ではなく「約1,000件」など）
- 能動態・現在形を基本とする（「検討すべき」ではなく「推奨する」）
- 1段落1テーマ。接続語で論点をつなぐ
- 事実と解釈は区別し、解釈には「～と考えられる」「示唆される」などを用いる
- 文書本文には「ピラミッド」「MECE」「SCQA」などの手法名は書かない。結論先行・論点の整理・状況→課題→問い→答えの流れは守り、用語だけ出さない

## 品質チェック
- 各主張について「だから何か」が読み手に伝わるか確認する
- 次の質問（なぜか・どうするか）を先回りして書く
- 推奨は「誰が・いつ・何を・どの成果」まで具体化する"""


@tool
def get_business_document_guidelines() -> str:
    """経営層向けビジネス文書（戦略提案・エグゼクティブサマリ・推奨書）を作成する際の構成と記載ルールを返します。

    ユーザーが「提案書を作って」「戦略のサマリをまとめて」「推奨事項を文書化して」などと依頼した場合に、
    このツールでガイドラインを取得し、そのルールに沿って文書を生成してください。完成した内容は
    generate_text_file（Markdown）または generate_word（.docx）でファイルとして出力してください。

    Returns:
        ビジネス文書の構成（エグゼクティブサマリ・本文・推奨）と記載ルールのテキスト。
    """
    return _GUIDELINES.strip()
