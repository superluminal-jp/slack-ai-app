# Feature Specification: docs/ フォルダ更新と docs-agent プロンプト改善

**Feature Branch**: `045-update-docs-and-prompts`
**Created**: 2026-03-18
**Status**: Draft
**Input**: User description: "@docs/ フォルダの内容を現状のコードベースに合わせて更新。 docs-agent で参照するプロンプトも合わせて改善"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 開発者がドキュメントを参照し最新状態を確認できる (Priority: P1)

開発者がシステムのアーキテクチャや構成を調べる際、`docs/developer/architecture.md` を参照したら、現在デプロイされている全エージェント（slack-search-agent、usage-history 機能、DynamoDB PITR エクスポート、S3 レプリケーション、cdk-nag ガバナンス等）が正確に記述されていることを確認できる。

**Why this priority**: ドキュメントと実装の乖離は、デプロイミスや調査コストの増大を招く。最も利用頻度の高いアーキテクチャ資料の整合性が最優先。

**Independent Test**: architecture.md を読んで「slack-search-agent が verification-zones に存在すること」「usage-history テーブルと S3 バケットが存在すること」「cdk-nag が全スタックに適用済みであること」を確認できれば単独でテスト可能。

**Acceptance Scenarios**:

1. **Given** 開発者が architecture.md を開いたとき、**When** Execution Zone のコンポーネント一覧を確認したとき、**Then** docs-agent、fetch-url-agent、file-creator-agent、time-agent の 4 Execution Agent が正確に記述されており、旧 execution-agent への誤った言及がない
2. **Given** 開発者が architecture.md を参照したとき、**When** Verification Zone を確認したとき、**Then** slack-search-agent が verification-zone のコンポーネントとして正確に記述されている
3. **Given** 開発者が architecture.md を参照したとき、**When** ストレージセクションを確認したとき、**Then** usage-history DynamoDB テーブル・S3 バケット・S3 Same-Region Replication・DynamoDB PITR エクスポートが記述されている
4. **Given** 開発者が architecture.md を参照したとき、**When** ガバナンス・セキュリティセクションを確認したとき、**Then** cdk-nag による AWS Solutions セキュリティスキャンが全 CDK スタックに適用されていることが記述されている

---

### User Story 2 - Slack から docs-agent に質問して有用な回答を得る (Priority: P2)

Slack ユーザーが AI ボットにシステムに関する質問（アーキテクチャ、デプロイ手順、エージェント一覧など）をした際、docs-agent が適切なドキュメントを検索し、的確で構造化された回答を返す。

**Why this priority**: docs-agent のシステムプロンプトが曖昧なため、回答の質にばらつきがある。プロンプトを改善することで回答品質が向上する。

**Independent Test**: docs-agent に「このシステムの Execution Agent の種類を教えて」と質問し、search_docs ツールが呼ばれ、ドキュメントに基づいた回答が返ることを確認。

**Acceptance Scenarios**:

1. **Given** ユーザーが「デプロイ手順を教えて」と質問したとき、**When** docs-agent が search_docs を呼び出したとき、**Then** quickstart.md の内容に基づいたデプロイ手順が返される
2. **Given** ユーザーが「このシステムのエージェント一覧を教えて」と質問したとき、**When** docs-agent が architecture.md を検索したとき、**Then** 全エージェント名と役割が正確に返される
3. **Given** 検索クエリに一致するドキュメントが存在しないとき、**When** docs-agent が結果なしと判断したとき、**Then** 「ドキュメントに見つかりません」と明示し、代替キーワードを提案する

---

### User Story 3 - 新規開発者がクイックスタートを使って環境構築できる (Priority: P3)

新規開発者が quickstart.md を参照して環境構築を行った際、現在の全エージェント（docs-agent、fetch-url-agent、file-creator-agent、time-agent、slack-search-agent）のデプロイ手順と設定が正確に記述されており、追加の調査なしに初回デプロイが完了できる。

**Why this priority**: アーキテクチャ文書の後、クイックスタートが次に重要な開発者向け文書。最新のデプロイフローに合わせて更新する必要がある。

**Independent Test**: quickstart.md の手順のみに従って、全エージェントのデプロイが完了できれば単独でテスト可能。

**Acceptance Scenarios**:

1. **Given** 新規開発者が quickstart.md を参照したとき、**When** デプロイ手順を実行したとき、**Then** slack-search-agent のデプロイ手順が含まれており、そのまま実行できる
2. **Given** 開発者が quickstart.md を参照したとき、**When** 設定ファイルのサンプルを確認したとき、**Then** executionAgentArns に全現行エージェントが含まれているサンプルが示されている

---

### Edge Cases

- docs-agent の search_docs が複数ドキュメントにまたがる質問（例: 「アーキテクチャとデプロイの関係」）に対して、関連文書を複数取得して統合した回答を返すこと
- 古いコンポーネント名（例: 旧 Execution Agent、API Gateway 構成）への質問に対して、現在の構成に修正して回答すること
- ドキュメント間でエージェント一覧の記述が矛盾しないこと（architecture.md、quickstart.md、docs/README.md の整合性）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `docs/developer/architecture.md` は現行の全 Execution Zone エージェント（docs-agent、fetch-url-agent、file-creator-agent、time-agent）と全 Verification Zone エージェント（verification-agent、slack-search-agent）を正確に記述しなければならない
- **FR-002**: `docs/developer/architecture.md` は usage-history DynamoDB テーブル、usage-history S3 バケット、S3 Same-Region Replication（usage-history → usage-history-archive）、DynamoDB PITR エクスポートを記述しなければならない
- **FR-003**: `docs/developer/architecture.md` は cdk-nag による AWS Solutions セキュリティスキャンがすべての CDK スタックに適用されていることを記述しなければならない
- **FR-004**: `docs/developer/quickstart.md` は slack-search-agent を含む全エージェントのデプロイ手順と設定サンプルを含まなければならない
- **FR-005**: `docs/developer/execution-agent-system-prompt.md` は旧 execution-agent を前提とした記述を除去し、現行の各エージェント（docs-agent・fetch-url-agent・file-creator-agent・time-agent）のシステムプロンプト管理方針を反映しなければならない
- **FR-006**: `execution-zones/docs-agent/src/system_prompt.py` の `FULL_SYSTEM_PROMPT` は、検索ガイダンス（どのキーワードで何を検索すべきか）、回答フォーマットの指針、スコープ外質問への対応方針を含む、具体的で actionable なプロンプトでなければならない
- **FR-007**: docs/ 内の更新した文書の「最終更新日」は実際の更新日（2026-03-18）に更新されなければならない
- **FR-008**: `docs/README.md`（ドキュメント入口）のナビゲーションリンク・エージェント一覧は現行の実装と一致しなければならない

### Key Entities

- **docs-agent システムプロンプト**: `execution-zones/docs-agent/src/system_prompt.py` — search_docs ツールの使い方、回答品質の指針を含む文字列定数
- **architecture.md**: `docs/developer/architecture.md` — システム全体構成、コンポーネント、データフロー、クロスアカウント構成を記述する主要開発者文書
- **quickstart.md**: `docs/developer/quickstart.md` — 初回デプロイから動作確認までの手順書
- **execution-agent-system-prompt.md**: `docs/developer/execution-agent-system-prompt.md` — 各エージェントのシステムプロンプト管理方針を説明する開発者向け文書

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: architecture.md 内のコンポーネント記述が現行コードベースの実装と 100% 一致する（旧コンポーネントへの誤った参照がゼロ、全現行エージェントが記載済み）
- **SC-002**: docs-agent のシステムプロンプトに、search_docs を呼ぶべき質問のカテゴリと推奨キーワード例が明記されており、エージェントが適切にツールを使用する
- **SC-003**: quickstart.md の手順のみで slack-search-agent を含む全エージェントのデプロイが完了できる
- **SC-004**: docs/ 内の更新した全文書の「最終更新日」が 2026-03-18 に更新されている
- **SC-005**: docs/README.md のナビゲーションリンクがすべて有効で、現行のエージェント・機能一覧が正確に反映されている

## Assumptions

- 対象はドキュメントと docs-agent のシステムプロンプトの更新のみで、コードの動作変更は含まない
- 現行の execution-zones には docs-agent、fetch-url-agent、file-creator-agent、time-agent の 4 エージェントが存在する（旧 execution-agent は削除済み）
- slack-search-agent は verification-zones に存在する
- usage-history テーブル・バケット・PITR・S3 レプリケーション・cdk-nag は実装済みであり、ドキュメントへの反映のみが必要
- docs-agent の search_docs ツール実装は変更しない（システムプロンプトのみ改善）
- ドキュメントは既存の慣例に従い日本語で記述する
