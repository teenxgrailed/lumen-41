#!/bin/bash
# `xcodebuild -exportArchive` cannot finish without an Apple Distribution
# certificate and provisioning profiles, and CI has neither. CI still runs it
# so that ExportOptions-AppStore.plist is read by the real tool, then this
# script asserts the failure is only about signing, not about the plist.
# A plist that xcodebuild rejects (wrong key, wrong value, not a plist) fails
# earlier with a different message and fails this check.
# What this proves: the file parses and xcodebuild reaches the signing stage.
# What it cannot prove: that your team's certificate and profiles work.
# Usage: scripts/check-export-log.sh <export.log> <exit code>
set -euo pipefail

LOG="${1:?log file}"
CODE="${2:?exit code}"

if [ "$CODE" = "0" ]; then
  echo "exportArchive succeeded (a signing identity was available); nothing to assert."
  exit 0
fi

# Messages that mean the options file itself is wrong.
if grep -Eiq "exportOptionsPlist.*(invalid|malformed|not valid|could not|couldn.t)|data couldn.t be read|unrecognized (key|option)|unknown (key|option|method)|invalid value for|Unexpected character|is not a valid (method|destination)" "$LOG"; then
  echo "::error::xcodebuild rejected ExportOptions-AppStore.plist itself"
  exit 1
fi

# Messages that mean it got as far as signing / provisioning / the team.
if grep -Eiq "signing|provisioning|certificate|no accounts|team|code ?sign|profile|authentication" "$LOG"; then
  echo "exportArchive stopped at signing, as expected without a certificate (exit $CODE)."
  grep -Ei "error:|signing|provisioning|certificate|team" "$LOG" | head -20
  exit 0
fi

echo "::error::exportArchive failed (exit $CODE) for a reason that is not signing; read the log above"
exit 1
