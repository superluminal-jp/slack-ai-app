# 設計原則

**目的**: 設計原則の背景と、組織にとっての意味を説明する。
**対象読者**: 意思決定者（経営層、マネージャー、プロダクトオーナー）
**最終更新日**: 2026-02-14

---

## はじめに

本システムの設計は、行動心理学・技術受容・習慣形成などの知見に基づいた原則でまとめています。ここでは各原則の要点と、**組織にとってなぜ重要か**を簡潔に述べます。技術的な詳細は開発者向けドキュメントを参照してください。

---

## 原則 1: 摩擦の最小化（Reduce Friction）

**内容**: ユーザーが AI にアクセスするまでのステップを減らし、認知負荷と操作コストを下げる。

**組織にとっての意味**

- ステップが少ないほど、従業員が AI を「使ってみる」ハードルが下がります。
- 業務ツール（Slack）内で完結するため、新しいツールの習得コストや切り替えコストがかかりません。
- 結果として、AI の利用頻度と定着率の向上が期待できます。

---

## 原則 2: 即座のフィードバック（Immediate Feedback）

**内容**: リクエスト後、遅くとも 2 秒以内に「処理中」などの応答を返し、無反応による離脱を防ぐ。

**組織にとっての意味**

- ユーザーは「届いたかどうか」をすぐに知れるため、不安や再送の繰り返しが減ります。
- 即座の応答は、技術受容研究で「知覚された使いやすさ」を高め、継続利用に寄与することが知られています。
- 体感品質の向上により、組織内での AI ツールへの信頼が高まります。

---

## 原則 3: 文脈の一貫性（Context Consistency）

**内容**: 利用シーンを「Slack 内の会話」に統一し、既存の習慣や文脈を崩さない。

**組織にとっての意味**

- 新しい行動を既存の習慣（Slack でのやり取り）に組み込むことで、習慣形成が早まり、定着率が上がります。
- ツールの切り替えが不要なため、組織全体での導入・教育コストを抑えられます。
- 「いつものチャンネルで、いつものようにメンションする」だけで使えるため、部門をまたいだ展開がしやすくなります。

---

## 原則 4: 段階的開示（Progressive Disclosure）

**内容**: 初回はシンプルな操作だけを見せ、必要に応じて高度な機能を段階的に示す。

**組織にとっての意味**

- 最初から複雑に見せないことで、心理的負荷を下げ、早期の試用を促します。
- スキルに応じて「まずはメンションで質問」「慣れたら画像やファイルも」と広げられるため、習熟度のばらつきが大きい組織でも運用しやすくなります。
- サポート負荷を抑えつつ、段階的にリテラシーを高められます。

---

## 原則 5: 社会的証明（Social Proof）

**内容**: 同じチャンネル内で他者の利用が見えるようにし、利用の正当性とノウハウの共有を促す。

**組織にとっての意味**

- 「他のメンバーも使っている」ことが見えると、採用意欲と継続利用が高まることが実証研究で知られています。
- チャンネル単位で良い使い方や事例が蓄積され、組織の知として共有されやすくなります。
- トップダウンだけでなく、同僚の利用が自然な普及のトリガーになります。

---

## 原則 6: ネットワーク効果の活用（Leverage Network Effects）

**内容**: ユーザー数や利用チャンネルが増えるほど、質問・回答・事例が蓄積し、全体の価値が高まる設計にする。

**組織にとっての意味**

- 利用が広がるほど、質問のパターンや回答の質が改善し、組織全体の AI リテラシーが底上げされます。
- 部門をまたいだ展開により、横断的な知の共有とベストプラクティスの普及が期待できます。
- 投資対効果が、利用規模の拡大に伴って増幅されやすくなります。

---

## 原則 7: 信頼性の透明化（Transparent Reliability）

**内容**: 処理中・完了・エラーなどをユーザーに分かりやすく示し、システムの状態を透明にする。

**組織にとっての意味**

- 何が起きているかが分かることで、誤解や不信が減り、サポート問い合わせの削減につながります。
- 障害や制限がある場合も、説明が明確であれば理解と協力が得やすくなります。
- 透明性は、AI ツールに対する組織内の信頼構築に不可欠です。

---

## 学術的参考文献

設計原則の背景には、以下のような学術的・実証的な知見があります。関心のある読者は参照してください。

### 行動心理学・行動経済学

- **Thaler, R. H., & Sunstein, C. R. (2008)**. _Nudge: Improving Decisions About Health, Wealth, and Happiness_. Yale University Press. — ナッジ理論の基礎。
- **Johnson, E. J., & Goldstein, D. (2003)**. Do defaults save lives? _Science_, 302(5649), 1338-1339. — デフォルト設定の影響に関する実証研究。
- **Prochaska, J. O., & DiClemente, C. C. (1983)**. Stages and processes of self-change of smoking. _Journal of Consulting and Clinical Psychology_, 51(3), 390-395. — 変化の段階モデル。

### ネットワーク効果・ネットワーク外部性

- **Metcalfe, R. M. (1993)**. Metcalfe's Law. _Infoworld_, 15(40), 53-54.
- **Katz, M. L., & Shapiro, C. (1985)**. Network externalities, competition, and compatibility. _The American Economic Review_, 75(3), 424-440.
- **Shapiro, C., & Varian, H. R. (1998)**. _Information Rules: A Strategic Guide to the Network Economy_. Harvard Business Review Press.

### 認知科学・ユーザビリティ

- **Sweller, J. (1988)**. Cognitive load during problem solving. _Cognitive Science_, 12(2), 257-285. — 認知負荷理論。
- **Nielsen, J. (1994)**. _Usability Engineering_. Morgan Kaufmann.

### 技術受容・情報システム

- **Davis, F. D. (1989)**. Perceived usefulness, perceived ease of use, and user acceptance of information technology. _MIS Quarterly_, 13(3), 319-340. — 技術受容モデル（TAM）。
- **Venkatesh, V., & Davis, F. D. (2000)**. A theoretical extension of the technology acceptance model. _Management Science_, 46(2), 186-204.

### 社会的影響・説得

- **Cialdini, R. B. (1984)**. _Influence: The Psychology of Persuasion_. HarperCollins.
- **Salganik, M. J., Dodds, P. S., & Watts, D. J. (2006)**. Experimental study of inequality and unpredictability in an artificial cultural market. _Science_, 311(5762), 854-856.

### 習慣形成・行動変容

- **Lally, P., et al. (2010)**. How are habits formed. _European Journal of Social Psychology_, 40(6), 998-1009.
- **Wood, W., & Neal, D. T. (2007)**. A new look at habits and the habit-goal interface. _Psychological Review_, 114(4), 843-863.

### 情報探索・情報行動

- **Pirolli, P., & Card, S. (1999)**. Information foraging. _Psychological Review_, 106(4), 643-675.
- **Pirolli, P. (2007)**. _Information Foraging Theory: Adaptive Interaction with Information_. Oxford University Press.

### イノベーション拡散

- **Rogers, E. M. (1962)**. _Diffusion of Innovations_. Free Press.
- **Moore, G. A. (1991)**. _Crossing the Chasm_. HarperBusiness.

### 実証研究・業界レポート

- **Baymard Institute (2020)**. _E-commerce Checkout Usability_. — ステップ削減と完了率の関係。

---

詳細な設計論拠と開発者向けの説明は、[設計原則（説明ドキュメント）](../explanation/design-principles.md) および [付録](../appendix.md) を参照してください。
