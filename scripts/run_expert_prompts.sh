#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT_SET="${1:-e1}"
PROMPT_DIR="$ROOT_DIR/data/expert_prompt/$PROMPT_SET"
REPORT_DIR="$ROOT_DIR/data/expert_prompt_reports"
REPORT_FILE="$REPORT_DIR/${PROMPT_SET}_convertibility_issues.txt"
TMP_DIR="$ROOT_DIR/.codex_tmp/$PROMPT_SET"
FORCE_REGENERATE="${FORCE_REGENERATE:-0}"
REASONING_EFFORT="${REASONING_EFFORT:-high}"
QUIET_LOGS="${QUIET_LOGS:-1}"
SESSION_CHAIN="${SESSION_CHAIN:-1}"

if [[ ! -d "$PROMPT_DIR" ]]; then
  echo "[error] Prompt directory not found: $PROMPT_DIR" >&2
  exit 1
fi

mkdir -p "$REPORT_DIR" "$TMP_DIR"

{
  echo "# Convertibility Report"
  echo "prompt_set: $PROMPT_SET"
  echo "generated_at: $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo
} > "$REPORT_FILE"

extract_output_path() {
  local prompt_file="$1"
  sed -nE "s/^[-[:space:]]*Target output file path[^:]*:[[:space:]]*//p" "$prompt_file" | head -n 1
}

strip_code_fence() {
  local src="$1"
  local dst="$2"

  if grep -q '^```' "$src"; then
    awk '
      BEGIN { in_block = 0; done = 0 }
      /^```/ {
        if (done == 1) next
        if (in_block == 0) { in_block = 1; next }
        if (in_block == 1) { done = 1; in_block = 0; next }
      }
      {
        if (done == 0) print $0
      }
    ' "$src" > "$dst"
  else
    cp "$src" "$dst"
  fi
}

build_prompt_with_reasoning() {
  local src="$1"
  local dst="$2"
  {
    echo "Reasoning effort: $REASONING_EFFORT"
    echo
    cat "$src"
  } > "$dst"
}

append_issue() {
  local prompt_file="$1"
  local output_path="$2"
  local reason="$3"
  local detail="$4"
  local explanation
  explanation="$(awk '
    BEGIN { in_exp = 0 }
    /^Explanation:[[:space:]]*$/ { in_exp = 1; next }
    in_exp == 1 { print }
  ' "$prompt_file" | sed '/^[[:space:]]*$/d')"
  {
    echo "## $(basename "$prompt_file")"
    echo "- output: $output_path"
    echo "- reason: $reason"
    if [[ -n "$explanation" ]]; then
      echo "- explanation:"
      echo "$explanation" | sed 's/^/  /'
    fi
    if [[ -n "$detail" ]]; then
      echo "- detail:"
      echo "$detail" | sed 's/^/  /'
    fi
    echo
  } >> "$REPORT_FILE"
}

extract_codex_error_reason() {
  local log_file="$1"
  local reason
  reason="$(rg -n 'Fatal error:|Error:|permission denied|ENOTFOUND|timed out|stream disconnected|Failed to create session' "$log_file" | head -n 1 | sed -E 's/^[0-9]+://')"
  if [[ -z "$reason" ]]; then
    reason="$(tail -n 1 "$log_file" 2>/dev/null || true)"
  fi
  if [[ -z "$reason" ]]; then
    reason="codex-exec-failed (no detail)"
  fi
  echo "$reason"
}

echo "[info] Running prompts from $PROMPT_DIR"
if [[ "$SESSION_CHAIN" == "1" ]]; then
  echo "[info] session mode: chained (first=exec, next=resume --last)"
else
  echo "[info] session mode: isolated (every prompt uses fresh exec)"
fi

total=0
skipped=0
succeeded=0
failed=0
has_active_session=0

for prompt_file in "$PROMPT_DIR"/*.txt(N); do
  total=$((total + 1))
  base="$(basename "$prompt_file" .txt)"
  raw_out="$TMP_DIR/${base}.raw.txt"
  cleaned_out="$TMP_DIR/${base}.cleaned.ts"
  run_prompt="$TMP_DIR/${base}.run_prompt.txt"
  codex_log="$TMP_DIR/${base}.codex.log"
  : > "$raw_out"
  : > "$codex_log"
  output_path="$(extract_output_path "$prompt_file")"

  if [[ -z "$output_path" ]]; then
    append_issue "$prompt_file" "(unknown)" "missing-output-path-in-prompt" ""
    echo "[warn] $base: output path not found in prompt"
    continue
  fi

  abs_output_path="$ROOT_DIR/$output_path"
  mkdir -p "$(dirname "$abs_output_path")"

  if [[ "$FORCE_REGENERATE" != "1" && -s "$abs_output_path" ]]; then
    echo "[skip] $base -> existing output found: $output_path"
    skipped=$((skipped + 1))
    continue
  fi

  echo "[run] $base -> $output_path"
  build_prompt_with_reasoning "$prompt_file" "$run_prompt"

  if [[ "$SESSION_CHAIN" == "1" && "$has_active_session" == "1" ]]; then
    if codex exec resume --last - < "$run_prompt" > "$raw_out" 2> "$codex_log"; then
      :
    else
      failed=$((failed + 1))
      reason="$(extract_codex_error_reason "$codex_log")"
      echo "[fail] $base -> $reason"
      append_issue "$prompt_file" "$output_path" "codex-exec-failed" "$reason"
      if [[ "$QUIET_LOGS" != "1" ]]; then
        echo "[debug] codex log: $codex_log"
      fi
      continue
    fi
  else
    if codex exec \
      -C "$ROOT_DIR" \
      --sandbox workspace-write \
      --output-last-message "$raw_out" \
      < "$run_prompt" \
      > "$codex_log" 2>&1; then
      has_active_session=1
    else
      failed=$((failed + 1))
      reason="$(extract_codex_error_reason "$codex_log")"
      echo "[fail] $base -> $reason"
      append_issue "$prompt_file" "$output_path" "codex-exec-failed" "$reason"
      if [[ "$QUIET_LOGS" != "1" ]]; then
        echo "[debug] codex log: $codex_log"
      fi
      continue
    fi
  fi

  strip_code_fence "$raw_out" "$cleaned_out"
  cp "$cleaned_out" "$abs_output_path"

  if ! grep -q 'export default plan(' "$abs_output_path"; then
    append_issue "$prompt_file" "$output_path" "missing-export-default-plan" ""
  fi

  issue_lines="$(grep -nE 'TODO\(convertibility-step-|PROPOSED_ACTION:' "$abs_output_path" || true)"
  if [[ -n "$issue_lines" ]]; then
    append_issue "$prompt_file" "$output_path" "convertibility-partial-or-fallback" "$issue_lines"
  fi
  succeeded=$((succeeded + 1))
  echo "[ok] $base"
done

if ! rg -n '^## ' "$REPORT_FILE" >/dev/null; then
  echo "No convertibility issues were detected." >> "$REPORT_FILE"
fi

echo "[summary] total=$total, ok=$succeeded, skip=$skipped, fail=$failed"
echo "[done] report: $REPORT_FILE"
