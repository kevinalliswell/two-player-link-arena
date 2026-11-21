@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 双人默契大乱斗
echo 请在浏览器打开 http://127.0.0.1:4178
echo 保持此窗口开启；退出时按 Ctrl+C。
node server.cjs
pause
