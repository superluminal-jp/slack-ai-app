# Claude Code 設定

[Claude Code](https://docs.anthropic.com/en/docs/claude-code)（Anthropic 公式 CLI）のモジュラー型プロダクション対応設定です。

仕様駆動開発、プロフェッショナルな出力基準、自動品質ゲートを実現する Rules・Skills・Agents・Commands・Hooks を提供します。

> **English version**: [README.md](README.md)

## 構成

```
.claude/
├── CLAUDE.md                  # プロジェクト憲法 (<5KB)
├── settings.json              # Hooks・権限・環境変数
├── mcp.json                   # MCP サーバー参考設定（後述）
│
├── rules/                     # 常時適用される標準（8ファイル）
│   ├── spec-driven-development.md
│   ├── output-standards.md
│   ├── file-editing.md
│   ├── model-selection.md
│   ├── context-management.md
│   ├── memory-vs-repo-rules.md
│   ├── documentation.md
│   └── git-branch-naming.md
│
├── skills/                    # オンデマンド機能（5スキル）
│   ├── speckit-workflow/
│   ├── document-assistant/
│   ├── presentation-assistant/
│   ├── file-editing-strategy/
│   └── documentation-management/
│
├── agents/                    # 委譲型サブエージェント（8エージェント）
│   ├── quality-checker.md
│   ├── doc-updater.md
│   ├── architecture-reviewer.md
│   ├── spec-compliance-reviewer.md
│   ├── file-edit-reviewer.md
│   ├── context-optimizer.md
│   ├── model-selector.md
│   └── rules-organizer.md
│
├── commands/                  # スラッシュコマンド（5コマンド）
│   ├── speckit.md
│   ├── update-readme.md
│   ├── update-changelog.md
│   ├── quality-check.md
│   └── validate-docs.md
│
└── hooks/                     # ライフサイクルイベントスクリプト（13フック）
    ├── advanced-pre-tool-use.sh
    ├── pre-edit-validate.sh
    ├── speckit-pre-edit.sh
    ├── pre-bash-commit-check.sh
    ├── post-edit-format.sh
    ├── post-edit-doc-tracker.sh
    ├── pre-commit-docs.sh
    ├── pre-commit-validate.sh
    ├── quality-gate.sh
    ├── stop-final-check.sh
    ├── subagent-stop-guide.sh
    ├── teammate-idle.sh
    └── task-completed.sh
```

## 仕組み

### CLAUDE.md（憲法）

セッション開始時に毎回読み込まれます。5KB 以下に収め、コア原則・クイックリファレンス・rules/skills/agents へのポインタを記載します。Claude Code の動作の単一エントリーポイントです。

### Rules（常時適用）

すべてのセッションで適用される標準です。CLAUDE.md の参照経由で読み込まれます。

| ルール | 目的 |
|--------|------|
| `spec-driven-development` | 実装前に仕様を定義 |
| `output-standards` | マッキンゼー品質のプロフェッショナル文書 |
| `file-editing` | 全体書き換えより的確な部分編集 |
| `model-selection` | Opus / Sonnet / Haiku のタスク振り分け |
| `context-management` | トークンとセッションの最適化 |
| `memory-vs-repo-rules` | メモリ vs リポジトリレベル設定の分類 |
| `documentation` | コードとドキュメントの同期 |
| `git-branch-naming` | ブランチ命名規則 |

### Skills（オンデマンド）

タスクに応じて自動的に、または `/name` で手動起動します。

| スキル | トリガー |
|--------|----------|
| `speckit-workflow` | コード変更時、`/speckit` |
| `document-assistant` | ビジネス文書作成 |
| `presentation-assistant` | スライドデザイン |
| `file-editing-strategy` | 大規模ファイル編集（100行超） |
| `documentation-management` | README/CHANGELOG 更新 |

### Agents（委譲タスク）

独立したコンテキストウィンドウを持つ専門サブエージェントです。

| エージェント | 目的 |
|-------------|------|
| `quality-checker` | 3段階の出力品質検証 |
| `doc-updater` | ドキュメントのアトミック更新 |
| `architecture-reviewer` | システム設計レビュー |
| `spec-compliance-reviewer` | 仕様トレーサビリティ検証 |
| `file-edit-reviewer` | 編集効率の評価 |
| `context-optimizer` | コンテキスト使用量の最適化 |
| `model-selector` | モデル割り当て推奨 |
| `rules-organizer` | ルール配置ガイダンス |

### Commands（ユーザー起動）

よく使うワークフロー用のスラッシュコマンドです。

| コマンド | アクション |
|---------|-----------|
| `/speckit` | 仕様駆動開発ワークフロー実行 |
| `/update-readme` | README を現在の状態に同期 |
| `/update-changelog` | CHANGELOG エントリー追加 |
| `/quality-check` | 品質検証を実行 |
| `/validate-docs` | ドキュメントの正確性チェック |

### Hooks（ライフサイクルイベント）

`settings.json` で設定。ライフサイクルイベント時に自動実行されます。

| イベント | フック | 目的 |
|---------|--------|------|
| **PreToolUse** | `advanced-pre-tool-use.sh`, `pre-edit-validate.sh`, `speckit-pre-edit.sh`, `pre-bash-commit-check.sh` | ブランチ保護・安全チェック・spec-kit 誘導 |
| **PostToolUse** | `post-edit-format.sh`, `post-edit-doc-tracker.sh` | 自動フォーマット・ドキュメント変更追跡 |
| **Stop** | `stop-final-check.sh` | 最終バリデーションチェックリスト |
| **SubagentStop** | `subagent-stop-guide.sh` | 次ステップの提案 |
| **TeammateIdle** | `teammate-idle.sh` | エージェントチームのアイドル制御 |
| **TaskCompleted** | `task-completed.sh` | エージェントチームのタスクゲート |

その他のユーティリティフック: `pre-commit-docs.sh`, `pre-commit-validate.sh`, `quality-gate.sh`

## クイックリファレンス

```bash
/speckit            # 仕様駆動開発ワークフロー
/update-readme      # README 同期
/update-changelog   # CHANGELOG エントリー追加
/quality-check      # 品質検証実行
/validate-docs      # ドキュメント正確性チェック
```

## MCP サーバー

`mcp.json` は**参考用**として同梱しています。Claude Code は MCP 設定をスコープごとに別ファイルで管理するため、`~/.claude/mcp.json` は自動的には読み込まれません。

| スコープ | 設定ファイル | 登録コマンド |
|---------|-------------|-------------|
| ユーザー（全プロジェクト共通） | `~/.claude.json` | `claude mcp add --scope user` |
| プロジェクト（リポジトリ単位） | `<project>/.mcp.json` | `claude mcp add --scope project` |

MCP サーバーの登録には `claude mcp add` コマンドを適切な `--scope` で使用してください。詳細は [README-INSTALL.ja.md](README-INSTALL.ja.md) を参照してください。

同梱 MCP サーバー:
- **aws-documentation-mcp-server** — AWS ドキュメント検索
- **aws-knowledge-mcp-server** — AWS ナレッジベース（HTTP）
- **aws-api-mcp-server** — AWS API 操作
- **aws-iac-mcp-server** — AWS Infrastructure as Code
- **amazon-bedrock-agentcore-mcp-server** — Amazon Bedrock AgentCore
- **strands-agents-mcp-server** — Strands Agents

## インストール

セットアップ手順は [README-INSTALL.ja.md](README-INSTALL.ja.md) を参照してください。

## カスタマイズ

1. **CLAUDE.md** — プロジェクト固有の原則を追加（5KB 以下を維持）
2. **Rules** — ドメインに合わせて標準を調整
3. **Skills** — プロジェクト固有のパターンやワークフローを追加
4. **Agents** — 専門サブエージェントを作成
5. **Commands** — ワークフローショートカットを追加
6. **Hooks** — ライフサイクル自動化をカスタマイズ
7. **settings.json** — 権限・環境変数・フック設定を調整

## リンク

- [Claude Code ドキュメント](https://docs.anthropic.com/en/docs/claude-code)
- [Claude Code ベストプラクティス](https://www.anthropic.com/engineering/claude-code-best-practices)
- [エージェントチーム](https://code.claude.com/docs/en/agent-teams)
- [GitHub spec-kit](https://github.com/github/spec-kit)
