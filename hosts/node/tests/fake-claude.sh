#!/bin/sh
# A stand-in for `claude -p --output-format stream-json` (no model): it reads the prompt from stdin, "edits" a file in
# the folder it was started in (FAKE_EDIT, default hello.txt), saves its arguments and prompt where FAKE_LOG says, and
# prints a stream-json system line and result line the way claude -p does, with tokens and a cost.
prompt=$(cat)
file=${FAKE_EDIT:-hello.txt}
mkdir -p "$(dirname "$file")"
echo "hello from the fake worker" > "$file"
if [ -n "${FAKE_LOG:-}" ]; then
  for a in "$@"; do printf '%s\n' "$a"; done > "$FAKE_LOG.args"
  printf '%s' "$prompt" > "$FAKE_LOG.prompt"
  pwd > "$FAKE_LOG.cwd"
fi
echo '{"type":"system","subtype":"init","session_id":"fake"}'
echo '{"type":"result","subtype":"success","is_error":false,"result":"Wrote '"$file"' with a greeting.","total_cost_usd":0.0123,"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":5,"cache_creation_input_tokens":7}}'
