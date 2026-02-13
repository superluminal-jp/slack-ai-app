# Documentation Standards

This document defines best practices for all project documentation. It ensures consistency, accuracy, and maintainability across READMEs, guides, reference docs, and API documentation.

**Audience**: Contributors, maintainers, and anyone writing or updating documentation.  
**Last updated**: 2026-02-13

---

## 1. When to Update Documentation

| Change type | Update |
| ----------- | ------ |
| New feature | README (features), CHANGELOG (Added), API/module docs |
| Dependency or version change | README (prerequisites), CHANGELOG (Changed) |
| Bug fix | CHANGELOG (Fixed), API docs if behavior changed |
| Setup or deployment change | README (installation), quickstart, CDK README |
| Architecture or design decision | Architecture docs, ADRs, design-principles |
| Release | CHANGELOG: move [Unreleased] entries to [Version] with date |

**Rule**: Update documentation in the same change as the code. Do not leave docs outdated.

---

## 2. Document Structure

- **Inverted pyramid**: State the most important information first; details and edge cases follow.
- **One paragraph, one idea**: Each paragraph addresses a single concept. Keep paragraphs under five sentences.
- **Clear headings**: Use consistent H1/H2/H3 hierarchy for scannability.
- **Lists for parallel items**: Use bulleted or numbered lists instead of long prose where appropriate.
- **Code blocks**: Use fenced code blocks with language tags for examples and commands.
- **Tables**: Use tables for parameters, options, environment variables, or comparison of alternatives.

---

## 3. Writing Style

- **Plain, active language**: Prefer "The function validates the input" over "The input is validated by the function."
- **Present tense**: Describe current behavior in present tense.
- **Consistent terminology**: Use the same terms for the same concepts across all docs.
- **Precise wording**: Specify units, ranges, and constraints (e.g., "up to 5 files, 10 MB per image") instead of "several" or "large."
- **No secrets or PII**: Never document or log secrets, tokens, or personally identifiable information.

---

## 4. CHANGELOG Format

Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

- **Categories**: Added, Changed, Deprecated, Removed, Fixed, Security.
- **Format**: `## [Unreleased]` for unreleased changes; `## [1.2.0] - YYYY-MM-DD` for releases.
- **Entries**: Short, user-facing descriptions. Link to specs or issues where helpful.

---

## 5. Module and Package Documentation

Every module or package (e.g., agent READMEs, CDK constructs) should include:

| Section | Content |
| ------- | ------- |
| **Purpose** | What the module does and why it exists (1–2 sentences). |
| **Scope / Non-Scope** | What is in scope and what is delegated elsewhere. |
| **Usage** | How to run, configure, or integrate (with examples). |
| **Dependencies** | External and internal dependencies, with version pins where relevant. |
| **Configuration** | Environment variables, config files, and required permissions. |
| **Testing** | How to run tests and what they cover. |
| **Limitations** | Known limitations, security considerations, or future work. |

Optionally: Architecture diagram, API summary, or links to ADRs/specs.

---

## 6. API and Code Documentation

- **Docstrings / JSDoc**: Document purpose, parameters (with types and constraints), return values, and exceptions. Prefer documenting *intent* and *contract*, not implementation details.
- **Examples**: Include usage examples for non-trivial APIs.
- **Language conventions**: Follow PEP 257 (Python), JSDoc (TypeScript/JavaScript), or project-specific style for the codebase.

---

## 7. Quality Checklist

Before publishing or merging documentation changes, verify:

- [ ] **Clarity**: Can someone unfamiliar with the code understand intent within a few minutes?
- [ ] **Completeness**: Are parameters, returns, exceptions, and configuration options documented where relevant?
- [ ] **Accuracy**: Does the documentation match current code and behavior?
- [ ] **Examples**: Are commands and examples tested and up to date?
- [ ] **Context**: Is it clear why the feature or component exists and when to use it?
- [ ] **Single source of truth**: Is the information stored in one place to avoid duplication and drift?
- [ ] **Last updated**: Is a "Last updated" (or 最終更新日) date present for reference and tutorial docs?
- [ ] **Links**: Do internal links resolve; are external links still valid?

---

## 8. Reference Documents

- **CLAUDE.md**: Development guidelines and active technologies; includes documentation policy.
- **CONTRIBUTING.md**: How to contribute; includes "update documentation" in the PR process.
- **docs/README.md**: Documentation index and quick navigation; references this standards doc.
- **Code Documentation Assistant skill**: Detailed templates for ADRs, API specs, and module docs (see project skills).

---

**Applied standards**: Keep a Changelog, Plain Writing Act principles, inverted pyramid (Economist/APA style), single authoritative source per topic.
