param(
  [string]$VmName = "WechatVM",
  [string]$UserName = "xue",
  [string]$Password = "WechatVM2026!",
  [int[]]$HostPids = @(),
  [string]$LogPath = "D:\HyperV\wechatvm-cleanup.log"
)

$ErrorActionPreference = "Stop"

function Log([string]$message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  Add-Content -LiteralPath $LogPath -Value $line
  Write-Host $line
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "This script must run as Administrator."
}

$secure = ConvertTo-SecureString $Password -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential("$VmName\$UserName", $secure)

Log "==== cleanup started ===="
foreach ($hostPid in $HostPids) {
  if ($hostPid -ne $PID) {
    Log "stopping host pid=$hostPid"
    Stop-Process -Id $hostPid -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Seconds 2
Invoke-Command -VMName $VmName -Credential $cred -ErrorAction Stop -ScriptBlock {
  $currentPid = $PID
  $targets = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.Name -eq "reg.exe" -and $_.CommandLine -match "Winlogon") -or
      ($_.Name -eq "powershell.exe" -and $_.CommandLine -eq "powershell.exe -so -NoLogo -NoProfile" -and $_.ProcessId -ne $currentPid)
    }

  foreach ($target in $targets) {
    "stopping guest pid=$($target.ProcessId) name=$($target.Name) cmd=$($target.CommandLine)"
    Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
Log "==== cleanup finished ===="
