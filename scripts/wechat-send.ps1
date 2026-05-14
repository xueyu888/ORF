param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Contact,

  [Parameter(Mandatory = $true, Position = 1)]
  [string]$Message,

  [switch]$NoSend,
  [switch]$KeepClipboard,
  [int]$SearchWaitMs = 500,
  [int]$OpenWaitMs = 700,
  [int]$SendWaitMs = 500
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WechatSendWin32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

function Get-WechatWindow {
  $candidates = Get-Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.MainWindowHandle -ne 0 -and
      ($_.ProcessName -eq "Weixin" -or $_.ProcessName -eq "WeChatAppEx")
    } |
    Sort-Object @{ Expression = { if ($_.ProcessName -eq "Weixin") { 0 } else { 1 } } }, Id

  $window = $candidates | Select-Object -First 1
  if ($null -eq $window) {
    throw "No visible WeChat/Weixin window was found. Open or unlock WeChat first."
  }

  return $window
}

function Get-ForegroundProcessName {
  $foreground = [WechatSendWin32]::GetForegroundWindow()
  $foregroundPid = 0
  [WechatSendWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid) | Out-Null
  $process = Get-Process -Id $foregroundPid -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return ""
  }

  return $process.ProcessName
}

function Focus-Window($Process) {
  $hwnd = $Process.MainWindowHandle
  [WechatSendWin32]::ShowWindow($hwnd, 9) | Out-Null
  Start-Sleep -Milliseconds 200
  [WechatSendWin32]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 300

  $foregroundName = Get-ForegroundProcessName
  if ($foregroundName -eq "LockApp") {
    throw "Windows is locked. Unlock Windows first, then run this script again."
  }
}

function Get-WindowRect($Process) {
  $rect = New-Object WechatSendWin32+RECT
  [WechatSendWin32]::GetWindowRect($Process.MainWindowHandle, [ref]$rect) | Out-Null
  if (($rect.Right -le $rect.Left) -or ($rect.Bottom -le $rect.Top)) {
    throw "Could not read the WeChat window bounds."
  }

  return $rect
}

function Click-Point([int]$X, [int]$Y) {
  [WechatSendWin32]::SetCursorPos($X, $Y) | Out-Null
  Start-Sleep -Milliseconds 80
  [WechatSendWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [WechatSendWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

$previousClipboard = $null
$hasTextClipboard = $false
if (-not $KeepClipboard) {
  try {
    $previousClipboard = Get-Clipboard -Raw -ErrorAction Stop
    $hasTextClipboard = $true
  } catch {
    $hasTextClipboard = $false
  }
}

try {
  $wechat = Get-WechatWindow
  Focus-Window $wechat

  [System.Windows.Forms.SendKeys]::SendWait("^f")
  Start-Sleep -Milliseconds 150
  Set-Clipboard -Value $Contact
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 50
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds $SearchWaitMs
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Start-Sleep -Milliseconds $OpenWaitMs

  $wechat = Get-WechatWindow
  $rect = Get-WindowRect $wechat
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  $inputX = $rect.Left + [Math]::Max(420, [int]($width * 0.55))
  $inputY = $rect.Top + $height - 24

  Click-Point $inputX $inputY
  Start-Sleep -Milliseconds 150
  Set-Clipboard -Value $Message
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 150

  if ($NoSend) {
    Write-Output "Prepared message for '$Contact' without sending."
  } else {
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Milliseconds $SendWaitMs
    Write-Output "Sent message to '$Contact'."
  }
} finally {
  if ((-not $KeepClipboard) -and $hasTextClipboard) {
    Set-Clipboard -Value $previousClipboard
  }
}
