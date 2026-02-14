# 導入手順

このリポジトリの設定を `~/.claude` に展開する手順です。

Agent teams（実験機能）は `settings.json`（`env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`）で有効化されています。同期後そのまま利用できます。

> **English version**: [README-INSTALL.md](README-INSTALL.md)

## 前提

- Claude Code が利用可能な環境
- `git` がインストール済み

## 1. リポジトリをクローン

```bash
git clone git@github.com:superluminal-jp/my-claude-code.git
cd my-claude-code
```

## 2. ~/.claude への同期

### 新規セットアップ（既存の ~/.claude がない場合）

リポジトリの内容をそのままコピーします。

```bash
mkdir -p ~/.claude
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' ./ ~/.claude/
```

### マージ（既存の ~/.claude に重ねる）

リポジトリに存在するファイルのみ上書きします。`~/.claude` 固有のファイル（独自の rules、skills など）はそのまま残ります。

```bash
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' ./ ~/.claude/
```

- `~/.claude/settings.local.json` などローカル専用の設定はリポジトリに含まれていないため、そのまま残ります。
- 同名ファイルはリポジトリ側で上書きされます。必要なら事前にバックアップを取ってください。

### 完全同期（リポジトリと完全に揃える）

`~/.claude` をリポジトリの内容で完全に置き換えます。リポジトリにないファイルは削除されます。

```bash
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' --delete ./ ~/.claude/
```

- `--delete` により、リポジトリに存在しないファイル・ディレクトリは `~/.claude` から削除されます。
- **事前にバックアップを取ることを強く推奨**します（例: `cp -a ~/.claude ~/.claude.bak`）。`settings.local.json` などローカル専用の設定も消えるため、必要なものは別途退避してください。

> **重要**: `settings.json` のフックは全て `$HOME/.claude/hooks/` を参照しています。rsync による同期が完了していないと、フックが動作しません。

## 3. MCP サーバー

リポジトリに `mcp.json` を**参考用**として同梱していますが、rsync だけでは MCP サーバーは有効になりません。Claude Code は MCP 設定をスコープごとに別ファイルで管理するため、`~/.claude/mcp.json` は認識されません。

| スコープ | 設定ファイル | 用途 |
|---------|-------------|------|
| ユーザー (`--scope user`) | `~/.claude.json` | このマシンの全プロジェクトで利用可能 |
| プロジェクト (`--scope project`) | `<project>/.mcp.json` | 特定プロジェクトでのみ利用可能（リポジトリにコミット可） |

### ユーザースコープ（個人セットアップ推奨）

`claude mcp add --scope user` コマンドで個別に登録してください。`mcp.json` の内容を参考に、以下のように実行します。

```bash
# AWS Documentation
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env AWS_DOCUMENTATION_PARTITION=aws \
  aws-documentation-mcp-server -- uvx awslabs.aws-documentation-mcp-server@latest

# AWS Knowledge (HTTP)
claude mcp add --transport http --scope user \
  aws-knowledge-mcp-server https://knowledge-mcp.global.api.aws

# AWS API
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env "AWS_REGION=${AWS_REGION:-ap-northeast-1}" \
  --env "AWS_API_MCP_WORKING_DIR=${HOME}/.aws/mcp/workdir" \
  --env AWS_API_MCP_ALLOW_UNRESTRICTED_LOCAL_FILE_ACCESS=workdir \
  --env "AWS_API_MCP_PROFILE_NAME=${AWS_PROFILE:-default}" \
  --env READ_OPERATIONS_ONLY=false \
  --env REQUIRE_MUTATION_CONSENT=true \
  --env AWS_API_MCP_TELEMETRY=true \
  --env EXPERIMENTAL_AGENT_SCRIPTS=false \
  aws-api-mcp-server -- uvx awslabs.aws-api-mcp-server@latest

# AWS IaC
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env "AWS_PROFILE=${AWS_PROFILE:-default}" \
  --env "AWS_REGION=${AWS_REGION:-ap-northeast-1}" \
  aws-iac-mcp-server -- uvx awslabs.aws-iac-mcp-server@latest

# Amazon Bedrock AgentCore
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  amazon-bedrock-agentcore-mcp-server -- uvx awslabs.amazon-bedrock-agentcore-mcp-server@latest

# Strands Agents
claude mcp add --transport stdio --scope user \
  --env FASTMCP_LOG_LEVEL=ERROR \
  strands-agents-mcp-server -- uvx strands-agents-mcp-server
```

### プロジェクトスコープ（リポジトリ単位）

特定のプロジェクトでのみ MCP サーバーを有効にするには、プロジェクトルートから `--scope project` を使用します。プロジェクトディレクトリに `.mcp.json` が作成・更新されます。

```bash
cd /path/to/your-project

# 例: AWS Documentation をこのプロジェクトだけに追加
claude mcp add --transport stdio --scope project \
  --env FASTMCP_LOG_LEVEL=ERROR \
  --env AWS_DOCUMENTATION_PARTITION=aws \
  aws-documentation-mcp-server -- uvx awslabs.aws-documentation-mcp-server@latest
```

- `.mcp.json` はプロジェクトルートに作成され、バージョン管理にコミットできます。
- リポジトリをクローンしたチームメンバーも同じ MCP 設定が自動的に適用されます。
- プロジェクトスコープのサーバーは、そのプロジェクトディレクトリで Claude Code を実行したときのみ有効です。

### 確認

登録後、`claude mcp list` または Claude Code 内で `/mcp` を実行して確認できます。

## 4. プラグイン

このリポジトリには `plugins/` を含めていません。必要なプラグインは Claude Code のプラグイン機能から再インストールしてください。

## 5. ローカル設定

環境ごとの上書き（許可リストやツール設定など）は `~/.claude/settings.local.json` に記載できます。このファイルはリポジトリに含めていないため、各環境で自由に編集してかまいません。

## 6. 運用

設定を更新したらこのリポジトリに push し、pull のあと再同期します。

```bash
cd my-claude-code
git pull
rsync -av --exclude='.git' --exclude='.DS_Store' --exclude='Thumbs.db' --exclude='Desktop.ini' --exclude='._*' ./ ~/.claude/
```
