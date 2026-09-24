@echo off
chcp 65001 >nul
cd /d %~dp0
echo 正在停止后台统计……
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name like '%%python%%'\" | Where-Object { $_.CommandLine -match 'start\.py|server\.py' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
taskkill /F /IM cloudflared.exe 2>nul
echo 已停止。tracker.json 会被置空并推送，线上游戏不再发心跳。
powershell -NoProfile -Command "Set-Content -Path '..\tracker.json' -Value '{\"endpoint\": null}' -Encoding UTF8"
git -C .. add tracker.json
git -C .. commit -m "关闭统计入口" >nul 2>&1
git -C .. push
pause
