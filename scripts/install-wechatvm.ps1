param(
  [string]$VmName = "WechatVM",
  [string]$UserName = "xue",
  [string]$Password = "WechatVM2026!",
  [string]$LogPath = "D:\HyperV\wechatvm-install.log"
)

$ErrorActionPreference = "Stop"

function Log([string]$message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  Add-Content -LiteralPath $LogPath -Value $line
  Write-Host $line
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  throw "This script must run as Administrator."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $LogPath) | Out-Null
Log "==== WechatVM install started ===="

$secure = ConvertTo-SecureString $Password -AsPlainText -Force
$credentials = @(
  (New-Object System.Management.Automation.PSCredential("$VmName\$UserName", $secure)),
  (New-Object System.Management.Automation.PSCredential(".\$UserName", $secure)),
  (New-Object System.Management.Automation.PSCredential($UserName, $secure))
)

function Invoke-VMRetry([scriptblock]$script, [object[]]$ScriptArgs = @()) {
  $lastError = $null
  for ($i = 1; $i -le 90; $i++) {
    foreach ($cred in $credentials) {
      try {
        return Invoke-Command -VMName $VmName -Credential $cred -ScriptBlock $script -ArgumentList $ScriptArgs -ErrorAction Stop
      } catch {
        $lastError = $_.Exception.Message
      }
    }

    Log "Waiting for PowerShell Direct ($i/90): $lastError"
    Start-Sleep -Seconds 10
  }

  throw "Could not connect to VM through PowerShell Direct: $lastError"
}

Invoke-VMRetry { "connected:{0}:{1}" -f $env:COMPUTERNAME, $env:USERNAME } | ForEach-Object { Log $_ }

$guestScript = {
  param([string]$UserName, [string]$Password)

  $ErrorActionPreference = "Stop"
  $log = "C:\Temp\codex-wechat-install.log"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null

  function GuestLog([string]$message) {
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
    Add-Content -LiteralPath $log -Value $line
    Write-Output $line
  }

  function Find-WeChat {
    $candidates = @(
      "$env:ProgramFiles\Tencent\WeChat\WeChat.exe",
      "${env:ProgramFiles(x86)}\Tencent\WeChat\WeChat.exe",
      "$env:ProgramFiles\Tencent\Weixin\Weixin.exe",
      "${env:ProgramFiles(x86)}\Tencent\Weixin\Weixin.exe",
      "$env:LOCALAPPDATA\Tencent\WeChat\WeChat.exe",
      "$env:LOCALAPPDATA\Tencent\Weixin\Weixin.exe"
    )

    foreach ($path in $candidates) {
      if ($path -and (Test-Path -LiteralPath $path)) {
        return $path
      }
    }

    $roots = @(
      "$env:ProgramFiles\Tencent",
      "${env:ProgramFiles(x86)}\Tencent",
      "$env:LOCALAPPDATA\Tencent"
    ) | Where-Object { $_ -and (Test-Path $_) }
    foreach ($root in $roots) {
      $hit = Get-ChildItem -LiteralPath $root -Recurse -Filter "WeChat.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) {
        return $hit.FullName
      }
      $hit = Get-ChildItem -LiteralPath $root -Recurse -Filter "Weixin.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) {
        return $hit.FullName
      }
    }

    return $null
  }

  GuestLog "Configuring guest power and logon settings"
  if ([string]::IsNullOrWhiteSpace($UserName) -or [string]::IsNullOrEmpty($Password)) {
    throw "UserName/Password were not passed into the guest script."
  }

  powercfg /hibernate off | Out-Null
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change monitor-timeout-ac 0 | Out-Null
  powercfg /change disk-timeout-ac 0 | Out-Null
  $winlogon = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
  New-ItemProperty -Path $winlogon -Name AutoAdminLogon -Value "1" -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $winlogon -Name DefaultUserName -Value $UserName -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $winlogon -Name DefaultPassword -Value $Password -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $winlogon -Name DefaultDomainName -Value $env:COMPUTERNAME -PropertyType String -Force | Out-Null
  $systemPolicy = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System"
  New-Item -Path $systemPolicy -Force | Out-Null
  New-ItemProperty -Path $systemPolicy -Name DisableLockWorkstation -Value 1 -PropertyType DWord -Force | Out-Null

  $wechat = Find-WeChat
  if (-not $wechat) {
    GuestLog "WeChat not found; installing"
    $installer = "C:\Temp\WeChatSetup.exe"
    $urls = @(
      "https://dldir1.qq.com/weixin/Windows/WeChatSetup.exe",
      "https://dldir1v6.qq.com/weixin/Windows/WeChatSetup.exe"
    )

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    foreach ($url in $urls) {
      try {
        GuestLog "Downloading $url"
        Invoke-WebRequest -Uri $url -OutFile $installer -UseBasicParsing -TimeoutSec 180
        if ((Test-Path -LiteralPath $installer) -and ((Get-Item -LiteralPath $installer).Length -gt 1MB)) {
          break
        }
      } catch {
        GuestLog "Download failed from ${url}: $($_.Exception.Message)"
      }
    }

    if (-not (Test-Path -LiteralPath $installer)) {
      throw "WeChat installer was not downloaded."
    }

    GuestLog "Running WeChat installer"
    $proc = Start-Process -FilePath $installer -ArgumentList "/S" -PassThru
    if (-not $proc.WaitForExit(600000)) {
      GuestLog "Silent installer still running after timeout; leaving it to finish in background"
    } else {
      GuestLog "Installer exited with code $($proc.ExitCode)"
    }

    Start-Sleep -Seconds 15
    $wechat = Find-WeChat
  } else {
    GuestLog "WeChat already installed at $wechat"
  }

  if (-not $wechat) {
    throw "WeChat install did not produce a known executable path."
  }

  GuestLog "WeChat path: $wechat"
  $startup = [Environment]::GetFolderPath("Startup")
  $shortcutPath = Join-Path $startup "WeChat.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $wechat
  $shortcut.WorkingDirectory = Split-Path -Parent $wechat
  $shortcut.Save()
  GuestLog "Startup shortcut: $shortcutPath"

  $running = Get-Process -Name "WeChat","Weixin" -ErrorAction SilentlyContinue
  if (-not $running) {
    GuestLog "Starting WeChat"
    Start-Process -FilePath $wechat
  }

  GuestLog "==== Guest install complete ===="
  return @{
    ComputerName = $env:COMPUTERNAME
    UserName = $env:USERNAME
    WeChatPath = $wechat
    GuestLog = $log
  }
}

$result = Invoke-VMRetry -script $guestScript -ScriptArgs @($UserName, $Password)
$result | Format-List | Out-String | ForEach-Object { Log $_.TrimEnd() }
Log "==== WechatVM install finished ===="
