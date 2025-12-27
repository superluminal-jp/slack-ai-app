# Security Policy

[English](#security-policy) | [日本語](#セキュリティポリシー)

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow the responsible disclosure process outlined below.

### How to Report

1. **DO NOT** create a public GitHub issue for security vulnerabilities
2. Send a detailed report to the project maintainers via private channel
3. Include the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Investigation**: Initial assessment within 7 business days
- **Resolution**: We aim to resolve critical issues within 30 days
- **Disclosure**: Coordinated disclosure after fix is deployed

### Scope

The following are in scope for security reports:

- Slack signature verification bypass
- Authentication/authorization issues
- Prompt injection vulnerabilities
- PII exposure or data leakage
- AWS resource misconfiguration
- Secrets exposure

### Out of Scope

- Issues already disclosed in public issues
- Theoretical vulnerabilities without proof of concept
- Social engineering attacks
- Physical security issues

## Security Architecture

For details on our security implementation, see:

- [Security Requirements](docs/reference/security/requirements.md)
- [Threat Model](docs/reference/security/threat-model.md)
- [Security Implementation](docs/reference/security/implementation.md)

## Security Best Practices

When deploying this application:

1. **Use AWS Secrets Manager** for all credentials
2. **Enable CloudTrail** for audit logging
3. **Configure VPC** for Lambda functions
4. **Review IAM policies** for least privilege
5. **Enable encryption** for all data at rest
6. **Monitor CloudWatch alarms** for security events

---

# セキュリティポリシー

## サポートされているバージョン

| バージョン | サポート状況  |
| ---------- | ------------- |
| 1.0.x      | ✅ サポート中 |

## 脆弱性の報告

セキュリティの脆弱性を真摯に受け止めています。セキュリティの問題を発見した場合は、以下の責任ある開示プロセスに従ってください。

### 報告方法

1. セキュリティの脆弱性については、公開 GitHub Issue を**作成しないでください**
2. プロジェクトメンテナーにプライベートチャネル経由で詳細なレポートを送信してください
3. 以下の情報を含めてください：
   - 脆弱性の説明
   - 再現手順
   - 潜在的な影響
   - 修正案（ある場合）

### 期待されること

- **確認**: 48 時間以内に受領確認
- **調査**: 7 営業日以内に初期評価
- **解決**: 重大な問題は 30 日以内の解決を目指す
- **開示**: 修正がデプロイされた後に調整された開示

### 対象範囲

セキュリティレポートの対象：

- Slack 署名検証のバイパス
- 認証・認可の問題
- プロンプトインジェクションの脆弱性
- PII の漏洩またはデータ漏洩
- AWS リソースの設定ミス
- シークレットの露出

### 対象外

- 公開 Issue ですでに開示されている問題
- 概念実証のない理論上の脆弱性
- ソーシャルエンジニアリング攻撃
- 物理的セキュリティの問題

## セキュリティアーキテクチャ

セキュリティ実装の詳細については、以下を参照してください：

- [セキュリティ要件](docs/reference/security/requirements.md)
- [脅威モデル](docs/reference/security/threat-model.md)
- [セキュリティ実装](docs/reference/security/implementation.md)

## セキュリティのベストプラクティス

このアプリケーションをデプロイする際：

1. すべての認証情報に **AWS Secrets Manager** を使用する
2. 監査ログのために **CloudTrail** を有効にする
3. Lambda 関数用に **VPC** を設定する
4. 最小権限のために **IAM ポリシー** を確認する
5. すべての保存データに **暗号化** を有効にする
6. セキュリティイベントのために **CloudWatch アラーム** を監視する
