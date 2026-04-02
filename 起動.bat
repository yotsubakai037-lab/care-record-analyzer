@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo  ケア記録 AI分析アプリ 起動中...
echo ========================================

if not exist "node_modules" (
    echo パッケージをインストールしています...
    npm install
    echo.
)

set PORT=3001
node server.js
pause
