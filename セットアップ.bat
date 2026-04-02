@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo  初回セットアップ
echo ========================================

REM Python確認
python --version >nul 2>&1
if errorlevel 1 (
    echo [エラー] Pythonがインストールされていません。
    echo https://www.python.org/ からPython 3.10以上をインストールしてください。
    pause
    exit /b 1
)

REM 仮想環境作成
if not exist ".venv" (
    echo 仮想環境を作成しています...
    python -m venv .venv
)

REM 仮想環境有効化
call .venv\Scripts\activate.bat

REM パッケージインストール
echo パッケージをインストールしています...
pip install -r requirements.txt

REM .envファイル作成
if not exist ".env" (
    copy .env.example .env
    echo.
    echo [重要] .env ファイルを開いて ANTHROPIC_API_KEY を設定してください。
    echo        取得先: https://console.anthropic.com/
    notepad .env
)

echo.
echo セットアップ完了！「起動.bat」でアプリを起動できます。
pause
