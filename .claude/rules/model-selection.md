# Model Selection

**Purpose**: Choose appropriate AI model based on task complexity.

---

## Decision Tree

```
Is task well-defined and simple?
├─ YES → Haiku (file ops, validation, formatting, conversion)
└─ NO
   ├─ Requires deep reasoning? → Opus (architecture, security, trade-offs)
   └─ Standard work? → Sonnet (implementation, debugging, testing, docs)
```

## Quick Reference

| Model | Use For | Examples |
|-------|---------|---------|
| **Haiku** | Simple, well-defined tasks | File I/O, format conversion, validation, search, formatting |
| **Sonnet** | Standard development | Feature implementation, debugging, tests, docs, code review |
| **Opus** | Deep reasoning | Architecture design, security analysis, complex algorithms, critical decisions |

## Constraints

- **Default**: Start with Sonnet, adjust as needed
- **Never** use Opus for simple file operations or formatting
- **Never** use Haiku for architecture decisions or security analysis
- **Decompose** complex work: Opus for design → Sonnet for implementation → Haiku for validation
- **Parallelize** independent tasks across models when possible

## Cost

Relative: Haiku 1x, Sonnet 3x, Opus 15x. Match model to task complexity for optimal cost/quality.

---

**For detailed task decomposition examples**: Use `model-selector` agent.

**Last Updated**: 2026-02-10
