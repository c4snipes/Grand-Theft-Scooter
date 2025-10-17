#Requires -Version 5.1
<#
.SYNOPSIS
    Unified setup script for Grand Theft Scooter game development (Windows).

.DESCRIPTION
    Combines dependency checking (Node.js, npm), asset verification (GLTF models),
    and asset optimization (glTF-Transform + Draco compression).

.PARAMETER SkipDeps
    Skip dependency installation (Node.js/npm)

.PARAMETER SkipAssets
    Skip asset verification

.PARAMETER SkipOptimize
    Skip asset optimization

.PARAMETER OnlyDeps
    Only check/install dependencies

.PARAMETER OnlyAssets
    Only verify assets

.PARAMETER OnlyOptimize
    Only optimize assets

.EXAMPLE
    .\setup.ps1
    Run full setup (deps + assets + optimize)

.EXAMPLE
    .\setup.ps1 -SkipOptimize
    Setup without asset optimization

.EXAMPLE
    .\setup.ps1 -OnlyAssets
    Only verify game assets
#>

[CmdletBinding()]
param(
    [switch]$SkipDeps,
    [switch]$SkipAssets,
    [switch]$SkipOptimize,
    [switch]$OnlyDeps,
    [switch]$OnlyAssets,
    [switch]$OnlyOptimize,
    [switch]$Help
)

# ========================================
# Configuration
# ========================================
$MIN_NODE_MAJOR = 18
$PREFERRED_NODE_MAJOR = 20
$GLTF_IMAGE_TAG = "gltf-transform:draco"

# ========================================
# Logging Utilities
# ========================================
function Write-Log {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Warning {
    param([string]$Message)
    Write-Host "WARN: $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
}

function Exit-WithError {
    param([string]$Message)
    Write-Error $Message
    exit 1
}

# ========================================
# Utility Functions
# ========================================
function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-PythonCommand {
    if (Test-CommandExists "python") {
        return @("python")
    }
    if (Test-CommandExists "python3") {
        return @("python3")
    }
    if (Test-CommandExists "py") {
        return @("py", "-3")
    }
    return @()
}

function Get-NodeMajorVersion {
    try {
        $version = node -v 2>$null
        if ($version -match '^v(\d+)\.') {
            return [int]$Matches[1]
        }
    } catch {
        return $null
    }
    return $null
}

# ========================================
# Node.js Installation
# ========================================
function Install-NodeViaWinget {
    Write-Log "Installing Node.js via winget..."
    try {
        winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return $true
    } catch {
        Write-Warning "winget installation failed: $_"
        return $false
    }
}

function Install-NodeViaChocolatey {
    Write-Log "Installing Node.js via Chocolatey..."
    try {
        choco install nodejs-lts -y --no-progress
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return $true
    } catch {
        Write-Warning "Chocolatey installation failed: $_"
        return $false
    }
}

function Install-NodeViaInstaller {
    Write-Log "Please download and install Node.js manually from:"
    Write-Host "  https://nodejs.org/en/download/" -ForegroundColor Green
    Write-Host ""
    Write-Log "After installation, restart PowerShell and run this script again."
    exit 0
}

function Ensure-Node {
    $major = Get-NodeMajorVersion
    
    if ($null -ne $major -and $major -ge $MIN_NODE_MAJOR) {
        Write-Log "Detected Node.js $(node -v)."
        return
    }
    
    if ($null -ne $major) {
        Write-Warning "Node.js $(node -v) is below required version $MIN_NODE_MAJOR."
    } else {
        Write-Log "Node.js not found."
    }

    # Try installation methods in order
    if (Test-CommandExists "winget") {
        if (Install-NodeViaWinget) {
            $major = Get-NodeMajorVersion
            if ($null -eq $major -or $major -lt $MIN_NODE_MAJOR) {
                Exit-WithError "Node.js installation via winget succeeded but version is still too old."
            }
            Write-Log "Node.js $(node -v) installed successfully."
            return
        }
    }

    if (Test-CommandExists "choco") {
        if (Install-NodeViaChocolatey) {
            $major = Get-NodeMajorVersion
            if ($null -eq $major -or $major -lt $MIN_NODE_MAJOR) {
                Exit-WithError "Node.js installation via Chocolatey succeeded but version is still too old."
            }
            Write-Log "Node.js $(node -v) installed successfully."
            return
        }
    }

    # If all automated methods fail, guide user to manual installation
    Install-NodeViaInstaller
}

function Ensure-Npm {
    if (-not (Test-CommandExists "npm")) {
        Exit-WithError "npm is unavailable even though Node.js is installed."
    }
    Write-Log "Detected npm $(npm -v)."
}

function Install-ProjectDependencies {
    if ((Test-Path "node_modules") -and (Test-Path "package-lock.json")) {
        Write-Log "node_modules already present; skipping npm ci."
        return
    }
    
    if (Test-Path "package-lock.json") {
        Write-Log "Installing npm dependencies with npm ci..."
        npm ci
    } else {
        Write-Log "Installing npm dependencies with npm install..."
        npm install
    }
}

# ========================================
# Asset Verification (Python-based)
# ========================================
function Test-Assets {
    Write-Log "Verifying game assets..."
    
    $pythonCmd = Get-PythonCommand
    if ($pythonCmd.Count -eq 0) {
        Write-Warning "Python 3 runtime not found. Skipping asset verification."
        Write-Warning "Install Python 3 from https://www.python.org/ to enable asset checks."
        return
    }

    $checkScript = Join-Path $RepoRoot "scripts" "check_assets.py"
    if (-not (Test-Path $checkScript)) {
        Write-Warning "Asset check script not found at $checkScript. Skipping."
        return
    }

    try {
        $command = $pythonCmd[0]
        $args = @()
        if ($pythonCmd.Count -gt 1) {
            $args += $pythonCmd[1..($pythonCmd.Count - 1)]
        }
        $args += @($checkScript, "--root", $RepoRoot)

        Write-Log "Running $($pythonCmd -join ' ') $($args[0]) --root ..."
        & $command @args
        if ($LASTEXITCODE -ne 0) {
            Exit-WithError "Asset verification failed. Please ensure all required assets are present."
        }
        Write-Log "Asset verification passed."
    } catch {
        Exit-WithError "Asset verification failed: $_"
    }
}

# ========================================
# Asset Optimization
# ========================================
function Test-Docker {
    return Test-CommandExists "docker"
}

function Test-GltfCli {
    return Test-CommandExists "gltf-transform"
}

function Build-GltfImage {
    if (-not (Test-Docker)) {
        return $false
    }

    $dockerContext = Join-Path $RepoRoot "docker" "gltf-transform"
    $dockerfile = Join-Path $dockerContext "Dockerfile"
    
    if (-not (Test-Path $dockerfile)) {
        Write-Warning "glTF-Transform Dockerfile not found at $dockerfile"
        return $false
    }

    try {
        docker image inspect $GLTF_IMAGE_TAG 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
    } catch {
        # Image doesn't exist, build it
    }

    Write-Log "Building Docker image $GLTF_IMAGE_TAG..."
    try {
        docker build -t $GLTF_IMAGE_TAG $dockerContext
        return $true
    } catch {
        Write-Warning "Failed to build Docker image: $_"
        return $false
    }
}

function Invoke-GltfCli {
    param([string[]]$Arguments)
    
    if (Test-Docker) {
        $repoPath = $RepoRoot -replace '\\', '/'
        if ($repoPath -match '^[A-Z]:') {
            # Convert Windows path to Docker volume format: C:\path -> /c/path
            $repoPath = $repoPath -replace '^([A-Z]):', { "/$($_.Groups[1].Value.ToLower())" }
        }
        docker run --rm -v "${repoPath}:/workspace" $GLTF_IMAGE_TAG $Arguments
    } else {
        gltf-transform $Arguments
    }
}

function Optimize-Assets {
    Write-Log "Optimizing game assets..."

    $hasDocker = Test-Docker
    $hasGltfCli = Test-GltfCli

    if ($hasDocker) {
        if (-not (Build-GltfImage)) {
            Write-Warning "Docker image build failed. Falling back to local CLI."
            $hasDocker = $false
        }
    }

    if (-not $hasDocker -and -not $hasGltfCli) {
        Write-Warning "Neither Docker nor gltf-transform CLI found."
        Write-Warning "Install gltf-transform (npm install -g @gltf-transform/cli) or enable Docker."
        Write-Warning "Skipping asset optimization."
        return
    }

    $assetsDir = Join-Path $RepoRoot "public" "assets"
    if (-not (Test-Path $assetsDir)) {
        Write-Warning "Assets directory not found at $assetsDir. Skipping optimization."
        return
    }

    $files = Get-ChildItem -Path $assetsDir -Recurse -Include "*.glb", "*.gltf" -File
    
    if ($files.Count -eq 0) {
        Write-Log "No GLB/GLTF assets found to optimize."
        return
    }

    $optimized = 0
    foreach ($file in $files) {
        $relPath = $file.FullName.Substring($RepoRoot.Length + 1)
        $tmpPath = "$relPath.tmp"

        Write-Log "Optimizing $relPath"

        try {
            Invoke-GltfCli @(
                "optimize",
                $relPath,
                $tmpPath,
                "--compress", "draco",
                "--texture-compress", "webp",
                "--texture-size", "2048",
                "--simplify", "false"
            ) 2>$null

            if ($LASTEXITCODE -eq 0) {
                Move-Item -Path (Join-Path $RepoRoot $tmpPath) -Destination $file.FullName -Force
                $optimized++
            } else {
                Write-Warning "Failed to optimize $relPath"
                Remove-Item -Path (Join-Path $RepoRoot $tmpPath) -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Warning "Failed to optimize $relPath : $_"
            Remove-Item -Path (Join-Path $RepoRoot $tmpPath) -ErrorAction SilentlyContinue
        }
    }

    Write-Log "Optimized $optimized asset(s)."
}

# ========================================
# Reporting
# ========================================
function Report-OptionalDependencies {
    if (-not (Test-CommandExists "docker")) {
        Write-Warning "Docker not detected. It is optional but required for container workflows."
    }
    if (-not (Test-CommandExists "make")) {
        Write-Warning "GNU Make not detected. Optional Make targets will not be available."
    }
    if ((Get-PythonCommand).Count -eq 0) {
        Write-Warning "Python not detected. Asset verification will be skipped."
    }
}

# ========================================
# Main Entry Point
# ========================================
function Show-Usage {
    Get-Help $PSCommandPath -Detailed
}

function Main {
    $script:RepoRoot = Split-Path -Parent $PSScriptRoot
    Set-Location $RepoRoot

    if ($Help) {
        Show-Usage
        exit 0
    }

    Write-Log "Detected platform: Windows"

    # Determine execution mode
    if ($OnlyDeps) {
        Ensure-Node
        Ensure-Npm
        if (-not $env:SKIP_NPM_INSTALL) {
            Install-ProjectDependencies
        }
    }
    elseif ($OnlyAssets) {
        Test-Assets
    }
    elseif ($OnlyOptimize) {
        Optimize-Assets
    }
    else {
        # Full setup workflow
        if (-not $SkipDeps) {
            Ensure-Node
            Ensure-Npm
            if (-not $env:SKIP_NPM_INSTALL) {
                Install-ProjectDependencies
            }
        }

        if (-not $SkipAssets) {
            Test-Assets
        }

        if (-not $SkipOptimize) {
            Optimize-Assets
        }

        Report-OptionalDependencies
    }

    Write-Log "Setup complete!"
}

# Run main function
Main
