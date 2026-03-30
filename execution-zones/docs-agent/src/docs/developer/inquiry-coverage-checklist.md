# Inquiry coverage checklist（問い合わせカバレッジ）

**目的**: 代表問い合わせパターンが `docs/` のどこで答えられるかを追跡する（SC-001）。  
**対象**: レビュアー、ドキュメント担当  
**最終更新日**: 2026-03-30

レビュー時は **Coverage** を `Covered` / `Partial` / `Gap` で更新する。リリース目標: サンプル行の **90% 以上** が `Covered`（単一の primary doc、または文書化された 1 回のクロスリファレンスで完結）。

| ID | Audience | Question | Primary doc path | Coverage | Notes |
| -- | -------- | -------- | ---------------- | -------- | ----- |
| IP-001 | user | ボットが応答しないとき、何を確認すればよいか？ | docs/user/faq.md | Covered | |
| IP-002 | user | 添付できるファイル形式とサイズ上限は？ | docs/user/faq.md | Covered | |
| IP-003 | user | 応答が遅い・タイムアウトするときの見方は？ | docs/user/faq.md | Covered | |
| IP-004 | user | チャンネルや権限で使えない場合があるか？ | docs/user/faq.md | Covered | |
| IP-005 | user | データやプライバシーについて知りたい | docs/user/faq.md | Covered | |
| IP-006 | user | レート制限に達したときはどうするか？ | docs/user/faq.md | Covered | |
| IP-007 | user | スレッドで会話を続けられるか？ | docs/user/faq.md | Covered | |
| IP-008 | user | 効果的な質問の仕方は？ | docs/user/user-guide.md | Covered | |
| IP-009 | developer | ゾーン構成と検証／実行の役割は？ | docs/developer/architecture.md | Covered | |
| IP-010 | developer | セキュリティパイプラインの順序（存在確認・ホワイトリスト等）は？ | docs/developer/security.md | Partial | architecture にも用語あり |
| IP-011 | developer | 統合デプロイのざっくりした順序は？ | docs/developer/quickstart.md | Covered | |
| IP-012 | developer | 再デプロイや運用で最初に見る場所は？ | docs/developer/runbook.md | Covered | |
| IP-013 | developer | 返信がないときの切り分け手順は？ | docs/developer/troubleshooting.md | Covered | |
| IP-014 | decision-maker | 誰が・どの範囲で使えるか（ガバナンス） | docs/decision-maker/governance.md | Covered | |
| IP-015 | decision-maker | セキュリティ上のリスクと対策の要約は？ | docs/decision-maker/security-overview.md | Covered | |
| IP-016 | decision-maker | コストや AWS 依存のざっくりした要因は？ | docs/decision-maker/cost-and-resources.md | Covered | |
| IP-017 | user | 利用ポリシーで禁止されていることは？ | docs/user/usage-policy.md | Covered | |
| IP-018 | developer | A2A や AgentCore という用語の意味は？ | docs/developer/architecture.md | Covered | |
| IP-019 | decision-maker | 利用ポリシー（ユーザー向け）へのリンクはどこ？ | docs/decision-maker/governance.md | Covered | |
| IP-020 | user | エラーメッセージが出たときの基本対応は？ | docs/user/faq.md | Covered | |

## SC-004（ステークホルダー確認）

内部レビュアー 4 名に「典型な質問はドキュメントだけで足りるか」Yes/No で確認し、**3/4 以上** Yes を目標とする。記録は PR 説明または上表 Notes に簡潔に残す。
