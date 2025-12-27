# Feature Specification: Cross-Account Zones Architecture

**Feature Branch**: `010-cross-account-zones`  
**Created**: 2025-12-27  
**Status**: Draft  
**Input**: User description: "Verification Zone (検証層) と Execution Zone (実行層) はクロスアカウントのやり取りになることを想定して設計を見直し。少なくともスタックを分離。リソースは完全に独立に。アカウント間通信を念頭にした通信設定に。"

## 概要

本仕様は、Slack AI アプリケーションのアーキテクチャを再設計し、Verification Zone（検証層）と Execution Zone（実行層）を異なる AWS アカウントにデプロイ可能にすることを定義します。これにより、セキュリティ境界の強化、責任の分離、および柔軟なデプロイメントオプションを実現します。

### 運用コンテキスト

**現状**: 利用可能な AWS アカウントは 1 つのみ  
**アプローチ**: クロスアカウント対応のアーキテクチャを設計・実装し、単一アカウント内で動作検証を行う

この段階的アプローチにより：

- クロスアカウント通信パターン（IAM 認証、リソースポリシー）を単一アカウント内でも検証可能
- 将来的に 2 アカウント構成への移行がスムーズ
- スタック分離の利点（独立ライフサイクル管理）は単一アカウントでも即座に享受可能

## User Scenarios & Testing _(mandatory)_

### User Story 1 - 同一アカウント内でのゾーン分離デプロイ (Priority: P1)

インフラ管理者として、同一アカウント内で Verification Zone と Execution Zone を別々のスタックとしてデプロイし、クロスアカウント対応のアーキテクチャを検証できます。

**Why this priority**: 現状は 1 アカウントのみ利用可能なため、まず同一アカウント内でクロスアカウント対応アーキテクチャの動作検証を行う必要があります。スタック分離とクロスアカウント通信パターンの両方を検証できます。

**Independent Test**: 同一アカウントに 2 つの独立したスタックをデプロイし、クロスアカウント対応の IAM 認証パターンで通信が成功することを確認します。

**Acceptance Scenarios**:

1. **Given** 同一アカウントの設定がある, **When** Verification Stack と Execution Stack を順番にデプロイする, **Then** 両スタックが独立して存在し、個別に管理できる

2. **Given** 両スタックが同一アカウントにデプロイされている, **When** Slack からリクエストが送信される, **Then** Verification Zone で検証が行われ、Execution Zone で AI 処理が実行され、ユーザーに正常な応答が返される

3. **Given** 両スタックが同一アカウントにデプロイされている, **When** Execution Stack のみを更新する, **Then** Verification Stack に影響なく更新が完了する

---

### User Story 2 - 異なるアカウントへのゾーン分離デプロイ (Priority: P3 - 将来対応)

インフラ管理者として、Verification Zone を Account A に、Execution Zone を Account B にデプロイし、組織のセキュリティポリシーに準拠した形でシステムを運用できます。

**Why this priority**: 現時点では利用可能なアカウントが 1 つのため、将来的な対応として優先度を下げます。ただし、アーキテクチャは P1 でクロスアカウント対応として設計されるため、追加実装なしで対応可能です。

**Independent Test**: Account A と Account B の両方に独立してスタックをデプロイし、Slack からのリクエストが正常に処理されることを確認することで完全にテストできます。

**Acceptance Scenarios**:

1. **Given** CDK プロジェクトにクロスアカウント対応のスタック構成があり、Account A と Account B の認証情報が設定されている, **When** Verification Stack を Account A に、Execution Stack を Account B にデプロイする, **Then** 両スタックが正常にデプロイされ、それぞれのリソースが独立して存在する

2. **Given** 両スタックが異なるアカウントにデプロイされている, **When** Slack からリクエストが送信される, **Then** Verification Zone で検証が行われ、Execution Zone で AI 処理が実行され、ユーザーに正常な応答が返される

---

### User Story 3 - クロスアカウント対応の通信パターン検証 (Priority: P1)

セキュリティ管理者として、クロスアカウント対応の IAM 認証パターンが正しく機能し、不正アクセスが拒否されることを単一アカウント内で確認できます。

**Why this priority**: セキュリティはシステムの根幹であり、クロスアカウント通信の認証・認可パターンは単一アカウントでも検証可能です。

**Independent Test**: 単一アカウント内で API Gateway のリソースポリシーと IAM 認証が機能し、正規の Verification Lambda からのアクセスのみが許可されることを確認します。

**Acceptance Scenarios**:

1. **Given** 同一アカウントに両スタックがデプロイされている, **When** SlackEventHandler Lambda が Execution API を呼び出す, **Then** IAM 認証（SigV4 署名）により正常に API Gateway にアクセスできる

2. **Given** Execution API がデプロイされている, **When** 許可されていない IAM ロールから API Gateway にアクセスを試みる, **Then** リソースポリシーによりアクセスが拒否される

3. **Given** 同一アカウントでクロスアカウント対応パターンが検証済み, **When** 将来的に別アカウントに Execution Stack を移動する, **Then** 設定変更のみで通信が確立できる

---

### User Story 4 - 独立したリソースライフサイクル管理 (Priority: P2)

インフラ管理者として、Verification Zone と Execution Zone のリソースを独立して管理し、一方のゾーンの変更がもう一方に影響しないようにできます。

**Why this priority**: 運用の柔軟性と障害の分離のために、独立したライフサイクル管理は重要です。単一アカウントでも即座にこの利点を享受できます。

**Independent Test**: 一方のスタックを更新・削除しても、もう一方のスタックのリソースが影響を受けないことを確認します。

**Acceptance Scenarios**:

1. **Given** 両スタックがデプロイされている, **When** Execution Stack を削除する, **Then** Verification Stack のリソースは影響を受けずに残る

2. **Given** 両スタックがデプロイされている, **When** Verification Stack の Lambda を更新する, **Then** Execution Stack に変更は発生しない

3. **Given** Verification Stack が単独でデプロイされている, **When** Execution Stack なしで単独運用を試みる, **Then** 適切なエラーメッセージと設定不備の診断情報が表示される

---

### Edge Cases

- **Account B に接続できない場合**: Verification Zone はタイムアウトを適切に処理し、ユーザーに「サービス一時停止中」のメッセージを返す
- **クロスアカウント IAM 権限が不正確な場合**: 明確なエラーメッセージと診断情報がログに記録される
- **一方のスタックのみデプロイされている場合**: システムは適切にエラーを報告し、不完全な構成であることを通知する
- **API Gateway の URL が変更された場合**: Verification Zone の環境変数更新により対応可能であり、再デプロイで解決できる

## Requirements _(mandatory)_

### Functional Requirements

#### スタック分離

- **FR-001**: システムは Verification Zone のリソースを独立したスタック（Verification Stack）としてデプロイできなければならない
- **FR-002**: システムは Execution Zone のリソースを独立したスタック（Execution Stack）としてデプロイできなければならない
- **FR-003**: 各スタックは CloudFormation のクロススタック参照なしで、独立してデプロイ・更新・削除できなければならない

#### リソース独立性

- **FR-004**: Verification Stack には以下のリソースを含めなければならない:

  - SlackEventHandler Lambda と Function URL
  - DynamoDB テーブル（token storage, event dedupe, existence check cache, whitelist config, rate limit）
  - Secrets Manager シークレット（Slack Signing Secret, Slack Bot Token）
  - 関連する CloudWatch アラーム

- **FR-005**: Execution Stack には以下のリソースを含めなければならない:

  - BedrockProcessor Lambda
  - API Gateway（ExecutionApi）
  - 関連する IAM ロール
  - 関連する CloudWatch アラーム

- **FR-006**: 各スタックのリソースは、もう一方のスタックの存在に依存せずに作成できなければならない（ただし、通信設定には相手先の情報が必要）

#### クロスアカウント通信

- **FR-007**: Execution Stack の API Gateway は、Verification Stack の Lambda ロール ARN を指定したリソースポリシーを設定できなければならない
- **FR-008**: Verification Stack の Lambda は、クロスアカウントで API Gateway を呼び出すための IAM ポリシーを持たなければならない
- **FR-009**: クロスアカウント通信は AWS SigV4 署名により認証されなければならない
- **FR-010**: API Gateway のリソースポリシーは、特定のアカウント ID と Lambda ロール ARN のみからのアクセスを許可しなければならない

#### 設定管理

- **FR-011**: Verification Stack は Execution API の URL を環境変数として設定できなければならない
- **FR-012**: Execution Stack は Verification Lambda のロール ARN を設定として受け取り、リソースポリシーに適用できなければならない
- **FR-013**: 両スタックは同一リージョンへのデプロイをサポートしなければならない

#### デプロイメント

- **FR-014**: システムは同一アカウント内での 2 スタック構成をサポートしなければならない
- **FR-015**: システムは異なるアカウントへの各スタックのデプロイをサポートしなければならない
- **FR-016**: デプロイ順序は Execution Stack → Verification Stack の順で行われることを前提としなければならない（Execution API URL が必要なため）

### Key Entities

- **Verification Stack**: 検証層のすべてのリソースを含む独立した CloudFormation スタック。Slack からのリクエスト受信、署名検証、認可チェックを担当
- **Execution Stack**: 実行層のすべてのリソースを含む独立した CloudFormation スタック。AI 処理と Slack への応答投稿を担当
- **Cross-Account Trust**: Account A の Verification Lambda が Account B の Execution API を呼び出すための信頼関係

### Assumptions

- **検証環境**: 現時点では 1 アカウントのみ利用可能なため、単一アカウント内でクロスアカウント対応アーキテクチャを検証する
- **クロスアカウント対応**: アーキテクチャはクロスアカウント対応として設計し、将来的に 2 アカウント構成への移行がスムーズに行えるようにする
- **リージョン**: 両スタックは同一 AWS リージョンにデプロイする（リージョン間通信は対象外）
- **デプロイ順序**: Execution Stack を先にデプロイし、API URL を取得してから Verification Stack をデプロイする運用フローを想定
- **CDK バージョン**: 既存プロジェクトと同一（2.x）を維持

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 管理者は 30 分以内に、同一アカウント内に 2 つの独立したスタックをデプロイ完了できる
- **SC-002**: スタック分離構成でも、Slack リクエストから AI 応答までの処理時間は既存の単一スタック構成と同等（30 秒以内）を維持する
- **SC-003**: 不正な IAM ロールからの API Gateway へのアクセス試行は 100% 拒否される（リソースポリシーによる）
- **SC-004**: 一方のスタックの更新・削除が、もう一方のスタックのリソースに影響を与えない
- **SC-005**: 既存の単一スタック構成から新しい分離スタック構成への移行が、ドキュメントに従って 1 時間以内に完了できる
- **SC-006**: 単一アカウントから 2 アカウント構成への移行が、設定変更のみで対応可能である（コード変更不要）
