param(
  [string]$VmName = "WechatVM",
  [string]$VmRoot = "D:\HyperV\WechatVM",
  [string]$IsoPath = "E:\Win11_23H2_Chinese_Simplified_x64v2.iso",
  [int64]$DiskSizeBytes = 80GB,
  [string]$LocalPassword = $env:WECHATVM_PASSWORD
)

$ErrorActionPreference = "Stop"

$logPath = "D:\HyperV\wechatvm-rebuild.log"
$dismOutPath = "D:\HyperV\wechatvm-dism-output.log"
$dismLogPath = "D:\HyperV\wechatvm-dism.log"
$tempDir = "D:\HyperV\WechatVMBuild"
$winLetter = "T"
$efiLetter = "R"

if ([string]::IsNullOrWhiteSpace($LocalPassword)) {
  throw "Set -LocalPassword or WECHATVM_PASSWORD before rebuilding the VM."
}

$password = $LocalPassword

New-Item -ItemType Directory -Force -Path "D:\HyperV" | Out-Null
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

function Log([string]$message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  Add-Content -LiteralPath $logPath -Value $line
  Write-Host $line
}

function Dismount-IfMounted([string]$path) {
  try {
    $image = Get-DiskImage -ImagePath $path -ErrorAction Stop
    if ($image.Attached) {
      Log "Dismounting $path"
      Dismount-DiskImage -ImagePath $path -ErrorAction SilentlyContinue
    }
  } catch {
    # Not mounted or not present.
  }
}

function Remove-PathWithRetry([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    return
  }

  for ($i = 1; $i -le 8; $i++) {
    try {
      Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
      return
    } catch {
      Log "Remove retry $i for ${path}: $($_.Exception.Message)"
      Start-Sleep -Seconds 2
    }
  }

  Remove-Item -LiteralPath $path -Recurse -Force
}

function Get-IsoDrive([string]$path) {
  $image = Get-DiskImage -ImagePath $path
  $vol = $image | Get-Volume | Select-Object -First 1
  if (-not $vol -or -not $vol.DriveLetter) {
    throw "Could not resolve ISO drive letter for $path"
  }
  return "$($vol.DriveLetter):"
}

function Write-Unattend([string]$path) {
  $content = @"
<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="specialize">
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <ComputerName>WechatVM</ComputerName>
      <TimeZone>China Standard Time</TimeZone>
    </component>
    <component name="Microsoft-Windows-Deployment" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <RunSynchronous>
        <RunSynchronousCommand wcm:action="add" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <Order>1</Order>
          <Description>Bypass network requirement</Description>
          <Path>reg add HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\OOBE /v BypassNRO /t REG_DWORD /d 1 /f</Path>
        </RunSynchronousCommand>
      </RunSynchronous>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-International-Core" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <InputLocale>0804:00000804</InputLocale>
      <SystemLocale>zh-CN</SystemLocale>
      <UILanguage>zh-CN</UILanguage>
      <UserLocale>zh-CN</UserLocale>
    </component>
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideLocalAccountScreen>true</HideLocalAccountScreen>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
        <NetworkLocation>Work</NetworkLocation>
        <ProtectYourPC>3</ProtectYourPC>
      </OOBE>
      <UserAccounts>
        <LocalAccounts>
          <LocalAccount wcm:action="add" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
            <Name>xue</Name>
            <Group>Administrators</Group>
            <Password>
              <Value>$password</Value>
              <PlainText>true</PlainText>
            </Password>
          </LocalAccount>
        </LocalAccounts>
      </UserAccounts>
      <AutoLogon>
        <Enabled>true</Enabled>
        <Username>xue</Username>
        <LogonCount>999</LogonCount>
        <Password>
          <Value>$password</Value>
          <PlainText>true</PlainText>
        </Password>
      </AutoLogon>
      <RegisteredOwner>xue</RegisteredOwner>
      <FirstLogonCommands>
        <SynchronousCommand wcm:action="add" xmlns:wcm="http://schemas.microsoft.com/WMIConfig/2002/State">
          <Order>1</Order>
          <Description>Disable sleep</Description>
          <CommandLine>cmd /c powercfg /hibernate off &amp; powercfg /change standby-timeout-ac 0 &amp; powercfg /change monitor-timeout-ac 0</CommandLine>
        </SynchronousCommand>
      </FirstLogonCommands>
    </component>
  </settings>
</unattend>
"@

  Set-Content -LiteralPath $path -Encoding UTF8 -Value $content
}

function Write-SetupComplete([string]$path) {
  $content = @"
@echo off
powercfg /hibernate off
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System" /v EnableLUA /t REG_DWORD /d 1 /f
exit /b 0
"@

  Set-Content -LiteralPath $path -Encoding ASCII -Value $content
}

Log "==== Rebuild started ===="

Log "Stopping old deployment processes"
Get-Process powershell -ErrorAction SilentlyContinue |
  Where-Object { $_.Id -ne $PID -and ($_.Id -eq 34308 -or $_.Id -eq 6772 -or $_.Id -eq 65296) } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process dism -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (Get-VM -Name $VmName -ErrorAction SilentlyContinue) {
  Log "Stopping existing VM"
  Stop-VM -Name $VmName -TurnOff -Force -ErrorAction SilentlyContinue
  Log "Removing existing VM config"
  Remove-VM -Name $VmName -Force
}

Dismount-IfMounted "$VmRoot\Virtual Hard Disks\$VmName.vhdx"
Dismount-IfMounted $IsoPath

Log "Deleting old VM files under $VmRoot"
Remove-PathWithRetry $VmRoot

New-Item -ItemType Directory -Force -Path "$VmRoot\Virtual Hard Disks" | Out-Null
$vhdPath = "$VmRoot\Virtual Hard Disks\$VmName.vhdx"

Log "Creating VM and VHD on D:"
New-VM -Name $VmName -Generation 2 -MemoryStartupBytes 4GB -Path $VmRoot -SwitchName "Default Switch" -NoVHD | Out-Null
Set-VM -Name $VmName -AutomaticCheckpointsEnabled $false -CheckpointType Disabled
Set-VMProcessor -VMName $VmName -Count 4
Set-VMMemory -VMName $VmName -DynamicMemoryEnabled $true -MinimumBytes 2GB -StartupBytes 4GB -MaximumBytes 8GB
Set-VMFirmware -VMName $VmName -EnableSecureBoot On -SecureBootTemplate MicrosoftWindows
New-VHD -Path $vhdPath -SizeBytes $DiskSizeBytes -Dynamic | Out-Null
Add-VMHardDiskDrive -VMName $VmName -Path $vhdPath

Log "Partitioning VHD"
$diskpartPath = Join-Path $tempDir "partition-wechatvm.txt"
@"
select vdisk file="$vhdPath"
attach vdisk
clean
convert gpt
create partition efi size=100
format quick fs=fat32 label="System"
assign letter=$efiLetter
create partition msr size=16
create partition primary
format quick fs=ntfs label="Windows"
assign letter=$winLetter
exit
"@ | Set-Content -LiteralPath $diskpartPath -Encoding ASCII
diskpart.exe /s $diskpartPath | Tee-Object -FilePath (Join-Path $tempDir "diskpart.log")
if (-not (Test-Path "$efiLetter`:\")) {
  throw "EFI drive $efiLetter`: was not assigned"
}
if (-not (Test-Path "$winLetter`:\")) {
  throw "Windows drive $winLetter`: was not assigned"
}

Log "Mounting Windows ISO"
$mount = Mount-DiskImage -ImagePath $IsoPath -PassThru
$isoDrive = Get-IsoDrive $IsoPath
$installImage = Join-Path $isoDrive "sources\install.wim"
if (-not (Test-Path -LiteralPath $installImage)) {
  $installImage = Join-Path $isoDrive "sources\install.esd"
}
if (-not (Test-Path -LiteralPath $installImage)) {
  throw "install.wim/install.esd not found in $isoDrive"
}

Log "Using Windows image index 4"
$index = 4
Log "Applying image index $index from $installImage"

if (Test-Path -LiteralPath $dismOutPath) { Remove-Item -LiteralPath $dismOutPath -Force }
if (Test-Path -LiteralPath $dismLogPath) { Remove-Item -LiteralPath $dismLogPath -Force }

$dismArgs = @(
  "/Apply-Image",
  "/ImageFile:$installImage",
  "/Index:$index",
  "/ApplyDir:$winLetter`:\",
  "/ScratchDir:$tempDir",
  "/LogPath:$dismLogPath"
)
$proc = Start-Process -FilePath "$env:SystemRoot\System32\dism.exe" -ArgumentList $dismArgs -Wait -PassThru -NoNewWindow -RedirectStandardOutput $dismOutPath -RedirectStandardError "$dismOutPath.err"
Log "DISM exited with code $($proc.ExitCode)"
if ($proc.ExitCode -ne 0) {
  Get-Content -LiteralPath $dismOutPath -Tail 80 | ForEach-Object { Log "DISM: $_" }
  throw "DISM failed with exit code $($proc.ExitCode)"
}

Log "Writing unattend and setup scripts"
$panther = "$winLetter`:\Windows\Panther"
$setupScripts = "$winLetter`:\Windows\Setup\Scripts"
New-Item -ItemType Directory -Force -Path $panther, $setupScripts | Out-Null
Write-Unattend (Join-Path $panther "Unattend.xml")
Write-SetupComplete (Join-Path $setupScripts "SetupComplete.cmd")

Log "Writing UEFI boot files"
bcdboot.exe "$winLetter`:\Windows" /s "$efiLetter`:" /f UEFI | Tee-Object -FilePath (Join-Path $tempDir "bcdboot.log")

Log "Dismounting images"
Dismount-DiskImage -ImagePath $IsoPath -ErrorAction SilentlyContinue
Dismount-DiskImage -ImagePath $vhdPath -ErrorAction SilentlyContinue

Log "Setting VM boot device and starting VM"
$disk = Get-VMHardDiskDrive -VMName $VmName | Where-Object { $_.Path -eq $vhdPath } | Select-Object -First 1
Set-VMFirmware -VMName $VmName -FirstBootDevice $disk
Start-VM -Name $VmName

Log "==== Rebuild completed; VM started ===="
