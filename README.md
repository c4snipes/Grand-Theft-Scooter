# Grand Theft Scooter 🛵

## An old grandma has had her social security taken away by the government and now cannot buy groceries or pay her bills.

#### Desperate and hungry, she attempted one final trip to the supermarket on her trusty mobility scooter. Tragically, she collapsed from malnutrition in the parking lot, her frail hand still gripping the handlebars. But death was not the end...her restless spirit, fueled by fury at the system that abandoned her, returned from beyond the grave and fused with the very scooter that had been her last companion.

#### Now, possessed by her vengeful ghost, the scooter tears through the shopping mall at supernatural speeds, seeking the chaos and justice she was denied in life. You control this unholy union of metal and spirit in a high-speed, combo-driven arcade game where you zoom through a bustling shopping mall, causing mayhem and racking up points by colliding with objects and people.

# Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Command Reference](#command-reference)
- [Docker & GitHub Registry](#docker--github-registry)
- [Asset Management](#asset-management)
- [Everyday Commands](#everyday-commands)
- [Gameplay Overview](#gameplay-overview)
- [Troubleshooting](#troubleshooting)

## Quick Start

**Choose the fastest path for you:**

```bash
# Option 1: One command (if you have Make installed)
make start        # Installs deps + starts dev server

# Option 2: Docker (no Node.js needed locally)
make docker       # or: docker compose up

# Option 3: Manual
npm ci && npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in your browser!

## Prerequisites

To set up the project locally, ensure you have the following installed:

- Node.js 18 or newer (Node 20.x is preferred). npm ships with Node; Windows users can grab the installer from [nodejs.org](https://nodejs.org), leave the "Add to PATH" box checked, then reopen PowerShell/Git Bash afterward.
- Optional: Python 3 for asset verification
- Optional: Docker Desktop (Windows/macOS) or Docker Engine (Linux) for containerized workflows and asset optimization
- Optional: GNU Make (pre-installed on macOS/Linux; on Windows install via [Chocolatey](https://chocolatey.org/packages/make) `choco install make`, [winget](https://learn.microsoft.com/windows/package-manager/winget/) `winget install GnuWin32.Make`, or the [MSYS2](https://www.msys2.org/) toolchain).

## Setup Instructions

### Automated Setup (Recommended)

**Cross-platform unified setup script** that handles dependency installation, asset verification, and optimization:

#### Linux/macOS

```bash
./scripts/setup.sh              # Full setup
./scripts/setup.sh --only-deps  # Just install Node.js/npm + dependencies
./scripts/setup.sh --only-assets # Just verify game assets
./scripts/setup.sh --help       # Show all options
```

> `scripts/setup.sh` replaces the separate `ensure-deps.sh` and `optimize-assets.sh` helpers; use the flags above to target specific tasks.

#### Windows (PowerShell)

```powershell
.\scripts\setup.ps1              # Full setup
.\scripts\setup.ps1 -OnlyDeps    # Just install Node.js/npm + dependencies
.\scripts\setup.ps1 -OnlyAssets  # Just verify game assets
.\scripts\setup.ps1 -Help        # Show all options
```

The setup script will:

1. ✅ Detect your platform and install Node.js (if needed)
2. ✅ Install npm dependencies
3. ✅ Verify all required 3D assets are present
4. ✅ Optimize GLB/GLTF assets with Draco compression

### Manual Setup

If you prefer to set up manually:

1. **Confirm tooling is ready**

   ```sh
   node -v  # Should be 18+
   npm -v
   ```

   If either command is "not recognized" on Windows, open a new terminal; if it still fails, reinstall Node.js and ensure the PATH option was selected.

2. **Install dependencies**

   ```sh
   npm ci          # use `npm install` if you have no package-lock.json
   ```

3. **Start the dev server**

   ```sh
   npm run dev     # Vite serves http://localhost:5173
   ```

   Press `Ctrl+C` to stop the dev server when you are done.

## Command Reference

### Makefile targets

- `make help` – essential day-to-day targets
- `make help-extra` – everything else (tooling, Docker, releases)
- `make help-all` – both sections in one run

Daily drivers:

```bash
make setup   # Full setup (use SETUP_ARGS="--only-deps" or "--only-assets")
make start   # Install deps + start dev server
make dev     # Run Vite on $(HOST):$(PORT)
make check   # Lint + typecheck + tests
make build   # Production build artifacts
make docker  # Launch docker-compose stack (REBUILD=1, DETACH=1 for variants)
```

Prefer npm scripts? They still work:

```bash
npm ci             # Install dependencies
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build
```

## Docker & GitHub Registry

### Understanding Docker vs GHCR.io

**Docker** is the containerization technology (build/run containers), while **GHCR.io** (GitHub Container Registry) is a storage location for Docker images - similar to Docker Hub, but integrated with GitHub:

- **Docker Technology**: Tools like `docker build`, `docker run`, `docker compose`
- **GHCR.io Registry**: Storage at `ghcr.io/c4snipes/grand-theft-scooter`
- **Why GHCR**: Seamless GitHub Actions integration, free unlimited public images

You can pull pre-built images from GHCR or build/run locally with Docker.

### Running with Docker

```bash
# Start with docker-compose
docker compose up
# or with Make:
make docker

# Need variations?
make docker DETACH=1     # Run in background
make docker REBUILD=1    # Force image rebuild before starting

# Stop
docker compose down
# or:
make docker-stop
```

### GitHub Container Registry (ghcr.io)

This project automatically publishes Docker images to GitHub Container Registry when you push tags or commits to `main`.

**Registry location**: `ghcr.io/c4snipes/grand-theft-scooter`

#### Automated Builds (GitHub Actions)

Pushes to `main` or version tags (`v1.0.0`) automatically trigger builds via `.github/workflows/docker.yml`.

#### Manual Registry Push

```bash
# 1. Login to ghcr.io
echo $GITHUB_TOKEN | docker login ghcr.io -u c4snipes --password-stdin

# 2. Build, tag, and push (all in one)
make docker-all

# Or step by step:
make docker-build   # Build image
make docker-tag     # Tag for registry
make docker-push    # Push to ghcr.io
```

#### Pull and Run from Registry

```bash
docker pull ghcr.io/c4snipes/grand-theft-scooter:latest
docker run --rm -p 8080:80 ghcr.io/c4snipes/grand-theft-scooter:latest
# Open http://localhost:8080
```

> **Note**: By default, ghcr.io images are private. To make public, go to the package settings on GitHub and change visibility.

## Asset Management

### Verify Assets

Check that all required 3D models and textures are present:

```bash
# Using Make
make setup SETUP_ARGS="--only-assets"

# Using the unified script
./scripts/setup.sh --only-assets        # Linux/macOS
.\scripts\setup.ps1 -OnlyAssets          # Windows

# Using Python directly
python3 scripts/check_assets.py
```

### Optimize 3D Assets

Compress GLB/GLTF files with Draco and optimize textures to WebP:

```bash
# Using Make
make setup SETUP_ARGS="--only-optimize"

# Using the unified script
./scripts/setup.sh --only-optimize      # Linux/macOS
.\scripts\setup.ps1 -OnlyOptimize        # Windows
```

The optimizer:

- Uses Docker (if available) or falls back to local `gltf-transform` CLI
- Applies Draco compression to geometry
- Converts textures to WebP format (max 2048px)
- Processes all `.glb` and `.gltf` files in `public/assets`
- Overwrites original files (operation is idempotent)

### Develop with Docker

Run the project without installing Node locally:

```sh
docker compose up --build
# Press Ctrl+C to stop the stack when finished
docker compose down
```

Make wrappers (`make docker`, `make docker-stop`, `make docker-logs`, `make docker-shell`) are available if Make is installed.

> **Can't run Docker?** No problem. Everything works with the local Node workflow (`npm ci`, `npm run dev`, `npm run build`). Docker is optional and just mirrors the same steps inside a container for consistent environments. Only worry about Docker if your team uses it for deployment or you need parity with CI.

## Everyday Commands

```sh
# Build artifacts
npm run build
# or: make build

# Preview the production build (port 5173)
npm run preview -- --host 0.0.0.0 --port 5173
# or: make preview

# Clean workspace artifacts
rm -rf node_modules dist                   # macOS/Linux
Remove-Item -Recurse -Force node_modules, dist  # Windows PowerShell
# or: make clean

# Docker images (after npm run build)
# Prefer Make targets (handles paths and checks):
make docker-build   # build the production image
make docker-run     # run it on http://localhost:8080
# or, the equivalent docker commands:
docker build -f docker/Dockerfile -t grand-theft-scooter .
docker run --rm -p 8080:80 grand-theft-scooter
# NOTE: pushing images requires logging in to GHCR (see "Docker & GitHub Registry" above).

```

## Gameplay Overview

- **Setting**: A procedurally assembled 3D shopping mall full of kiosks, displays, and crowds to weave through at high speed.
- **Objective**: Rack up points by colliding with interactive props, food stands, benches, and other environmental objects.
- **High-Value Targets**: Running over unsuspecting mall-goers yields the biggest score multipliers—just like a mobility-scooter take on _Hungry Shark_.
- **Hazards**: Chase points by bowling over mall patrons riding the new character models, but colliding with security gates, maintenance barriers, cleaning robots, or the mall walls will end the run instantly.
- **Controls**: Steer with WASD or the arrow keys. Tap `R` to open the placement guide (hold `Shift+R` for an instant safe respawn), press `C` to swap between follow and free cameras, and hit `I` to toggle the telemetry dashboard.

## Troubleshooting

### General

- `npm ci` fails with `Unsupported engine`: check your Node version with `node -v`; rerun `./scripts/setup.sh` (or `.\scripts\setup.ps1` on Windows) to install a compatible release.
- `npm run dev` reports `Port 5173 is already in use`: stop other Vite/Node processes or pass `--port <new-port>` to the dev command.
- Docker errors about `permission denied` on bind mounts: make sure the repo directory is inside your user home and that Docker Desktop/Engine has access to it.
- `docker compose` command not found: upgrade to a recent Docker release or replace `docker compose` with `docker-compose`.

### Windows

- `'npm' is not recognized'`: Node.js is missing from PATH. Reinstall Node.js, ensure "Automatically install the necessary tools" is unchecked unless you need them, and keep the PATH option enabled. After installation, open a fresh PowerShell/Git Bash window and rerun `node -v`, or run `.\scripts\setup.ps1` to auto-install Node.js.
- `'make' is not recognized'`: Install GNU Make (see the Prerequisites section) or use the npm/Docker commands directly.
- `npm.ps1 cannot be loaded because running scripts is disabled`: PowerShell's execution policy is blocking the shim that npm installs. Fix options:
  1. Open PowerShell **as Administrator**, then run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force`. Close the window, reopen PowerShell normally, and re-run `npm -v`.
  2. If you cannot change the policy permanently, run `powershell -ExecutionPolicy Bypass` (or `Set-ExecutionPolicy -Scope Process Bypass`) before invoking npm commands in that session.
  3. As a last resort, skip the PowerShell script entirely by calling the CMD shim (`npm.cmd run dev`, `npx.cmd vite`, etc.).
     You can inspect current policy settings with `Get-ExecutionPolicy -List`. Corporate machines may have policies locked; in that case stick with option 2 or 3 above.
