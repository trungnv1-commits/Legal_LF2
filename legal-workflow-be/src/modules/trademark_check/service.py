"""Trademark Check API client -- async integration with agent-legal service."""

import os
import json
import requests
from typing import Optional


TM_BASE_URL = os.environ.get("TM_API_URL", "https://agent-legal.coderhanoi.id.vn")


def submit_trademark_check(payload: dict, thread_id: Optional[str] = None) -> dict:
    """Submit trademark check request. Returns {jobId, threadId, message}."""
    body = {"message": f"/trademark-check {json.dumps(payload)}"}
    if thread_id:
        body["threadId"] = thread_id
    resp = requests.post(f"{TM_BASE_URL}/chat", json=body, timeout=30)
    resp.raise_for_status()
    return resp.json()


def get_trademark_status(job_id: str) -> dict:
    """Poll status/result of a trademark check job."""
    resp = requests.get(f"{TM_BASE_URL}/status/{job_id}", timeout=30)
    resp.raise_for_status()
    return resp.json()
