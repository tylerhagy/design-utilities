#!/usr/bin/env bash
# design-tools.sh — start any of ORCA, jobmap and priority-guide that aren't
# already running, without ever opening a browser.
#
# WHY THIS EXISTS
# Each tool's own serve.sh opens the URL in Chrome after it starts the
# server. That's the right move from a terminal, and the wrong one from a
# sandboxed or non-interactive shell — GUI activation there can hang or kill
# the invoking process, taking the freshly-started server down with it. This
# script starts the servers directly with nohup/disown and never calls
# `open`, so it's safe to run from anywhere. Open `index.html` or the URLs
# yourself once it's done.
set -uo pipefail

NAMES=(orca jobmap priority-guide)
LABELS=("ORCA" "jobmap" "priority guide")
PORTS=(8042 8043 8044)
DIR_VARS=(ORCA_DIR JOBMAP_DIR PRIORITY_GUIDE_DIR)
# Where each tool is cloned. Looked for first inside this repo's own folder
# (the tools are cloned alongside this script), then in ~/Projects.
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_NAMES=(ooux jobmap priority-guide)

STATUSES=()
DETAILS=()

count=${#NAMES[@]}
i=0
while [ "$i" -lt "$count" ]; do
  name="${NAMES[$i]}"
  label="${LABELS[$i]}"
  port="${PORTS[$i]}"
  dir_var="${DIR_VARS[$i]}"
  repo="${REPO_NAMES[$i]}"
  if [ -d "${SELF_DIR}/${repo}" ]; then default_dir="${SELF_DIR}/${repo}"; else default_dir="$HOME/Projects/${repo}"; fi
  url="http://localhost:${port}"

  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    STATUSES+=("already running")
    DETAILS+=("${url}")
    i=$((i + 1))
    continue
  fi

  eval "override=\"\${${dir_var}:-}\""
  if [ -n "${override}" ]; then
    dir="${override}"
  else
    dir="${default_dir}"
  fi

  if [ ! -d "${dir}" ]; then
    echo "${label}: directory not found at ${dir} (set \$${dir_var} to override) — skipping."
    STATUSES+=("failed")
    DETAILS+=("directory not found: ${dir}")
    i=$((i + 1))
    continue
  fi

  log="/tmp/design-tools-${name}.log"
  nohup python3 "${dir}/serve.py" "${port}" > "${log}" 2>&1 &
  disown

  STATUSES+=("started")
  DETAILS+=("${url} (log: ${log})")
  i=$((i + 1))
done

echo ""
echo "design-tools summary:"
i=0
while [ "$i" -lt "$count" ]; do
  printf "  %-15s %-16s %s\n" "${LABELS[$i]}" "${STATUSES[$i]}" "${DETAILS[$i]}"
  i=$((i + 1))
done
