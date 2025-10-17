#!/usr/bin/env bash
# Unified setup script combining:
# - Dependency checking (Node.js, npm)
# - Asset verification (GLTF models, textures)
# - Asset optimization (glTF-Transform + Draco compression)

set -euo pipefail

# ========================================
# Configuration
# ========================================
MIN_NODE_MAJOR=18
PREFERRED_NODE_MAJOR=20
NODESOURCE_SERIES="${PREFERRED_NODE_MAJOR}.x"
NVM_VERSION="v0.39.7"

GLTF_IMAGE_TAG="gltf-transform:draco"

# ========================================
# Logging Utilities
# ========================================
log() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

# ========================================
# Utility Functions
# ========================================
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command_exists sudo; then
    sudo "$@"
  else
    die "Root privileges required for: $*"
  fi
}

detect_platform() {
  local uname_out
  uname_out=$(uname -s)
  case "$uname_out" in
    Darwin) echo "macos" ;;
    Linux) echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) echo "unknown" ;;
  esac
}

current_node_major() {
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

# ========================================
# Node.js Installation
# ========================================
ensure_nvm() {
  local nvm_dir
  nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$nvm_dir/nvm.sh" ]; then
    log "Installing nvm (${NVM_VERSION})..."
    if command_exists curl; then
      curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
    elif command_exists wget; then
      wget -qO- "https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh" | bash
    else
      die "Either curl or wget is required to install nvm."
    fi
  else
    log "nvm already installed."
  fi
  export NVM_DIR="${nvm_dir}"
  # shellcheck disable=SC1090
  . "${NVM_DIR}/nvm.sh"
}

install_node_via_nvm() {
  ensure_nvm
  log "Installing Node.js ${PREFERRED_NODE_MAJOR}.x via nvm..."
  nvm install "${PREFERRED_NODE_MAJOR}"
  nvm alias default "${PREFERRED_NODE_MAJOR}"
  nvm use "${PREFERRED_NODE_MAJOR}"
}

install_node_macos() {
  if command_exists brew; then
    log "Using Homebrew to install Node.js..."
    if brew list --versions node >/dev/null 2>&1; then
      brew upgrade node || true
    else
      brew install node
    fi
  else
    warn "Homebrew not found. Falling back to nvm installation."
    install_node_via_nvm
  fi
}

nodesource_fetch() {
  local url
  url="$1"
  if command_exists curl; then
    curl -fsSL "$url"
  elif command_exists wget; then
    wget -qO- "$url"
  else
    die "Either curl or wget is required to download NodeSource setup scripts."
  fi
}

install_node_debian() {
  log "Setting up NodeSource repo (${NODESOURCE_SERIES})..."
  if [ "$(id -u)" -eq 0 ]; then
    nodesource_fetch "https://deb.nodesource.com/setup_${NODESOURCE_SERIES}" | bash -
  else
    nodesource_fetch "https://deb.nodesource.com/setup_${NODESOURCE_SERIES}" | sudo -E bash -
  fi
  run_as_root apt-get install -y nodejs
}

install_node_rhel() {
  log "Setting up NodeSource repo (${NODESOURCE_SERIES})..."
  if [ "$(id -u)" -eq 0 ]; then
    nodesource_fetch "https://rpm.nodesource.com/setup_${NODESOURCE_SERIES}" | bash -
  else
    nodesource_fetch "https://rpm.nodesource.com/setup_${NODESOURCE_SERIES}" | sudo -E bash -
  fi
  if command_exists dnf; then
    run_as_root dnf install -y nodejs
  else
    run_as_root yum install -y nodejs
  fi
}

install_node_linux() {
  if command_exists apt-get; then
    install_node_debian
    return
  fi
  if command_exists dnf || command_exists yum; then
    install_node_rhel
    return
  fi
  if command_exists pacman; then
    log "Installing Node.js via pacman..."
    run_as_root pacman -Sy --noconfirm --needed nodejs npm
    return
  fi
  if command_exists zypper; then
    log "Installing Node.js via zypper..."
    if ! run_as_root zypper install -y nodejs20 npm20; then
      run_as_root zypper install -y nodejs npm
    fi
    return
  fi
  warn "No supported system package manager detected. Falling back to nvm installation."
  install_node_via_nvm
}

install_node_windows() {
  if command_exists winget.exe; then
    log "Installing Node.js via winget..."
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
      -Command "winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements" || warn "winget install may require manual confirmation."
    return
  fi
  if command_exists choco.exe; then
    log "Installing Node.js via Chocolatey..."
    choco.exe install nodejs-lts -y --no-progress || warn "Chocolatey install may require manual intervention."
    return
  fi
  warn "winget and Chocolatey were not detected. Attempting nvm installation."
  install_node_via_nvm
}

ensure_node() {
  local major
  if command_exists node; then
    major=$(current_node_major)
    if [ -n "$major" ] && [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
      log "Detected Node.js $(node -v)."
      return
    fi
    warn "Node.js $(node -v) is below required version ${MIN_NODE_MAJOR}."
  else
    log "Node.js not found."
  fi

  case "$PLATFORM" in
    macos) install_node_macos ;;
    linux) install_node_linux ;;
    windows) install_node_windows ;;
    *) die "Unsupported platform: ${PLATFORM}" ;;
  esac

  hash -r

  if ! command_exists node; then
    die "Node.js installation failed."
  fi
  major=$(current_node_major)
  if [ -z "$major" ] || [ "$major" -lt "$MIN_NODE_MAJOR" ]; then
    die "Node.js $(node -v) is still below required version ${MIN_NODE_MAJOR}."
  fi
  log "Node.js $(node -v) installed successfully."
}

ensure_npm() {
  if ! command_exists npm; then
    die "npm is unavailable even though Node.js is installed."
  fi
  log "Detected npm $(npm -v)."
}

install_project_dependencies() {
  if [ -d node_modules ] && [ -f package-lock.json ]; then
    log "node_modules already present; skipping npm ci."
    return
  fi
  if [ -f package-lock.json ]; then
    log "Installing npm dependencies with npm ci..."
    npm ci
  else
    log "Installing npm dependencies with npm install..."
    npm install
  fi
}

# ========================================
# Asset Verification (Python-based)
# ========================================
check_assets() {
  log "Verifying game assets..."
  
  if ! command_exists python3; then
    warn "Python 3 not found. Skipping asset verification."
    warn "Install Python 3 to enable asset checks."
    return
  fi

  local check_script="${REPO_ROOT}/scripts/check_assets.py"
  if [ ! -f "$check_script" ]; then
    warn "Asset check script not found at ${check_script}. Skipping."
    return
  fi

  if ! python3 "$check_script" --root "$REPO_ROOT"; then
    die "Asset verification failed. Please ensure all required assets are present."
  fi
  
  log "Asset verification passed."
}

# ========================================
# Asset Optimization
# ========================================
has_docker() {
  command_exists docker
}

has_local_gltf_cli() {
  command_exists gltf-transform
}

maybe_build_gltf_image() {
  if ! has_docker; then
    return 1
  fi

  local docker_context="${REPO_ROOT}/docker/gltf-transform"
  if [[ ! -f "${docker_context}/Dockerfile" ]]; then
    warn "glTF-Transform Dockerfile not found at ${docker_context}/Dockerfile"
    return 1
  fi

  if ! docker image inspect "${GLTF_IMAGE_TAG}" >/dev/null 2>&1; then
    log "Building Docker image ${GLTF_IMAGE_TAG}..."
    docker build -t "${GLTF_IMAGE_TAG}" "${docker_context}"
  fi
}

run_gltf_cli() {
  if has_docker; then
    docker run --rm -v "${REPO_ROOT}:/workspace" "${GLTF_IMAGE_TAG}" "$@"
  else
    gltf-transform "$@"
  fi
}

optimize_assets() {
  log "Optimizing game assets..."

  if has_docker; then
    maybe_build_gltf_image || {
      warn "Docker image build failed. Falling back to local CLI."
    }
  elif ! has_local_gltf_cli; then
    warn "Neither Docker nor gltf-transform CLI found."
    warn "Install gltf-transform (npm install -g @gltf-transform/cli) or enable Docker."
    warn "Skipping asset optimization."
    return
  fi

  local assets_dir="${REPO_ROOT}/public/assets"
  if [ ! -d "$assets_dir" ]; then
    warn "Assets directory not found at ${assets_dir}. Skipping optimization."
    return
  fi

  mapfile -d '' files < <(find "${assets_dir}" -type f \( -name '*.glb' -o -name '*.gltf' \) -print0 2>/dev/null)

  if [[ ${#files[@]} -eq 0 ]]; then
    log "No GLB/GLTF assets found to optimize."
    return
  fi

  local optimized=0
  for abs_path in "${files[@]}"; do
    rel_path="${abs_path#${REPO_ROOT}/}"
    tmp_path="${rel_path}.tmp"

    log "Optimizing ${rel_path}"

    if run_gltf_cli optimize "${rel_path}" "${tmp_path}" \
      --compress draco \
      --texture-compress webp \
      --texture-size 2048 \
      --simplify false 2>/dev/null; then
      mv "${REPO_ROOT}/${tmp_path}" "${REPO_ROOT}/${rel_path}"
      ((optimized++)) || true
    else
      warn "Failed to optimize ${rel_path}"
      rm -f "${REPO_ROOT}/${tmp_path}"
    fi
  done

  log "Optimized ${optimized} asset(s)."
}

# ========================================
# Reporting
# ========================================
report_optional_dependencies() {
  if ! command_exists docker; then
    warn "Docker not detected. It is optional but required for container workflows."
  fi
  if ! command_exists make; then
    warn "GNU Make not detected. Optional Make targets will not be available."
  fi
  if ! command_exists python3; then
    warn "Python 3 not detected. Asset verification will be skipped."
  fi
}

# ========================================
# Main Entry Point
# ========================================
usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Unified setup script for Grand Theft Scooter game development.

OPTIONS:
  --skip-deps         Skip dependency installation (Node.js/npm)
  --skip-assets       Skip asset verification
  --skip-optimize     Skip asset optimization
  --only-deps         Only check/install dependencies
  --only-assets       Only verify assets
  --only-optimize     Only optimize assets
  -h, --help          Show this help message

ENVIRONMENT VARIABLES:
  SKIP_NPM_INSTALL=1  Skip npm dependency installation
  NVM_DIR             Custom nvm installation directory

EXAMPLES:
  $0                  Run full setup (deps + assets + optimize)
  $0 --skip-optimize  Setup without asset optimization
  $0 --only-assets    Only verify game assets
EOF
}

main() {
  local script_dir repo_root
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  repo_root=$(cd "${script_dir}/.." && pwd)
  cd "${repo_root}"
  
  REPO_ROOT="${repo_root}"

  # Parse command line arguments
  local skip_deps=0
  local skip_assets=0
  local skip_optimize=0
  local only_mode=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-deps)
        skip_deps=1
        shift
        ;;
      --skip-assets)
        skip_assets=1
        shift
        ;;
      --skip-optimize)
        skip_optimize=1
        shift
        ;;
      --only-deps)
        only_mode="deps"
        shift
        ;;
      --only-assets)
        only_mode="assets"
        shift
        ;;
      --only-optimize)
        only_mode="optimize"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown option: $1"
        usage
        exit 1
        ;;
    esac
  done

  # Detect platform
  PLATFORM=$(detect_platform)
  if [ "$PLATFORM" = "unknown" ]; then
    die "Unable to detect operating system."
  fi
  log "Detected platform: ${PLATFORM}."

  # Execute based on mode
  case "$only_mode" in
    deps)
      ensure_node
      ensure_npm
      if [ "${SKIP_NPM_INSTALL:-0}" != "1" ]; then
        install_project_dependencies
      fi
      ;;
    assets)
      check_assets
      ;;
    optimize)
      optimize_assets
      ;;
    *)
      # Full setup workflow
      if [ "$skip_deps" -eq 0 ]; then
        ensure_node
        ensure_npm
        if [ "${SKIP_NPM_INSTALL:-0}" != "1" ]; then
          install_project_dependencies
        fi
      fi

      if [ "$skip_assets" -eq 0 ]; then
        check_assets
      fi

      if [ "$skip_optimize" -eq 0 ]; then
        optimize_assets
      fi

      report_optional_dependencies
      ;;
  esac

  log "Setup complete!"
}

main "$@"
