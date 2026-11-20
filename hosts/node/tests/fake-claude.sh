#!/bin/sh
# A stand-in for `claude -p --output-format stream-json` (no model): it reads the prompt from stdin, "edits" a file in
# the folder it was started in (FAKE_EDIT, default hello.txt), saves its arguments and prompt where FAKE_LOG says, and
# prints a stream-json system line and result line the way claude -p does, with tokens and a cost.
# FAKE_SCRATCH set: it also writes a throwaway script under .scratch/ (T-456), which must never reach a commit (T-477).
# FAKE_SLEEP (seconds) makes it wait first, like a slow model: a stop while it waits must mean the file never changes.
# FAKE_PID set: it first writes its process id there (its process group's id too: symcc starts it detached), so a
# test can check the group is gone instead of waiting out the sleep on the clock (T-509).
# Started with --resume <session> (T-656, the debrief after a hand-back): it edits nothing, saves its arguments and
# message to FAKE_LOG.resume.*, and answers FAKE_DEBRIEF (default "none") with its own tokens.
case " $* " in
  *" --resume "*)
    msg=$(cat)
    if [ -n "${FAKE_LOG:-}" ]; then
      for a in "$@"; do printf '%s\n' "$a"; done > "$FAKE_LOG.resume.args"
      printf '%s' "$msg" > "$FAKE_LOG.resume.prompt"
    fi
    answer=$(printf '%s\n' "${FAKE_DEBRIEF:-none}" | awk 'BEGIN { ORS = "\\n" } { print }')
    echo '{"type":"system","subtype":"init","session_id":"fake"}'
    printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"session_id":"fake","result":"'"$answer"'","total_cost_usd":0.001,"usage":{"input_tokens":10,"output_tokens":3}}'
    exit 0
    ;;
esac
[ -n "${FAKE_PID:-}" ] && echo $$ > "$FAKE_PID"
prompt=$(cat)
file=${FAKE_EDIT:-hello.txt}
[ -n "${FAKE_SLEEP:-}" ] && sleep "$FAKE_SLEEP"
mkdir -p "$(dirname "$file")"
echo "hello from the fake worker" > "$file"
if [ -n "${FAKE_SCRATCH:-}" ]; then mkdir -p .scratch && echo 'print(1)' > .scratch/edit.py; fi
if [ -n "${FAKE_LOG:-}" ]; then
  for a in "$@"; do printf '%s\n' "$a"; done > "$FAKE_LOG.args"
  printf '%s' "$prompt" > "$FAKE_LOG.prompt"
  pwd > "$FAKE_LOG.cwd"
fi
echo '{"type":"system","subtype":"init","session_id":"fake"}'
echo '{"type":"result","subtype":"success","is_error":false,"result":"Wrote '"$file"' with a greeting.","total_cost_usd":0.0123,"usage":{"input_tokens":100,"output_tokens":20,"cache_read_input_tokens":5,"cache_creation_input_tokens":7}}'
