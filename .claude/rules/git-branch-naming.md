# Git ブランチ命名規則

**目的**: プロジェクト全体で一貫性のあるブランチ名を維持し、ワークフローの可読性と自動化を向上させる。

**適用タイミング**: ブランチ作成時、PR レビュー時、CI/CD パイプライン設定時。

---

## 基本原則

**ブランチ名を見るだけで、変更の種類・対象・目的が即座に分かること。**

優れたブランチ名は、`git log --oneline` や PR 一覧を見たチームメンバーが、コードを一行も読まずに変更の意図を把握できるものである。

---

## 命名フォーマット

### 基本構造

```
<prefix>/<description>
<prefix>/<ticket-id>/<description>
```

### フォーマットルール

| ルール | 説明 | 例 |
|--------|------|-----|
| 小文字のみ | 大文字は使用不可 | `feature/add-login` ✅ / `Feature/Add-Login` ❌ |
| ケバブケース | 単語をハイフンで区切る | `fix/null-pointer-error` ✅ / `fix/null_pointer_error` ❌ |
| 使用可能文字 | `a-z`, `0-9`, `-`, `/` のみ | `feature/user-auth-v2` ✅ / `feature/user_auth@v2` ❌ |
| 最大長 | 50文字以内推奨（プレフィックス含む） | `feature/PROJ-123/add-oauth-login` (33文字) ✅ |
| 末尾スラッシュ禁止 | `/` で終わらない | `feature/login` ✅ / `feature/login/` ❌ |
| 連続ハイフン禁止 | `--` を含まない | `fix/auth-error` ✅ / `fix/auth--error` ❌ |
| 先頭ハイフン禁止 | 説明部分が `-` で始まらない | `feature/add-cache` ✅ / `feature/-add-cache` ❌ |

### バリデーション正規表現

```regex
^(feature|fix|bugfix|hotfix|release|chore|docs|refactor|test|ci|perf|style|claude)\/([A-Z]+-[0-9]+\/)?[a-z0-9]+(-[a-z0-9]+)*$
```

---

## ブランチタイプ（プレフィックス）

### 機能開発・修正

| プレフィックス | 用途 | 例 |
|---------------|------|-----|
| `feature/` | 新機能の追加 | `feature/user-authentication` |
| `fix/` | バグ修正（通常） | `fix/PROJ-456/null-pointer-in-parser` |
| `bugfix/` | `fix/` の別名（チーム規約に従う） | `bugfix/login-redirect-loop` |
| `hotfix/` | 本番環境の緊急修正 | `hotfix/critical-payment-failure` |

### 保守・品質改善

| プレフィックス | 用途 | 例 |
|---------------|------|-----|
| `refactor/` | コードリファクタリング（動作変更なし） | `refactor/extract-auth-service` |
| `perf/` | パフォーマンス改善 | `perf/optimize-database-queries` |
| `style/` | コードスタイル変更（ロジック変更なし） | `style/apply-prettier-formatting` |
| `test/` | テストの追加・修正 | `test/add-integration-tests-for-api` |

### インフラ・ドキュメント

| プレフィックス | 用途 | 例 |
|---------------|------|-----|
| `docs/` | ドキュメントの追加・更新 | `docs/update-api-reference` |
| `ci/` | CI/CD パイプラインの変更 | `ci/add-github-actions-workflow` |
| `chore/` | 保守タスク（依存関係更新等） | `chore/upgrade-typescript-to-v5` |
| `release/` | リリース準備 | `release/v2.1.0` |

### AI 生成（このプロジェクト固有）

| プレフィックス | 用途 | 例 |
|---------------|------|-----|
| `claude/` | Claude Code が自動生成するブランチ | `claude/add-branch-naming-rule-abc12` |

> **補足**: `claude/` プレフィックスはセッション固有のハッシュ付きで自動生成される。手動でのブランチ作成では上記の標準プレフィックスを使用すること。

---

## ブランチ名の具体例

### チケット番号なし（個人プロジェクト・小規模チーム）

```
feature/user-auth                    # 新機能: ユーザー認証
fix/null-pointer-exception           # バグ修正: NullPointer 例外
hotfix/critical-payment-error        # 緊急修正: 決済エラー
docs/update-installation-guide       # ドキュメント: インストールガイド更新
refactor/simplify-data-pipeline      # リファクタリング: データパイプライン簡素化
release/v2.1.0                       # リリース: v2.1.0
```

### チケット番号あり（チーム開発・Issue 管理）

```
feature/PROJ-123/add-login-page      # 機能: ログインページ追加
fix/PROJ-456/null-pointer-exception  # 修正: NullPointer 例外
fix/GH-89/sidebar-overflow           # 修正: GitHub Issue #89
feature/JIRA-1024/oauth-integration  # 機能: OAuth 統合
```

### Claude Code 自動生成

```
claude/add-branch-naming-rule-abc12  # Claude セッションで生成
claude/automate-docs-with-hooks-B8wrx # 自動ドキュメント Hook 追加
```

---

## ワークフローとの統合

### GitHub Flow（推奨）

```
main (保護ブランチ)
├── feature/add-user-auth       ← 短命ブランチ（数日〜1週間）
├── fix/PROJ-456/login-error    ← 短命ブランチ
└── docs/update-readme          ← 短命ブランチ

ルール:
1. main から分岐
2. 作業完了後、PR を作成
3. レビュー・マージ後、ブランチを削除
```

### Git Flow（大規模プロジェクト）

```
main (本番)
├── develop (開発統合)
│   ├── feature/user-auth       ← develop から分岐、develop にマージ
│   ├── feature/billing-system  ← develop から分岐、develop にマージ
│   └── release/v2.1.0          ← develop から分岐、main にマージ
└── hotfix/critical-fix         ← main から分岐、main と develop にマージ
```

### ブランチの寿命

| タイプ | 寿命 | マージ先 | マージ後 |
|--------|------|----------|----------|
| `feature/` | 短命（1日〜2週間） | main / develop | 削除 |
| `fix/` | 短命（数時間〜数日） | main / develop | 削除 |
| `hotfix/` | 超短命（数時間） | main + develop | 削除 |
| `release/` | 短命（数日） | main + develop | タグ付け後削除 |
| `docs/`, `chore/`, `ci/` | 短命（1日〜数日） | main / develop | 削除 |
| `claude/` | 短命（セッション単位） | main / develop | 削除 |

### このプロジェクトでの保護ブランチ

`settings.json` で以下のブランチが保護されている:

```json
"branch_protection": {
    "enabled": true,
    "protected_branches": ["main", "master", "production"]
}
```

`advanced-pre-tool-use.sh` フックにより、`main` / `master` ブランチ上では Edit / Write / Delete 操作がブロックされる。必ず命名規則に従ったブランチを作成してから作業を開始すること。

---

## 判断フロー

```
ブランチを作成する必要がある？
│
├─ 新しい機能やユーザー向け変更？
│  └─ YES → feature/<description>
│
├─ バグ修正？
│  ├─ 本番環境で緊急対応が必要？
│  │  └─ YES → hotfix/<description>
│  └─ 通常の修正？
│     └─ YES → fix/<ticket>/<description>
│
├─ コード品質の改善？
│  ├─ 構造やアーキテクチャの変更？
│  │  └─ YES → refactor/<description>
│  ├─ パフォーマンス改善？
│  │  └─ YES → perf/<description>
│  └─ フォーマット・スタイルのみ？
│     └─ YES → style/<description>
│
├─ テストの追加・修正？
│  └─ YES → test/<description>
│
├─ ドキュメント変更？
│  └─ YES → docs/<description>
│
├─ CI/CD パイプラインの変更？
│  └─ YES → ci/<description>
│
├─ 依存関係更新・保守作業？
│  └─ YES → chore/<description>
│
├─ リリース準備？
│  └─ YES → release/v<semver>
│
└─ Claude Code による自動生成？
   └─ YES → claude/<description>-<hash>
```

---

## アンチパターン

### ❌ 曖昧な名前

```
❌ 悪い例:
fix/bug                    # どのバグか不明
feature/update             # 何の更新か不明
feature/changes            # 変更内容が分からない
fix/fix-issue              # 冗長かつ曖昧

✅ 良い例:
fix/PROJ-456/null-pointer-in-user-service
feature/add-two-factor-authentication
feature/PROJ-789/implement-search-api
fix/resolve-login-redirect-loop
```

### ❌ 個人名の使用

```
❌ 悪い例:
tanaka/feature             # 個人名はブランチ名に不要
john-fix                   # git blame で十分

✅ 良い例:
feature/add-payment-gateway
fix/PROJ-123/timeout-error
```

### ❌ 過度に長い名前

```
❌ 悪い例:
feature/add-new-user-authentication-system-with-oauth2-and-jwt-token-refresh
(73文字 — 読みづらく、ターミナルで切れる)

✅ 良い例:
feature/PROJ-123/oauth2-jwt-auth
(32文字 — 簡潔で意味が明確)
```

### ❌ 規約の混在

```
❌ 悪い例（同一プロジェクト内）:
feature/addLogin           # camelCase
Feature/Add-Login          # PascalCase
feature_add_login          # snake_case
feature/add-login          # kebab-case

✅ 良い例（統一）:
feature/add-login          # kebab-case で統一
feature/add-dashboard
feature/add-notifications
```

### ❌ プレフィックスなし

```
❌ 悪い例:
add-login-page             # タイプが分からない
fix-bug-123                # 正式なプレフィックスがない

✅ 良い例:
feature/add-login-page
fix/PROJ-123/session-timeout
```

### ❌ 特殊文字の使用

```
❌ 悪い例:
feature/add_login@v2       # アンダースコアと @ を含む
fix/bug#123                # # を含む
feature/add login          # スペースを含む

✅ 良い例:
feature/add-login-v2
fix/bug-123
feature/add-login
```

---

## ベストプラクティス

### ✅ 説明的かつ簡潔に

```
目標: ブランチ名だけで変更内容が推測できること

feature/add-user-auth        ✅ 推測可能: ユーザー認証の追加
feature/update               ❌ 推測不能: 何の更新？
```

### ✅ チケット番号を含める（チーム開発時）

```
feature/PROJ-123/add-login   ✅ Issue トラッカーと紐づけ可能
feature/add-login            ⚠️ 個人プロジェクトなら許容
```

### ✅ マージ後はブランチを削除

```bash
# PR マージ後
git branch -d feature/PROJ-123/add-login              # ローカル削除
git push origin --delete feature/PROJ-123/add-login    # リモート削除
```

### ✅ Conventional Commits との対応

ブランチプレフィックスとコミットメッセージのタイプを対応させる:

| ブランチプレフィックス | コミットプレフィックス |
|----------------------|----------------------|
| `feature/` | `feat:` |
| `fix/` / `bugfix/` | `fix:` |
| `hotfix/` | `fix:` |
| `docs/` | `docs:` |
| `refactor/` | `refactor:` |
| `test/` | `test:` |
| `ci/` | `ci:` |
| `chore/` | `chore:` |
| `perf/` | `perf:` |
| `style/` | `style:` |

---

## チェックリスト

**ブランチ作成前**:

```
[ ] 適切なプレフィックスを選択した
[ ] 小文字とハイフンのみ使用している
[ ] 50文字以内である
[ ] 変更内容が名前から推測できる
[ ] チケット番号を含めている（該当する場合）
[ ] 保護ブランチ（main/master/production）から直接作業していない
```

**ブランチマージ後**:

```
[ ] ローカルブランチを削除した
[ ] リモートブランチを削除した
[ ] 関連 Issue をクローズした
```

---

## 自動化との連携

### Claude Code フック連携

`settings.json` の `branch_protection` と `advanced-pre-tool-use.sh` は、保護ブランチ上での直接編集をブロックする。ブランチ作成時は本規則に従うこと。

```bash
# ✅ 正しいワークフロー
git checkout -b feature/add-new-rule
# → 編集・コミット・PR 作成

# ❌ ブロックされるワークフロー
git checkout main
# → Edit/Write 操作は advanced-pre-tool-use.sh によりブロック
```

### CI/CD でのブランチ名検証（推奨）

```bash
#!/bin/bash
# .git/hooks/pre-push または CI ジョブで使用
BRANCH=$(git rev-parse --abbrev-ref HEAD)
PATTERN="^(feature|fix|bugfix|hotfix|release|chore|docs|refactor|test|ci|perf|style|claude)\/"

if [[ ! "$BRANCH" =~ $PATTERN ]] && [[ "$BRANCH" != "main" ]] && [[ "$BRANCH" != "develop" ]]; then
    echo "❌ ブランチ名が命名規則に違反しています: $BRANCH"
    echo "   正しい形式: <prefix>/<description> または <prefix>/<TICKET-ID>/<description>"
    exit 1
fi
```

---

## まとめ

**基本原則**: ブランチ名は変更の種類・対象・目的を即座に伝える。

**フォーマット**: `<prefix>/<description>` — 小文字、ケバブケース、50文字以内。

**プレフィックス選択**: 判断フローに従い、適切なタイプを選ぶ。

**チーム開発**: チケット番号を含め、マージ後にブランチを削除する。

**このプロジェクト**: `claude/` プレフィックスは AI 生成ブランチ用。保護ブランチでは直接作業しない。

---

**最終更新**: 2026-02-10
