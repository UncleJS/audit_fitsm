#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
#
# Remove everything this repo created to build and run the stack.
# Volumes (+ the DB password secrets bound to them) and Quadlet units are kept
# unless --purge / --remove-quadlets are given.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=scripts/common.sh
source scripts/common.sh

usage() {
  cat <<'USAGE'
Usage: scripts/uninstall.sh [--purge] [--remove-quadlets]

Default: stop services, reset failed units, remove containers, pods, built
images (and their dangling layers), unused pulled base images and the JWT
secret. Data volumes, the DB password secrets and Quadlet units are kept.
  --purge            also remove the named volumes (ALL DATA) and DB secrets
  --remove-quadlets  also remove the units from ~/.config/containers/systemd/
                     (incl. the audit-fitsm-pod.pod.d drop-in) and daemon-reload
  --purge-data       deprecated alias for --purge
  -h, --help         show this help
Both flags together leave no trace of the project on the host.
USAGE
}

PURGE="false"
REMOVE_QUADLETS="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge) PURGE="true" ;;
    --purge-data)
      printf "Note: --purge-data is deprecated; use --purge.\n" >&2
      PURGE="true"
      ;;
    --remove-quadlets) REMOVE_QUADLETS="true" ;;
    -h|--help) usage; exit 0 ;;
    *) printf "Unknown option: %s\n" "$1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

require_prereqs

log "stopping services"
stop_services
reset_failed_services

# Units from the old .systemd/ layout (no longer shipped).
legacy_units_removed="false"
for unit in "${PROJECT_PREFIX}-api.service" "${PROJECT_PREFIX}-web.service"; do
  if [[ -f "${HOME}/.config/systemd/user/${unit}" ]]; then
    systemctl --user stop "${unit}" >/dev/null 2>&1 || true
    rm -f "${HOME}/.config/systemd/user/${unit}"
    legacy_units_removed="true"
    log "removed legacy unit ${unit}"
  fi
done

log "removing containers and pods"
for ctr in "${ALL_CONTAINERS[@]}"; do
  podman rm -f -v "${ctr}" >/dev/null 2>&1 || true
done
while IFS= read -r id; do
  [[ -n "${id}" ]] && podman rm -f -v "${id}" >/dev/null 2>&1 || true
done < <(podman ps -a -q --filter "label=${PROJECT_LABEL}" 2>/dev/null || true)
for pod in "${ALL_PODS[@]}"; do
  podman pod rm -f "${pod}" >/dev/null 2>&1 || true
done
while IFS= read -r id; do
  [[ -n "${id}" ]] && podman pod rm -f "${id}" >/dev/null 2>&1 || true
done < <(podman pod ps -q --filter "label=${PROJECT_LABEL}" 2>/dev/null || true)

log "removing built images and their build layers"
for image in "${BUILT_IMAGES[@]}"; do
  podman image rm -f "${image}" >/dev/null 2>&1 || true
done
podman image prune -f --filter "label=${PROJECT_LABEL}" >/dev/null 2>&1 || true
while IFS= read -r id; do
  [[ -n "${id}" ]] && podman image rm -f "${id}" >/dev/null 2>&1 || true
done < <(podman images -a -q --filter "label=${PROJECT_LABEL}" 2>/dev/null | sort -u || true)

log "removing pulled base images not used by other containers"
skipped_images=()
for image in "${BASE_IMAGES[@]}"; do
  podman image exists "${image}" 2>/dev/null || continue
  users="$(podman ps -a --filter "ancestor=${image}" --format '{{.Names}}' 2>/dev/null | paste -sd, - || true)"
  if [[ -n "${users}" ]]; then
    skipped_images+=("${image} (used by: ${users})")
    continue
  fi
  # Quadlet services run with --rm, so a stopped service of another project has no container; check
  # the other projects' unit files for the image (with or without the registry prefix) as well.
  short_image="${image#*/}"
  short_image="${short_image#library/}"
  unit_users="$(grep -rlsF -e "${image}" -e "${short_image}" "${QUADLET_UNIT_DIR}" 2>/dev/null \
    | grep -v "/${PROJECT_PREFIX}[^/]*$" | grep -v "/${PROJECT_PREFIX}[^/]*\.d/" \
    | xargs -r -n1 basename | paste -sd, - || true)"
  if [[ -n "${unit_users}" ]]; then
    skipped_images+=("${image} (referenced by units: ${unit_users})")
    continue
  fi
  if ! podman image rm "${image}" >/dev/null 2>&1; then
    skipped_images+=("${image} (still referenced by another image)")
  fi
done

log "removing secrets"
remove_secrets=("${JWT_SECRET_SECRET}" "${CI_SECRETS[@]}")
if [[ "${PURGE}" == "true" ]]; then
  remove_secrets+=("${DB_SECRETS[@]}")
fi
for secret in "${remove_secrets[@]}"; do
  podman secret rm "${secret}" >/dev/null 2>&1 || true
done

if [[ "${PURGE}" == "true" ]]; then
  log "purging volumes"
  for vol in "${VOLUME_NAMES[@]}" "${CI_VOLUMES[@]}"; do
    podman volume rm -f "${vol}" >/dev/null 2>&1 || true
  done
  while IFS= read -r vol; do
    [[ -n "${vol}" ]] && podman volume rm -f "${vol}" >/dev/null 2>&1 || true
  done < <(podman volume ls -q --filter "label=${PROJECT_LABEL}" 2>/dev/null || true)
else
  # CI volumes are throwaway; always remove them.
  for vol in "${CI_VOLUMES[@]}"; do
    podman volume rm -f "${vol}" >/dev/null 2>&1 || true
  done
fi

if [[ "${REMOVE_QUADLETS}" == "true" ]]; then
  log "removing Quadlet units from ${QUADLET_UNIT_DIR}"
  remove_all_quadlets
  reload_user_systemd
  reset_failed_services
elif [[ "${legacy_units_removed}" == "true" ]]; then
  reload_user_systemd
fi

# ---- leftover check ----
log "checking for leftovers"
problems=0
report() {
  # $1 = label, $2 = expected(true/false), rest = lines
  local what="$1" expected="$2"
  shift 2
  [[ $# -eq 0 ]] && return 0
  if [[ "${expected}" == "true" ]]; then
    printf '  kept %s:\n' "${what}"
  else
    printf '  LEFTOVER %s:\n' "${what}"
    problems=$((problems + 1))
  fi
  printf '    %s\n' "$@"
}
lines() { grep -v '^$' || true; }

mapfile -t left_ctrs < <({
  podman ps -a --filter "name=${PROJECT_PREFIX}" --format '{{.Names}}'
  podman ps -a --filter "label=${PROJECT_LABEL}" --format '{{.Names}}'
} 2>/dev/null | sort -u | lines)
mapfile -t left_pods < <({
  podman pod ps --filter "name=${PROJECT_PREFIX}" --format '{{.Name}}'
  podman pod ps --filter "label=${PROJECT_LABEL}" --format '{{.Name}}'
} 2>/dev/null | sort -u | lines)
mapfile -t left_images < <({
  podman images -a --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep -F "${PROJECT_PREFIX}"
  podman images -a --filter "label=${PROJECT_LABEL}" --format '{{.Repository}}:{{.Tag}} {{.ID}}'
} 2>/dev/null | sort -u | lines)
mapfile -t left_vols < <({
  podman volume ls -q --filter "name=${PROJECT_PREFIX}"
  podman volume ls -q --filter "label=${PROJECT_LABEL}"
} 2>/dev/null | sort -u | lines)
mapfile -t left_nets < <(podman network ls --format '{{.Name}}' 2>/dev/null | grep -F "${PROJECT_PREFIX}" | lines)
mapfile -t left_secrets < <(podman secret ls --format '{{.Name}}' 2>/dev/null | grep -F "${PROJECT_PREFIX}" | sort | lines)
mapfile -t left_units < <(find "${QUADLET_UNIT_DIR}" "${HOME}/.config/systemd/user" -maxdepth 2 \
  -name "${PROJECT_PREFIX}*" 2>/dev/null | sort | lines)

expected_secrets=()
unexpected_secrets=()
for s in "${left_secrets[@]}"; do
  if [[ "${PURGE}" != "true" ]] && [[ " ${DB_SECRETS[*]} " == *" ${s} "* ]]; then
    expected_secrets+=("${s}")
  else
    unexpected_secrets+=("${s}")
  fi
done

report "containers" false "${left_ctrs[@]}"
report "pods" false "${left_pods[@]}"
report "images" false "${left_images[@]}"
report "networks" false "${left_nets[@]}"
report "volumes" "$([[ "${PURGE}" == "true" ]] && echo false || echo true)" "${left_vols[@]}"
report "DB secrets (bound to the kept volumes)" true "${expected_secrets[@]}"
report "secrets" false "${unexpected_secrets[@]}"
report "Quadlet/systemd units" "$([[ "${REMOVE_QUADLETS}" == "true" ]] && echo false || echo true)" "${left_units[@]}"
if [[ "${#skipped_images[@]}" -gt 0 ]]; then
  printf '  kept base images in use elsewhere:\n'
  printf '    %s\n' "${skipped_images[@]}"
fi

if [[ "${PURGE}" != "true" ]]; then
  printf 'Volumes and DB secrets kept. Use --purge to delete them (destroys data).\n'
fi
if [[ "${REMOVE_QUADLETS}" != "true" ]]; then
  printf 'Quadlet units kept in %s. Use --remove-quadlets to delete them.\n' "${QUADLET_UNIT_DIR}"
fi

if [[ "${problems}" -gt 0 ]]; then
  printf 'Uninstall incomplete: %d leftover group(s) found.\n' "${problems}" >&2
  exit 1
fi
log "uninstall complete"
