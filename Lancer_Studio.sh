#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -U pip && .venv/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu && .venv/bin/pip install -r requirements.txt; }
.venv/bin/python run.py
