#!/bin/bash
#
# Lints the codebase for raw LLM fetch calls that bypass the PII-safe wrapper.
# Any call to api.groq.com or api.anthropic.com via plain fetch() is forbidden
# OUTSIDE of the safeLlmCall wrapper itself.
#
# Run: ./scripts/lint-llm-calls.sh
# Exit code 0 = clean. Non-zero = violations found.
#
# Allowlist:
#  - packages/tokeniser/src/safe-llm.ts          (the wrapper)
#  - packages/query-engine/src/llm-providers/    (legacy query-engine, separate
#                                                  tokenisation pipeline)
#  - packages/query-engine/src/guardrails.ts     (legacy)
#  - apps/web/src/lib/llm-proxy.ts               (BYOK proxy adapter — calls upstream
#                                                  on behalf of customer; tokenisation
#                                                  happens in the route handler before
#                                                  this adapter is invoked)

set -e

VIOLATIONS=$(grep -rn 'fetch.*api\.\(groq\|anthropic\|openai\)\.com' \
  "packages/" "apps/web/src/" 2>/dev/null \
  | grep -vE '(safe-llm\.ts|llm-providers/|guardrails\.ts|llm-proxy\.ts|__tests__|\.test\.ts)' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ Raw LLM fetch calls found that bypass safeLlmCall:"
  echo ""
  echo "$VIOLATIONS"
  echo ""
  echo "Fix: replace these with safeLlmCall from @aiql/tokeniser."
  echo "All LLM calls MUST tokenise PII before sending to external services."
  exit 1
fi

echo "✓ No raw LLM fetch calls found outside the wrapper."
exit 0
