!macro customInit
  ; 0.0.92 and older clients pass /S before handing off an in-app update.
  ; Keep the emergency upgrade visible so NSIS owns truthful install progress
  ; and can surface any failure instead of leaving ORF closed without feedback.
  SetSilent normal
!macroend
