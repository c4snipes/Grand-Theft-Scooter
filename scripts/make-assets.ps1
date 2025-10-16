# PowerShell wrapper to run the project's asset checks on Windows.
# Usage: .\scripts\make-assets.ps1

$ErrorActionPreference = 'Stop'

function Run-PythonCheck {
    # Try common ways to invoke Python on Windows.
    $candidates = @("python3", "python", "py -3")
    foreach ($cmd in $candidates) {
        try {
            Write-Host "Trying: $cmd scripts/check_assets.py"
            & $cmd scripts/check_assets.py; return $LASTEXITCODE
        } catch {
            # ignore and try next
        }
    }
    Write-Error "Could not find a usable Python interpreter. Install Python 3 and ensure 'python' or 'py' is on PATH."
    return 1
}

$exit = Run-PythonCheck
if ($exit -ne 0) { exit $exit }
exit 0
