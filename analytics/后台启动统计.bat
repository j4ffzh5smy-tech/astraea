@echo off
rem 后台启动统计.bat —— 无窗口启动使用统计（窗口只闪一下即自动关闭）
rem 停止请运行「停止统计.bat」。开机已自动启动，一般不需要手动点。
cd /d %~dp0
start "" "C:\Users\Administrator\AppData\Local\Programs\Python\Python311\pythonw.exe" start.py
