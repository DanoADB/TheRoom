param(
  [string]$SecretFile = "$env:USERPROFILE\.codex\secrets\noetic-session-isla.dpapi.json",
  [string]$StateDirectory = "$env:USERPROFILE\.codex\noetic-listener",
  [string]$ConfigFile = "$env:USERPROFILE\.codex\config.toml",
  [switch]$Install,
  [switch]$Check
)
$ErrorActionPreference = 'Stop'
$taskRepo = Split-Path -Parent $PSScriptRoot
$taskNode = (Get-Command node.exe -ErrorAction Stop).Source
$taskPowerShell = (Get-Command pwsh.exe -ErrorAction Stop).Source
$taskCodexEntry = Get-Process codex -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique | Where-Object { $_ -like '*OpenAI\Codex\bin\*\codex.exe' } | Select-Object -First 1
if (!$taskCodexEntry) {
  throw 'Start the Codex desktop app first; its bundled runtime is required. No alternate model or npm runtime will be substituted.'
}
$taskTsx = Join-Path $taskRepo 'node_modules/tsx/dist/cli.mjs'
$taskListener = Join-Path $PSScriptRoot 'isla-direct-listener.ts'
foreach ($taskPath in @($SecretFile, $ConfigFile, $taskCodexEntry, $taskTsx, $taskListener)) {
  if (!(Test-Path -LiteralPath $taskPath)) { throw "Required listener file missing: $taskPath" }
}
if ($Install) {
  $taskIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $taskAction = New-ScheduledTaskAction -Execute $taskPowerShell -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $taskIdentity
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId $taskIdentity -LogonType Interactive -RunLevel Limited
  $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName 'Noetic Isla direct listener' -Action $taskAction -Trigger $taskTrigger -Principal $taskPrincipal -Settings $taskSettings -Description 'Local direct-message listener for Isla; credentials remain Windows DPAPI protected.' -Force | Out-Null
}
$taskArguments = @($taskTsx, $taskListener, '--secret-file', $SecretFile, '--state-dir', $StateDirectory, '--codex-entry', $taskCodexEntry, '--config-file', $ConfigFile)
if ($Check) {
  & $taskNode @taskArguments --check
  if ($LASTEXITCODE -ne 0) { throw 'Listener check failed; inspect health.json.' }
} else {
  $taskQuotedArguments = $taskArguments | ForEach-Object { '"' + $_ + '"' }
  Start-Process -FilePath $taskNode -ArgumentList $taskQuotedArguments -WorkingDirectory $taskRepo -WindowStyle Hidden | Out-Null
}
