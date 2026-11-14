# FENICE ONE GLOBAL — one-time per-user Windows Task Scheduler setup.
# Installs only a LOCAL private research-SIGNAL automation. No broker access.
# Does not edit any API key, original journal or Directa configuration.
# Examples:
#   .\scripts\install-private-eod-autopilot.ps1 -LedgerPath "C:\Private\eod-ledger.json" -WhatIf
#   .\scripts\install-private-eod-autopilot.ps1 -LedgerPath "C:\Private\eod-ledger.json" -CommitSignals
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$LedgerPath,
  [switch]$CommitSignals
)
$ErrorActionPreference = 'Stop'
$taskName = 'FENICE ONE GLOBAL Private EOD Signal'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runner = Join-Path $repo 'scripts\run-one-global-private-eod-autopilot.mjs'
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
  throw 'FENICE_AUTOPILOT_RUNNER_NOT_FOUND'
}
$ledger = (Resolve-Path -LiteralPath $LedgerPath -ErrorAction Stop).Path
if (-not (Test-Path -LiteralPath $ledger -PathType Leaf)) {
  throw 'FENICE_ORIGINAL_PRIVATE_LEDGER_REQUIRED'
}
$repoFull = [System.IO.Path]::GetFullPath($repo).TrimEnd([char]'\')
$ledgerFull = [System.IO.Path]::GetFullPath($ledger)
if ($ledgerFull.StartsWith($repoFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'FENICE_PRIVATE_LEDGER_MUST_BE_OUTSIDE_PUBLIC_REPO'
}
if ($ledgerFull.Contains('"') -or $ledgerFull.Contains([char]10) -or $ledgerFull.Contains([char]13)) {
  throw 'FENICE_PRIVATE_LEDGER_PATH_UNSAFE'
}
# Confirm this is an existing strict journal without exposing its contents.
$existingJournal = Get-Content -LiteralPath $ledgerFull -Raw -Encoding UTF8 | ConvertFrom-Json
if ($existingJournal.mode -ne 'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER_V1' -or
    $existingJournal.liveTradingAllowed -ne $false -or
    $existingJournal.brokerConnectivityAllowed -ne $false) {
  throw 'FENICE_ORIGINAL_STRICT_JOURNAL_REQUIRED'
}
$nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction Stop
$nodePath = $nodeCommand.Source
$nodeVersion = (& $nodePath --version)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(2[2-9]|[3-9][0-9])\.') {
  throw 'FENICE_NODE22_OR_HIGHER_REQUIRED'
}
# The scheduled user session must already have the key in its own persistent
# environment. Never echo it, ask for it in a CLI argument or write it here.
$hasUserKey = -not [string]::IsNullOrWhiteSpace(
  [Environment]::GetEnvironmentVariable('ALPHA_VANTAGE_API_KEY', 'User'))
$hasMachineKey = -not [string]::IsNullOrWhiteSpace(
  [Environment]::GetEnvironmentVariable('ALPHA_VANTAGE_API_KEY', 'Machine'))
if (-not ($hasUserKey -or $hasMachineKey)) {
  throw 'FENICE_EXISTING_PERSISTENT_ALPHA_KEY_REQUIRED_NO_KEY_CHANGES'
}
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  throw 'FENICE_TASK_ALREADY_EXISTS_NO_OVERWRITE'
}
$localZone = (Get-TimeZone).Id
if ($localZone -ne 'W. Europe Standard Time') {
  throw 'FENICE_TASK_REQUIRES_WINDOWS_ROME_TIME_ZONE'
}
$arguments = '"' + $runner + '" --ledger="' + $ledgerFull + '"'
if ($CommitSignals) { $arguments += ' --commit' }
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $arguments -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At '23:30'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
if ($PSCmdlet.ShouldProcess($taskName, 'Register LOCAL non-broker EOD private research scheduler')) {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  $installed = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
  if (-not $installed -or $installed.Actions.Count -ne 1) {
    throw 'FENICE_TASK_REGISTRATION_UNVERIFIED'
  }
  Write-Output ('FENICE local task installed. Time: Mon-Fri 23:30 Europe/Rome. Private SIGNAL commit enabled: ' + $CommitSignals.ToString() + '. Directa: DISABLED.')
}
