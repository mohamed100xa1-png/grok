#!/bin/bash
cd "$(dirname "$0")"
export PYTHONPATH=.
echo "Starting GPT Image 2 Studio on 0.0.0.0:8000"
echo "Skill: wuyoscar/GPT-Image2-Skill"
echo "Check OPENAI_API_KEY: ${OPENAI_API_KEY:0:10}..."
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
