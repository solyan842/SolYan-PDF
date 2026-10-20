; sReader only: register PDF capabilities for the Windows Default Apps list.
; Do NOT write UserChoice/change the default program or touch sTool.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\SolYan.sReader.PDF" "" "sReader PDF document"
  WriteRegStr HKCU "Software\Classes\SolYan.sReader.PDF\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr HKCU "Software\Classes\SolYan.sReader.PDF\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  WriteRegStr HKCU "Software\SolYan\sReader PDF\Capabilities" "ApplicationName" "sReader PDF"
  WriteRegStr HKCU "Software\SolYan\sReader PDF\Capabilities" "ApplicationDescription" "Lightweight local PDF reader for Windows"
  WriteRegStr HKCU "Software\SolYan\sReader PDF\Capabilities\FileAssociations" ".pdf" "SolYan.sReader.PDF"
  WriteRegStr HKCU "Software\RegisteredApplications" "sReader PDF" "Software\SolYan\sReader PDF\Capabilities"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Only delete our own registered-app entry, never the user's chosen default.
  ReadRegStr $R8 HKCU "Software\RegisteredApplications" "sReader PDF"
  StrCmp $R8 "Software\SolYan\sReader PDF\Capabilities" 0 +2
    DeleteRegValue HKCU "Software\RegisteredApplications" "sReader PDF"
  DeleteRegKey HKCU "Software\SolYan\sReader PDF\Capabilities"
  DeleteRegKey /ifempty HKCU "Software\SolYan\sReader PDF"
  DeleteRegKey /ifempty HKCU "Software\SolYan"
  DeleteRegKey HKCU "Software\Classes\SolYan.sReader.PDF"
!macroend
