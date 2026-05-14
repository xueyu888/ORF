param(
  [string]$VmName = "WechatVM",
  [string]$UserName = "xue",
  [string]$Password = "WechatVM2026!",
  [string]$LogPath = "D:\HyperV\wechatvm-query.log"
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

Log "==== query started ===="
$result = Invoke-Command -VMName $VmName -Credential $cred -ErrorAction Stop -ScriptBlock {
  $paths = @(
    "C:\Temp\codex-wechat-install.log",
    "C:\Temp\WeChatSetup.exe",
    "$env:ProgramFiles\Tencent\WeChat\WeChat.exe",
    "${env:ProgramFiles(x86)}\Tencent\WeChat\WeChat.exe",
    "$env:ProgramFiles\Tencent\Weixin\Weixin.exe",
    "${env:ProgramFiles(x86)}\Tencent\Weixin\Weixin.exe"
  )

  "computer=$env:COMPUTERNAME user=$env:USERNAME"
  "time=$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
  "processes:"
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ProcessName -match "WeChat|Weixin|Setup|Tencent|winget|AppInstaller|msiexec|reg|powercfg|cmd|powershell|conhost" } |
    Select-Object Id,ProcessName,CPU,StartTime,MainWindowTitle |
    Format-Table -AutoSize |
    Out-String
  "process-command-lines:"
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "WeChat|Weixin|Setup|Tencent|winget|AppInstaller|msiexec|reg|powercfg|cmd|powershell|conhost" } |
    Select-Object ProcessId,ParentProcessId,Name,CommandLine |
    Format-List |
    Out-String
  "files:"
  foreach ($path in $paths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      $item = Get-Item -LiteralPath $path
      "{0} bytes={1} modified={2}" -f $item.FullName, $item.Length, $item.LastWriteTime
    } else {
      "missing: $path"
    }
  }
  "guest-log-tail:"
  if (Test-Path "C:\Temp\codex-wechat-install.log") {
    Get-Content -Tail 80 "C:\Temp\codex-wechat-install.log"
  }
}

$result | ForEach-Object { Log $_ }
Log "==== query finished ===="
