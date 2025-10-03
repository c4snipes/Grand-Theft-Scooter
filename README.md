# Grand Theft Scooter 🛵
### A sweet old grandma has had enough of slow sidewalks and nosy neighbors. She takes her mobility scooter on a joyride through town, leaving destruction in her wake.

## Requirements
- Node.js 18 or newer (npm ships with Node). Windows users: grab the installer from [nodejs.org](https://nodejs.org), leave the "Add to PATH" box checked, then reopen PowerShell/Git Bash afterward.
- Optional: Docker Desktop (Windows/macOS) or Docker Engine (Linux) if you want to run the containerized dev stack.
- Optional: GNU Make (pre-installed on macOS/Linux; on Windows install via [Chocolatey](https://chocolatey.org/packages/make) `choco install make`, [winget](https://learn.microsoft.com/windows/package-manager/winget/) `winget install GnuWin32.Make`, or the [MSYS2](https://www.msys2.org/) toolchain).

Verify your setup after installing:
```sh
node -v
npm -v
```
If either command is "not recognized" on Windows, open a new terminal. If it still fails, reinstall Node.js and ensure the PATH option was selected.

## Local Development (Windows • macOS • Linux)
Run these commands from a terminal (PowerShell, Command Prompt, or Git Bash on Windows):

```sh
npm ci      # use `npm install` if you prefer
npm run dev
```
The dev server comes up at `http://localhost:5173`. Press `Ctrl+C` to stop it.

## Optional Make Targets
GNU Make shortcuts wrap the same workflow. If you see `'make' is not recognized` on Windows, install make using one of the methods above or stick with the npm/docker commands.

```sh
make setup   # runs npm ci
make dev     # runs docker compose -f docker-compose.dev.yml up
```

## Docker Development Stack
Docker Desktop (Windows/macOS) or Docker Engine (Linux) can run the project without installing Node locally:

```sh
docker compose -f docker-compose.dev.yml up
# Press Ctrl+C to stop the stack when finished
docker compose -f docker-compose.dev.yml down
```
Older Docker installations may still use the standalone `docker-compose` binary; swap in `docker-compose` if needed.

## Command Cheat Sheet
Every command below works on Windows, macOS, and Linux when run from a terminal or PowerShell:

```sh
# Build artifacts
npm run build

# Preview the production build (port 8080)
npm run preview -- --host 0.0.0.0 --port 8080

# Clean workspace artifacts
# macOS/Linux
rm -rf node_modules dist
# Windows PowerShell
Remove-Item -Recurse -Force node_modules, dist

# Docker images (after npm run build)
docker build -t Grand-Theft-Scooter .
docker run --rm -p 8080:80 Grand-Theft-Scooter

# Testing & linting (currently stubbed)
npm run lint
npm run typecheck
npm test
```

## Quick Troubleshooting (Windows)
- `'npm' is not recognized'`: Node.js is missing from PATH. Reinstall Node.js, ensure "Automatically install the necessary tools" is unchecked unless you need them, and keep the PATH option enabled. After installation, open a fresh PowerShell/Git Bash window and rerun `node -v`.
- `'make' is not recognized'`: Install GNU Make (see the Requirements section) or skip the Make targets and use the npm/Docker commands directly.
- `npm.ps1 cannot be loaded because running scripts is disabled`: PowerShell’s execution policy blocks npm’s shim. Either run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once in an *Administrator* PowerShell window, or call the CMD shim directly (`npm.cmd run dev`). After changing the execution policy, close and reopen PowerShell before retrying `npm -v`.
