# Registers a Windows scheduled task that scans for new invoices every 10
# minutes, starting at logon. Run this once:
#
#   powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
#
# Remove it with:
#   Unregister-ScheduledTask -TaskName "Brisbins Invoice Checker" -Confirm:$false

$ErrorActionPreference = "Stop"

$taskName = "Brisbins Invoice Checker"
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeExe = (Get-Command node).Source

$action = New-ScheduledTaskAction `
    -Execute $nodeExe `
    -Argument "src\index.js scan" `
    -WorkingDirectory $projectRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn
$trigger.Repetition = (New-ScheduledTaskTrigger `
    -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 10) `
    -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Scans the invoice folder for bins and lids sold and updates the spreadsheet." `
    -Force | Out-Null

Write-Host "Registered scheduled task '$taskName' (every 10 minutes, from logon)."
Write-Host "Working directory: $projectRoot"
