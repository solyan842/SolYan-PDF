function Request-StoolWindowClose {
  param([Parameter(Mandatory)]$Owner)
  $requested=$Owner.CloseMainWindow()
  if(-not $requested){throw "CloseMainWindow refused request for owned PID $($Owner.Id)"}
  # Acknowledges WM_CLOSE only. The caller must independently prove exit and
  # descendant cleanup; this response alone never means lifecycle acceptance.
  @{mode='Close';ownerPid=$Owner.Id;closeRequested=$true}
}
