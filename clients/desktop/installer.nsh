!macro customInit
  ; 0.0.92 and older clients pass /S before handing off an in-app update.
  ; Keep the emergency upgrade visible so NSIS owns truthful install progress
  ; and can surface any failure instead of leaving ORF closed without feedback.
  SetSilent normal
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
