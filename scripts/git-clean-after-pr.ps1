param(
  [Parameter(Mandatory=$true)]
  [string]$BranchName
)

git checkout main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git pull
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git fetch --prune
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git branch -d $BranchName
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Branch was not deleted. It may not be fully merged locally."
  Write-Host "Do NOT force delete unless you are sure the PR was merged and main is up to date."
  exit $LASTEXITCODE
}

git status
