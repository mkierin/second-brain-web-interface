#!/bin/bash
cd /root/brain-web-interface/backend
source venv/bin/activate
exec uvicorn main:app --host 0.0.0.0 --port 8000
