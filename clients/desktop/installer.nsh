!macro customInit
  ; 0.0.92 and older clients pass /S before handing off an in-app update.
  ; Keep the emergency upgrade visible so NSIS owns truthful install progress
  ; and can surface any failure instead of leaving ORF closed without feedback.
  SetSilent normal
!macroend

!macro customInstallMode
  ; An in-app update must preserve the one existing installation scope instead
  ; of stopping at the assisted install-mode page. If both scopes exist, keep
  ; the page visible because choosing which installation to update is ambiguous.
  ${If} ${isUpdated}
    ${If} $hasPerUserInstallation == "1"
    ${AndIf} $hasPerMachineInstallation == "0"
      StrCpy $isForceCurrentInstall "1"
    ${ElseIf} $hasPerMachineInstallation == "1"
    ${AndIf} $hasPerUserInstallation == "0"
      StrCpy $isForceMachineInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customCheckAppRunning
  ; Avoid electron-builder's PowerShell process probe. On affected Windows
  ; machines that probe can remain alive forever and block the installer.
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 == 0
    DetailPrint "$(appClosing)"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1200
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 500
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 == 0
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY customCheckAppRunningRetry
        Quit
        customCheckAppRunningRetry:
        ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
        Sleep 500
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; In-app update mode is the source of truth for restart behavior. The updater
  ; is intentionally visible, so restart only after files, shortcuts and
  ; uninstall metadata are committed by the install section.
  ${If} ${isUpdated}
  ${AndIfNot} ${Silent}
    HideWindow
    ; StartApp cannot be expanded here because electron-builder also expands
    ; it for the assisted installer's finish page and its global variable is
    ; only legal once. Use the same launch contract directly for this early,
    ; completed-update exit path.
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
    !insertmacro quitSuccess
  ${EndIf}
!macroend
