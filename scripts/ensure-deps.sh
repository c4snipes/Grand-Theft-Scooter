#!/usr/bin/env bash
set -euo pipefail

MIN_NODE_MAJOR=18
PREFERRED_NODE_MAJOR=20
NODESOURCE_SERIES="${PREFERRED_NODE_MAJOR}.x"
NVM_VERSION="v0.39.7"

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

report_optional_dependencies() {
  if ! command_exists docker; then
    warn "Docker not detected. It is optional but required for container workflows."
  fi
  if ! command_exists make; then
    warn "GNU Make not detected. Optional Make targets will not be available."
  fi
}

main() {
  local script_dir repo_root
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  repo_root=$(cd "${script_dir}/.." && pwd)
  cd "${repo_root}"

  PLATFORM=$(detect_platform)
  if [ "$PLATFORM" = "unknown" ]; then
    die "Unable to detect operating system."
  fi
  log "Detected platform: ${PLATFORM}."

  ensure_node
  ensure_npm
  if [ "${SKIP_NPM_INSTALL:-0}" = "1" ]; then
    log "Skipping npm dependency installation (SKIP_NPM_INSTALL=1)."
  else
    install_project_dependencies
  fi
  report_optional_dependencies
  log "Environment looks good."
}

main "$@"
