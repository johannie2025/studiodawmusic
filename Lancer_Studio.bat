@echo off
chcp 65001 >nul
title Wise Design Studio by Maestro Josias
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Premiere installation (Internet requis une seule fois)...
  python -m venv .venv || (echo Python 3.10-3.12 requis & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)
".venv\Scripts\python.exe" run.py
pause
