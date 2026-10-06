#!/usr/bin/env bash
# Rebuild the PIPING command line: dist/rw_pipe_cmdline.js and console_loader_pipe.js.
# Separate from build_loader.sh (the duct build) on purpose: neither build reads or writes the
# other's outputs. Run after editing anything under src/pipe/ or src/core/pipe-*.js.
set -euo pipefail
cd "$(dirname "$0")"

node scripts/build-pipe-dist.js
node --check dist/rw_pipe_cmdline.js
node scripts/build-pipe-loader.js
node --check console_loader_pipe.js && echo "rebuilt console_loader_pipe.js ($(wc -c < console_loader_pipe.js) bytes) - syntax OK"
