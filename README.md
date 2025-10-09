# Grand Theft Scooter 🛵
### A sweet old grandma has had enough of the mall's slow pace. Time to wreak havoc! 💥
A high-speed, combo-driven arcade game where you zoom through a bustling shopping mall on a mobility scooter, causing chaos and racking up points by colliding with objects and people.


## Prerequisites    
To set up the project locally, ensure you have the following installed: 
- Node.js 18 or newer (Node 20.x is preferred). npm ships with Node; Windows users can grab the installer from [nodejs.org](https://nodejs.org), leave the "Add to PATH" box checked, then reopen PowerShell/Git Bash afterward.
- Optional: Docker Desktop (Windows/macOS) or Docker Engine (Linux) if you want to run the containerized dev stack.
- Optional: GNU Make (pre-installed on macOS/Linux; on Windows install via [Chocolatey](https://chocolatey.org/packages/make) `choco install make`, [winget](https://learn.microsoft.com/windows/package-manager/winget/) `winget install GnuWin32.Make`, or the [MSYS2](https://www.msys2.org/) toolchain).

The helper script `./scripts/ensure-deps.sh` checks your operating system, confirms Node/npm versions, installs Node when possible, and reports whether Docker and Make are available. Run it anytime you want to double-check your environment.

## Step-by-Step Setup
1. **Confirm tooling is ready** 
   - Run `./scripts/ensure-deps.sh` (or `bash scripts/ensure-deps.sh` on Windows without WSL) to verify Node/npm and optional tools.
   - Manual check if you prefer:
     ```sh
     node -v
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

## Optional Workflows
### Use Make Shortcuts
If GNU Make is installed, the same flow is available through convenience targets:
```sh
make help          # show command reference
make ensure-deps   # runs ensure-deps.sh without installing node_modules
make setup         # runs ensure-deps + npm ci
make dev-local     # npm run dev -- --host 0.0.0.0 --port 5173
make build         # npm run build
make preview       # npm run preview -- --host 0.0.0.0 --port 8080
make check         # npm run lint/typecheck/test
make doctor        # ensure-deps + check
make dev           # docker compose -f docker-compose.dev.yml up
make docker-dev    # docker compose -f docker-compose.dev.yml up --build
make docker-logs   # docker compose logs -f
make docker-shell  # docker compose exec web sh
make up            # docker compose up -d
make down          # docker compose -f docker-compose.dev.yml down
make clean         # rm -rf node_modules dist
make docker-build  # docker build -t grand-theft-scooter .
make docker-run    # docker run --rm -p 8080:80 grand-theft-scooter
make docker-tag    # tag image with $(REPO):latest (requires env)
make docker-push   # push tagged image to $(REPO)
```

### Develop with Docker
Run the project without installing Node locally:
```sh
docker compose -f docker-compose.dev.yml up --build
# Press Ctrl+C to stop the stack when finished
docker compose -f docker-compose.dev.yml down
```
Make wrappers (`make dev`, `make docker-dev`, `make up`, `make down`, `make docker-logs`, `make docker-shell`) are available if Make is installed.

> **Can’t run Docker?** No problem. Everything works with the local Node workflow (`npm ci`, `npm run dev`, `npm run build`). Docker is optional and just mirrors the same steps inside a container for consistent environments. Only worry about Docker if your team uses it for deployment or you need parity with CI.

### Optimize 3D Assets (Draco/WebP)
Run the `gltf-transform` optimizer in a reproducible way:
```sh
./scripts/optimize-assets.sh
```
- If Docker is available, the script builds the lightweight image in `docker/gltf-transform/` and runs `gltf-transform optimize --compress draco --texture-compress webp` for every `.glb`/`.gltf` under `public/assets`.
- Without Docker it falls back to a local CLI (`npm install -g gltf-transform`) so you can still compress assets on a locked-down machine.
- The optimized file replaces the original; rerunning the script is safe and idempotent.
- Add new 3D content, run the script once, and commit the updated artifacts (including any generated `.bin` or texture files).

## Everyday Commands
```sh
# Build artifacts
npm run build
# or: make build

# Preview the production build (port 8080)
npm run preview -- --host 0.0.0.0 --port 8080
# or: make preview

# Clean workspace artifacts
rm -rf node_modules dist                   # macOS/Linux
Remove-Item -Recurse -Force node_modules, dist  # Windows PowerShell
# or: make clean

# Docker images (after npm run build)
docker build -t grand-theft-scooter .
docker run --rm -p 8080:80 grand-theft-scooter
# or: make docker-build && make docker-run

# Testing & linting (currently stubbed)
npm run lint
npm run typecheck
npm test
# or: make lint / make typecheck / make test

# All checks at once
make check          # lint + typecheck + test
make doctor         # ensure-deps + make check
```

## Gameplay Overview
- **Setting**: A procedurally assembled 3D shopping mall full of kiosks, displays, and crowds to weave through at high speed.
- **Objective**: Rack up points by colliding with interactive props, food stands, benches, and other environmental objects.
- **High-Value Targets**: Running over unsuspecting mall-goers yields the biggest score multipliers—just like a mobility-scooter take on *Hungry Shark*.
- **Controls**: Simple keyboard controls for acceleration, braking, and steering. Combo system rewards chaining collisions without stopping.

## Troubleshooting
### General
- `npm ci` fails with `Unsupported engine`: check your Node version with `node -v`; rerun `./scripts/ensure-deps.sh` to install a compatible release.
- `npm run dev` reports `Port 5173 is already in use`: stop other Vite/Node processes or pass `--port <new-port>` to the dev command.
- Docker errors about `permission denied` on bind mounts: make sure the repo directory is inside your user home and that Docker Desktop/Engine has access to it.
- `docker compose` command not found: upgrade to a recent Docker release or replace `docker compose` with `docker-compose`.

### Windows
- `'npm' is not recognized'`: Node.js is missing from PATH. Reinstall Node.js, ensure "Automatically install the necessary tools" is unchecked unless you need them, and keep the PATH option enabled. After installation, open a fresh PowerShell/Git Bash window and rerun `node -v`, or rerun `./scripts/ensure-deps.sh`.
- `'make' is not recognized'`: Install GNU Make (see the Prerequisites section) or use the npm/Docker commands directly.
- `npm.ps1 cannot be loaded because running scripts is disabled`: PowerShell’s execution policy is blocking the shim that npm installs. Fix options:
  1. Open PowerShell **as Administrator**, then run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force`. Close the window, reopen PowerShell normally, and re-run `npm -v`.
  2. If you cannot change the policy permanently, run `powershell -ExecutionPolicy Bypass` (or `Set-ExecutionPolicy -Scope Process Bypass`) before invoking npm commands in that session.
  3. As a last resort, skip the PowerShell script entirely by calling the CMD shim (`npm.cmd run dev`, `npx.cmd vite`, etc.).
  You can inspect current policy settings with `Get-ExecutionPolicy -List`. Corporate machines may have policies locked; in that case stick with option 2 or 3 above.
