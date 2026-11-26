; Offline, per-user x64 installation. APPDIR holds the executable and required DLLs.
Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
Name "LexiFlow"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\LexiFlow"
RequestExecutionLevel user
SetCompressor zlib
Icon "../src-tauri/icons/icon.ico"
UninstallIcon "../src-tauri/icons/icon.ico"
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE CheckFolder
!insertmacro MUI_PAGE_DIRECTORY
!define MUI_COMPONENTSPAGE_NODESC
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

!define APPKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\LexiFlow"
Function .onInit
  SetRegView 64
  ReadRegStr $0 HKCU "${APPKEY}" "InstallLocation"
  StrCmp $0 "" +2
  StrCpy $INSTDIR $0
FunctionEnd

Function CheckFolder
  IfFileExists "$INSTDIR\LexiFlow.exe" ready
  IfFileExists "$INSTDIR\Uninstall.exe" collision
  IfFileExists "$INSTDIR\WebView2Loader.dll" collision ready
collision:
  MessageBox MB_OK "该文件夹包含其他程序。请选择单独的 LexiFlow 安装文件夹。"
  Abort
ready:
FunctionEnd

Section "LexiFlow 主程序"
  SectionIn RO
  ${IfNot} ${RunningX64}
    MessageBox MB_OK "LexiFlow 需要 64 位 Windows。"
    Abort
  ${EndIf}
  SetRegView 32
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  ${EndIf}
  ${If} $0 == ""
  ${OrIf} $0 == "0.0.0.0"
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=WebView2Runtime.exe "${RUNTIME}"
    ExecWait '"$PLUGINSDIR\WebView2Runtime.exe" /silent /install' $1
    ${If} $1 != 0
      MessageBox MB_OK "WebView2 安装失败。错误码 $1。"
      Abort
    ${EndIf}
  ${EndIf}
  ClearErrors
  SetOutPath "$INSTDIR"
  IfErrors install_failed
  SetOverwrite on
  File /oname=LexiFlow.exe "${APPDIR}/lexiflow.exe"
  !ifdef RUNTIME_DLL0
    File "${APPDIR}/${RUNTIME_DLL0}"
  !endif
  !ifdef RUNTIME_DLL1
    File "${APPDIR}/${RUNTIME_DLL1}"
  !endif
  !ifdef RUNTIME_DLL2
    File "${APPDIR}/${RUNTIME_DLL2}"
  !endif
  !ifdef RUNTIME_DLL3
    File "${APPDIR}/${RUNTIME_DLL3}"
  !endif
  IfErrors install_failed
  IfFileExists "$INSTDIR\LexiFlow.exe" +2 0
  Goto install_failed
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  IfErrors install_failed
  CreateShortcut "$SMPROGRAMS\LexiFlow.lnk" "$INSTDIR\LexiFlow.exe"
  SetRegView 64
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LexiFlow" "DisplayName" "LexiFlow"
  WriteRegStr HKCU "${APPKEY}" "DisplayIcon" '"$INSTDIR\LexiFlow.exe"'
  WriteRegStr HKCU "${APPKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LexiFlow" "DisplayVersion" "1.1.5"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\LexiFlow" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  Goto done
install_failed:
  MessageBox MB_OK "无法将程序完整写入 $INSTDIR。请关闭正在运行的 LexiFlow，并选择当前账户可写的文件夹。"
  Abort
done:
SectionEnd

Section "创建桌面快捷方式"
  SetOutPath "$INSTDIR"
  ClearErrors
  CreateShortcut "$DESKTOP\LexiFlow.lnk" "$INSTDIR\LexiFlow.exe" "" "$INSTDIR\LexiFlow.exe" 0
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "桌面快捷方式创建失败。你仍可从开始菜单打开 LexiFlow。"
  ${Else}
    SetRegView 64
    WriteRegDWORD HKCU "${APPKEY}" "DesktopShortcut" 1
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetRegView 64
  ReadRegStr $0 HKCU "${APPKEY}" "InstallLocation"
  StrCmp $0 "$INSTDIR" 0 files_only
  ReadRegDWORD $1 HKCU "${APPKEY}" "DesktopShortcut"
  ${If} $1 == 1
    Delete "$DESKTOP\LexiFlow.lnk"
  ${EndIf}
  DeleteRegKey HKCU "${APPKEY}"
  Delete "$SMPROGRAMS\LexiFlow.lnk"
files_only:
  Delete "$INSTDIR\LexiFlow.exe"
  !ifdef RUNTIME_DLL0
    Delete "$INSTDIR\${RUNTIME_DLL0}"
  !endif
  !ifdef RUNTIME_DLL1
    Delete "$INSTDIR\${RUNTIME_DLL1}"
  !endif
  !ifdef RUNTIME_DLL2
    Delete "$INSTDIR\${RUNTIME_DLL2}"
  !endif
  !ifdef RUNTIME_DLL3
    Delete "$INSTDIR\${RUNTIME_DLL3}"
  !endif
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  SetRegView 64
SectionEnd
