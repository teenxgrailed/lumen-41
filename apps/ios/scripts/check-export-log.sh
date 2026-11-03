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

# Messages that mean it got as far as signing: no distribution certificate and
# no provisioning profiles. A plist problem mentioning teamID or a profile does
# not match these.
if grep -Eq "No signing certificate|No profiles for" "$LOG"; then
  echo "exportArchive stopped at signing, as expected without a certificate (exit $CODE)."
  grep -E "error:|No signing certificate|No profiles for" "$LOG" | head -20
  exit 0
fi

echo "::error::exportArchive failed (exit $CODE) for a reason that is not signing; read the log above"
exit 1
