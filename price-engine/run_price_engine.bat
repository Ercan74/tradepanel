@echo off
title TradePanel Price Engine v3

cd /d "%~dp0"

echo TradePanel Price Engine baslatiliyor...
echo.

if not exist venv (
    echo VENV bulunamadi. Once kurulum yapilmali.
    pause
    exit /b
)

call venv\Scripts\activate

python main.py

echo.
echo Price Engine kapandi.
pause