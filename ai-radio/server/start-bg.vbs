' Abyss Radio API 独立后台启动(孤儿进程, 脱离 Hermes 客户端生命周期)
' 用法: wscript "E:\VM\AI_audio\ai-radio\server\start-bg.vbs"
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' 杀掉占用 4000 的旧进程
shell.Run "cmd /c netstat -ano | findstr :4000 > %TEMP%\abyss4000.txt", 0, True
Set f = fso.OpenTextFile(shell.ExpandEnvironmentStrings("%TEMP%\abyss4000.txt"), 1, True)
Do Until f.AtEndOfStream
  line = f.ReadLine
  parts = Split(line)
  If UBound(parts) >= 4 And InStr(line, "LISTENING") > 0 Then
    pid = parts(UBound(parts))
    shell.Run "cmd /c taskkill /PID " & pid & " /F", 0, True
  End If
Loop
f.Close

' 启动后端(独立窗口最小化)
shell.Run """C:\Program Files\nodejs\node.exe"" index.mjs", 7, False
