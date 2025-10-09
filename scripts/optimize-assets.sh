#!/usr/bin/env bash
# Batch compresses GLB/GLTF assets with glTF-Transform + Draco.
# Uses a Dockerized CLI if available, otherwise falls back to a local
# `gltf-transform` installation.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_CONTEXT="${ROOT_DIR}/docker/gltf-transform"
IMAGE_TAG="gltf-transform:draco"

log() {
  printf '[optimize-assets] %s\n' "$*"
}

error() {
  printf '[optimize-assets] ERROR: %s\n' "$*" >&2
}

has_docker() {
  command -v docker >/dev/null 2>&1
}

has_local_cli() {
  command -v gltf-transform >/dev/null 2>&1
}

maybe_build_image() {
  if ! has_docker; then
    return 1
  fi

  if [[ ! -f "${DOCKER_CONTEXT}/Dockerfile" ]]; then
    error "Dockerfile not found at ${DOCKER_CONTEXT}/Dockerfile"
    exit 1
  fi

  if ! docker image inspect "${IMAGE_TAG}" >/dev/null 2>&1; then
    log "Building Docker image ${IMAGE_TAG}..."
    docker build -t "${IMAGE_TAG}" "${DOCKER_CONTEXT}"
  fi
}

run_cli() {
  if has_docker; then
    docker run --rm -v "${ROOT_DIR}:/workspace" "${IMAGE_TAG}" "$@"
  else
    gltf-transform "$@"
  fi
}

main() {
  if has_docker; then
    maybe_build_image
  elif ! has_local_cli; then
    error "Neither Docker nor a local gltf-transform CLI installation is available."
    error "Install gltf-transform (npm install -g gltf-transform) or enable Docker."
    exit 1
  fi

  mapfile -d '' files < <(find "${ROOT_DIR}/public/assets" -type f \( -name '*.glb' -o -name '*.gltf' \) -print0)

  if [[ ${#files[@]} -eq 0 ]]; then
    log "No GLB/GLTF assets found under public/assets."
    exit 0
  fi

  for abs_path in "${files[@]}"; do
    rel_path="${abs_path#${ROOT_DIR}/}"
    tmp_path="${rel_path}.tmp"

    log "Optimizing ${rel_path}"

    run_cli optimize "${rel_path}" "${tmp_path}" \
      --compress draco \
      --texture-compress webp \
      --texture-size 2048 \
      --simplify false

    mv "${ROOT_DIR}/${tmp_path}" "${ROOT_DIR}/${rel_path}"
  done

  log "Done."
}

main "$@"
