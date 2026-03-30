#!/usr/bin/env bash
# Usage: from repo root, run: bash tests/scripts/check_user_doc_heading_count.sh
# Exits 0 if docs/user/faq.md + docs/user/user-guide.md have >= 15 H3 (###) headings combined (SC-002 guardrail); non-zero otherwise.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIN="${MIN_USER_DOC_H3_HEADINGS:-15}"
faq="${ROOT}/docs/user/faq.md"
guide="${ROOT}/docs/user/user-guide.md"
for f in "$faq" "$guide"; do
  [[ -f "$f" ]] || { echo "Missing: $f" >&2; exit 1; }
done
count=$(grep -c '^### ' "$faq" || true)
count2=$(grep -c '^### ' "$guide" || true)
count=$((count + count2))
if [[ "$count" -lt "$MIN" ]]; then
  echo "check_user_doc_heading_count: combined ### count is $count (minimum $MIN)" >&2
  echo "  files: docs/user/faq.md docs/user/user-guide.md" >&2
  exit 1
fi
echo "check_user_doc_heading_count: OK ($count ### headings, min $MIN)"
exit 0
