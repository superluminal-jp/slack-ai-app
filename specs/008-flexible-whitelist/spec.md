# Feature Specification: 柔軟なホワイトリスト認可

**Feature Branch**: `008-flexible-whitelist`  
**Created**: 2025-01-30  
**Status**: Draft  
**Input**: User description: "team_id、user_id、channel_id の 3 つのエンティティすべてがホワイトリストに含まれているか確認（AND 条件）について、設定されていない項目は制限をかけないように修正。何も設定していない場合は全ての team_id、user_id、channel_id からの利用を許可。channel_id のみ指定されている場合は team_id, user_id の制限を行わず、channel_id のみ制限"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - ホワイトリスト未設定時の全許可 (Priority: P1)

管理者がホワイトリストを一切設定していない場合、すべての team_id、user_id、channel_id からのリクエストが許可される。

**Why this priority**: 初期セットアップ時やテスト環境で、柔軟にアクセス制御を開始できるようにするため。最も基本的な動作であり、他の機能の前提となる。

**Independent Test**: ホワイトリストが空の状態でリクエストを送信し、すべてのリクエストが承認されることを確認できる。これにより、システムが正常に動作し、かつ制限がない場合の動作を検証できる。

**Acceptance Scenarios**:

1. **Given** ホワイトリストに team_id、user_id、channel_id が一切設定されていない状態, **When** 任意の team_id、user_id、channel_id でリクエストを送信, **Then** リクエストが承認される
2. **Given** ホワイトリストが空の状態, **When** 複数の異なる team_id、user_id、channel_id の組み合わせでリクエストを送信, **Then** すべてのリクエストが承認される

---

### User Story 2 - 部分的なホワイトリスト設定 (Priority: P1)

管理者が特定のエンティティ（例：channel_id のみ）のみをホワイトリストに設定した場合、設定されたエンティティのみがチェックされ、設定されていないエンティティ（team_id、user_id）は制限されない。

**Why this priority**: 最も一般的な使用ケース。チャンネル単位での制御を可能にしつつ、チームやユーザー全体への影響を避ける。P1 として、User Story 1 と同等に重要。

**Independent Test**: channel_id のみをホワイトリストに設定し、異なる team_id、user_id の組み合わせでリクエストを送信できる。許可された channel_id のリクエストは承認され、拒否された channel_id のリクエストは拒否されることを確認できる。

**Acceptance Scenarios**:

1. **Given** ホワイトリストに channel_id のみが設定されている状態（例：channel_id="C001"のみ）, **When** team_id="T123"、user_id="U456"、channel_id="C001"でリクエストを送信, **Then** リクエストが承認される
2. **Given** ホワイトリストに channel_id のみが設定されている状態（例：channel_id="C001"のみ）, **When** team_id="T999"、user_id="U888"、channel_id="C001"でリクエストを送信, **Then** リクエストが承認される（team_id、user_id はチェックされない）
3. **Given** ホワイトリストに channel_id のみが設定されている状態（例：channel_id="C001"のみ）, **When** 任意の team_id、user_id、channel_id="C002"でリクエストを送信, **Then** リクエストが拒否される（channel_id がホワイトリストにない）

---

### User Story 3 - 複数エンティティの組み合わせ設定 (Priority: P2)

管理者が複数のエンティティ（例：team_id と channel_id）をホワイトリストに設定した場合、設定されたエンティティのみがチェックされ、設定されていないエンティティ（user_id）は制限されない。

**Why this priority**: より細かい制御を可能にするが、User Story 2 より使用頻度は低い。P2 として、主要機能の拡張として位置づける。

**Independent Test**: team_id と channel_id をホワイトリストに設定し、異なる user_id でリクエストを送信できる。許可された team_id と channel_id の組み合わせは承認され、user_id はチェックされないことを確認できる。

**Acceptance Scenarios**:

1. **Given** ホワイトリストに team_id="T123"と channel_id="C001"が設定されている状態, **When** team_id="T123"、user_id="U456"、channel_id="C001"でリクエストを送信, **Then** リクエストが承認される
2. **Given** ホワイトリストに team_id="T123"と channel_id="C001"が設定されている状態, **When** team_id="T123"、user_id="U999"（ホワイトリストにない）、channel_id="C001"でリクエストを送信, **Then** リクエストが承認される（user_id はチェックされない）
3. **Given** ホワイトリストに team_id="T123"と channel_id="C001"が設定されている状態, **When** team_id="T999"（ホワイトリストにない）、user_id="U456"、channel_id="C001"でリクエストを送信, **Then** リクエストが拒否される（team_id がホワイトリストにない）

---

### User Story 4 - 全エンティティ設定時の従来動作維持 (Priority: P2)

管理者が team_id、user_id、channel_id のすべてをホワイトリストに設定した場合、従来通りすべてのエンティティがチェックされ、すべてがホワイトリストに含まれている場合のみ承認される。

**Why this priority**: 既存の厳格な制御を維持するための後方互換性。既存ユーザーへの影響を最小限に抑えるため重要だが、新機能ではないため P2。

**Independent Test**: 3 つのエンティティすべてをホワイトリストに設定し、すべてが一致する場合と、1 つでも不一致の場合でリクエストを送信できる。従来の AND 条件の動作が維持されることを確認できる。

**Acceptance Scenarios**:

1. **Given** ホワイトリストに team_id="T123"、user_id="U456"、channel_id="C001"がすべて設定されている状態, **When** team_id="T123"、user_id="U456"、channel_id="C001"でリクエストを送信, **Then** リクエストが承認される
2. **Given** ホワイトリストに team_id="T123"、user_id="U456"、channel_id="C001"がすべて設定されている状態, **When** team_id="T123"、user_id="U456"、channel_id="C002"（ホワイトリストにない）でリクエストを送信, **Then** リクエストが拒否される

---

### Edge Cases

- ホワイトリストの設定が部分的に変更された場合（例：channel_id のみ削除）、既存の動作がどう変わるか？
- ホワイトリストの読み込みに失敗した場合（設定ソースが利用不可）、どのように動作するか？
- リクエストに team_id、user_id、channel_id の一部が欠落している場合、設定されていないエンティティのチェックはどうなるか？
- ホワイトリストに空の文字列や無効な値が設定されている場合、どのように扱われるか？

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: システムは、ホワイトリストに設定されていないエンティティ（team_id、user_id、channel_id）に対して制限をかけないこと
- **FR-002**: システムは、ホワイトリストが完全に空（すべてのエンティティが未設定）の場合、すべての team_id、user_id、channel_id からのリクエストを許可すること
- **FR-003**: システムは、特定のエンティティのみがホワイトリストに設定されている場合、設定されたエンティティのみをチェックし、設定されていないエンティティは無視すること
- **FR-004**: システムは、複数のエンティティがホワイトリストに設定されている場合、設定されたすべてのエンティティがホワイトリストに含まれている場合のみリクエストを承認すること（設定されたエンティティ間の AND 条件）
- **FR-005**: システムは、ホワイトリストの設定が変更された場合、キャッシュの有効期限（5 分）内であれば既存の設定を使用し、期限切れ後は新しい設定を読み込むこと
- **FR-006**: システムは、ホワイトリストの読み込みに失敗した場合、fail-closed（すべてのリクエストを拒否）の動作を維持すること
- **FR-007**: システムは、リクエストに含まれるエンティティがホワイトリストに設定されていない場合、そのエンティティのチェックをスキップすること

### Key Entities _(include if feature involves data)_

- **Whitelist Configuration**: ホワイトリストの設定を表す。team_ids、user_ids、channel_ids の 3 つのセットを含む。各セットは空（未設定）または 1 つ以上のエンティティ ID を含むことができる
- **Authorization Request**: 認可チェックの対象となるリクエスト。team_id、user_id、channel_id を含む。各エンティティはオプショナル（欠落している可能性がある）
- **Authorization Result**: 認可チェックの結果。承認/拒否の状態、チェックされたエンティティ、拒否されたエンティティのリストを含む

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: ホワイトリストが空の状態で、100%のリクエストが承認される
- **SC-002**: 部分的なホワイトリスト設定（例：channel_id のみ）で、設定されたエンティティのチェックが 100%正確に実行され、設定されていないエンティティが無視される
- **SC-003**: 既存の全エンティティ設定時の動作が 100%後方互換性を維持する（既存のテストケースがすべて通過する）
- **SC-004**: ホワイトリストの読み込み失敗時、100%のリクエストが拒否される（fail-closed 動作の維持）
- **SC-005**: 認可チェックのレイテンシが既存の実装と同等またはそれ以下を維持する（パフォーマンスの劣化なし）
