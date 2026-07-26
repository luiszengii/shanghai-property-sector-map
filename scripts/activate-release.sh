#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <release-sha>" >&2
  exit 64
fi

release_sha="$1"
deploy_root="/opt/shfang"
release_dir="${deploy_root}/releases/${release_sha}"
current_link="${deploy_root}/current"
next_link="${deploy_root}/.current-${release_sha}"
previous_release=""

if [[ ! "${release_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "invalid release sha: ${release_sha}" >&2
  exit 64
fi

if [[ ! -f "${release_dir}/server.js" ]]; then
  echo "release is missing server.js: ${release_dir}" >&2
  exit 66
fi

if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
fi

ln -sfn "${release_dir}" "${next_link}"
mv -Tf "${next_link}" "${current_link}"
sudo systemctl restart shfang-map.service

healthy=false
for _ in {1..60}; do
  if curl --fail --silent --show-error \
    --connect-timeout 2 \
    --max-time 5 \
    --header "Host: shfang.xyz" \
    --output /dev/null \
    http://127.0.0.1:3000/; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "${healthy}" != "true" ]]; then
  echo "release ${release_sha} failed its health check" >&2
  journalctl -u shfang-map.service --no-pager -n 80 >&2 || true
  if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
    ln -sfn "${previous_release}" "${next_link}"
    mv -Tf "${next_link}" "${current_link}"
    sudo systemctl restart shfang-map.service
    echo "rolled back to ${previous_release}" >&2
  fi
  exit 1
fi

systemctl is-active --quiet shfang-map.service
printf 'DEPLOYED_SHA=%s\n' "${release_sha}"

find "${deploy_root}/releases" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -printf '%T@ %p\n' \
  | sort -nr \
  | awk 'NR > 5 { sub(/^[^ ]+ /, ""); print }' \
  | while IFS= read -r old_release; do
      if [[ "${old_release}" != "$(readlink -f "${current_link}")" ]]; then
        rm -rf -- "${old_release}"
      fi
    done
