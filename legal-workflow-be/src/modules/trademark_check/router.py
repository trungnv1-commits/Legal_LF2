"""Trademark Check router -- submit + poll + save results with step-level agent logging."""

import json
import logging
import time
from uuid import uuid4
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional, List, Any
from src.auth.dependencies import get_current_user
from src.common.response import send_success, send_error
from src.modules.trademark_check.service import (
    submit_trademark_check, get_trademark_status
)

logger = logging.getLogger("TrademarkCheckAgent")

router = APIRouter(prefix="/api/legal", tags=["Trademark Check"])

AGENT_NAME = "TrademarkCheckAgent"


class AppNameInput(BaseModel):
    appName: str
    subtitle: Optional[str] = None


class FeatureInput(BaseModel):
    keywords: Optional[str] = None
    imagePath: str


class TrademarkCheckRequest(BaseModel):
    appNames: List[AppNameInput]
    platform: str  # ios or android
    shortDescs: Optional[List[str]] = None
    longDescs: Optional[List[str]] = None
    iconUrls: Optional[List[str]] = None
    features: Optional[List[FeatureInput]] = None


def _log_step(tsi_id: str, step: str, status: str, details: Any = None,
              emp_id: str = "SYSTEM", event_type_override: str = None):
    """Emit structured log to Cloud Logging + persist TSEV event for audit trail.

    Every agent step (submit, poll, normalize, filter, save) writes one TSEV row
    so that /trace endpoint can reconstruct the timeline.
    """
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository

    # Cloud Logging (stdout)
    log_entry = {
        "agent": AGENT_NAME,
        "tsi_id": tsi_id,
        "step": step,
        "status": status,
        "details": details,
    }
    logger.info(json.dumps(log_entry, ensure_ascii=False, default=str))

    # Persist to TSEV for UI trace timeline
    try:
        event_data = {
            "agent": AGENT_NAME,
            "step": step,
            "status": status,
            "details": details,
            "ts": time.time(),
        }
        tsev = TSEV(
            tsev_id=f"TSEV-{uuid4().hex[:8]}",
            tsi_id=tsi_id,
            event_type=TSEVEventType.COMMENT,
            emp_id=emp_id,
            event_data=json.dumps(event_data, ensure_ascii=False, default=str),
        )
        tsev_repository.create(tsev)
    except Exception as e:
        logger.warning(f"Failed to persist TSEV for step={step}: {e}")


def _normalize_icon_url(url: str) -> str:
    """Convert Drive /view link → direct image URL."""
    import re
    m = re.match(r"https://drive\.google\.com/file/d/([^/]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=view&id={m.group(1)}"
    return url


def _has_valid_result(result: Any) -> bool:
    return bool(result) and (
        not isinstance(result, dict) or bool(result.get("results"))
    )


FAIL_FAST_THRESHOLD_SEC = 30
COOLDOWN_MINUTES = 10
SUSPICIOUS_APPNAME_CHARS = (":", "|", "/", "?", "*")


def _compute_upstream_duration(resp: dict) -> float:
    """Return duration (seconds) between agent-legal createdAt and updatedAt, or 0 if unknown."""
    from datetime import datetime
    try:
        ca = resp.get("createdAt")
        ua = resp.get("updatedAt")
        if not ca or not ua:
            return 0.0
        ca_dt = datetime.fromisoformat(ca.replace("Z", "+00:00"))
        ua_dt = datetime.fromisoformat(ua.replace("Z", "+00:00"))
        return (ua_dt - ca_dt).total_seconds()
    except Exception:
        return 0.0


def _sanitize_app_name(name: str):
    """Trim and detect suspicious characters. Returns (clean_name, warnings[])."""
    warnings = []
    clean = name.strip()
    if clean != name:
        warnings.append("trimmed_whitespace")
    for ch in SUSPICIOUS_APPNAME_CHARS:
        if ch in clean:
            warnings.append("suspicious_char_" + ch)
    if len(clean) > 30:
        warnings.append("name_too_long_" + str(len(clean)) + "_chars")
    if len(clean) < 2:
        warnings.append("name_too_short")
    return clean, warnings


def _check_cooldown(meta: dict):
    """Return (is_in_cooldown, seconds_remaining)."""
    import time as _time
    cooldown_until = meta.get("tm_check_cooldown_until", 0)
    if not cooldown_until:
        return False, 0
    now = _time.time()
    if now >= cooldown_until:
        return False, 0
    return True, int(cooldown_until - now)


def _build_fail_error(error_msg: str, upstream_duration: float, prev_error: str = ""):
    """Pick best error message + classify failure_reason."""
    if error_msg:
        low = error_msg.lower()
        if "circuit breaker" in low:
            return error_msg, "circuit_breaker_open"
        if "recursion limit" in low:
            return error_msg, "langgraph_recursion"
        if "certificate" in low or "ssl" in low:
            return error_msg, "upstream_ssl_fail"
        return error_msg, "upstream_error"
    if 0 < upstream_duration < FAIL_FAST_THRESHOLD_SEC:
        hint = (
            "Upstream fail-fast (" + str(round(upstream_duration, 1)) + "s < " + str(FAIL_FAST_THRESHOLD_SEC) + "s threshold). "
            "Likely circuit breaker open or infrastructure outage. "
            "Wait 10-15 minutes and retry, or notify admin."
        )
        return hint, "inferred_fast_fail"
    if prev_error:
        return prev_error, "cached_error"
    return "Upstream completed but returned empty report (no explanation provided)", "unknown"


@router.post("/task/{tsi_id}/trademark-check/submit")
async def submit_check(tsi_id: str, req: TrademarkCheckRequest, user: dict = Depends(get_current_user)):
    """Submit trademark check. Logs each agent step: validate → normalize → submit → save."""
    from src.modules.tsi.repository import tsi_repository

    emp_id = user.get("emp_code", "SYSTEM")

    # Step 1: load task
    _log_step(tsi_id, "SUBMIT_START", "started", {"user": emp_id}, emp_id)
    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        _log_step(tsi_id, "SUBMIT_START", "failed", {"error": "Task not found"}, emp_id)
        return send_error(message=f"Task {tsi_id} not found", status_code=404)

    # Step 1b: check client-side cooldown
    try:
        meta_pre = json.loads(tsi.metadata) if tsi.metadata else {}
    except Exception:
        meta_pre = {}
    in_cooldown, remaining = _check_cooldown(meta_pre)
    if in_cooldown:
        _log_step(tsi_id, "COOLDOWN_CHECK", "blocked",
                  {"seconds_remaining": remaining,
                   "reason": meta_pre.get("tm_check_cooldown_reason", "unknown")}, emp_id)
        return send_error(
            message=("Trademark check is cooling down (" + str(remaining) + "s left). "
                     "Reason: " + str(meta_pre.get("tm_check_cooldown_reason", "unknown")) + ". "
                     "Please wait before submitting again."),
            status_code=429,
        )

    # Step 2: validate + sanitize + build payload
    _log_step(tsi_id, "VALIDATE_INPUT", "started",
              {"appNames_count": len(req.appNames), "platform": req.platform}, emp_id)
    sanitize_warnings = []
    sanitized_app_names = []
    for idx, a in enumerate(req.appNames):
        clean_name, warns = _sanitize_app_name(a.appName)
        if warns:
            sanitize_warnings.append({"index": idx, "original": a.appName, "clean": clean_name, "warnings": warns})
        entry = a.model_dump(exclude_none=True)
        entry["appName"] = clean_name
        sanitized_app_names.append(entry)
    if sanitize_warnings:
        _log_step(tsi_id, "SANITIZE_APPNAME", "warned",
                  {"warnings": sanitize_warnings}, emp_id)
    payload = {
        "appNames": sanitized_app_names,
        "platform": req.platform,
    }
    if req.shortDescs: payload["shortDescs"] = req.shortDescs
    if req.longDescs: payload["longDescs"] = req.longDescs

    # Step 3: normalize iconUrl
    if req.iconUrls:
        original = list(req.iconUrls)
        normalized = [_normalize_icon_url(u) for u in req.iconUrls]
        changed = [i for i, (a, b) in enumerate(zip(original, normalized)) if a != b]
        payload["iconUrls"] = normalized
        _log_step(tsi_id, "NORMALIZE_ICON_URL",
                  "changed" if changed else "unchanged",
                  {"original": original, "normalized": normalized, "changed_indices": changed}, emp_id)

    if req.features: payload["features"] = [f.model_dump(exclude_none=True) for f in req.features]
    _log_step(tsi_id, "VALIDATE_INPUT", "completed", {"payload_keys": list(payload.keys())}, emp_id)

    # Step 4: submit to agent-legal
    _log_step(tsi_id, "UPSTREAM_SUBMIT", "started", {"endpoint": "agent-legal /chat"}, emp_id)
    t_start = time.time()
    try:
        result = submit_trademark_check(payload)
    except Exception as e:
        _log_step(tsi_id, "UPSTREAM_SUBMIT", "failed",
                  {"error": str(e), "elapsed_ms": int((time.time() - t_start) * 1000)}, emp_id)
        return send_error(message=f"TM API submit failed: {e}", status_code=500)

    job_id = result.get("jobId", "")
    thread_id = result.get("threadId", "")
    _log_step(tsi_id, "UPSTREAM_SUBMIT", "completed",
              {"job_id": job_id, "thread_id": thread_id,
               "elapsed_ms": int((time.time() - t_start) * 1000)}, emp_id)

    # Step 5: save jobId to metadata
    meta = {}
    try:
        meta = json.loads(tsi.metadata) if tsi.metadata else {}
    except Exception:
        meta = {}
    meta["tm_check_job_id"] = job_id
    meta["tm_check_thread_id"] = thread_id
    meta["tm_check_status"] = "processing"
    meta["tm_check_payload"] = payload
    meta.pop("tm_check_error", None)
    meta.pop("tm_check_result", None)
    tsi_repository.update(tsi_id, {"metadata": json.dumps(meta)})
    _log_step(tsi_id, "SAVE_METADATA", "completed",
              {"job_id": job_id, "status": "processing"}, emp_id)

    _log_step(tsi_id, "SUBMIT_START", "completed", {"job_id": job_id}, emp_id)
    return send_success(data={"job_id": job_id, "thread_id": thread_id, "status": "processing"})


@router.get("/task/{tsi_id}/trademark-check/status")
async def check_status(tsi_id: str, user: dict = Depends(get_current_user)):
    """Poll TM API for job status. Logs each step: cache-check → poll → normalize → save."""
    from src.modules.tsi.repository import tsi_repository

    emp_id = user.get("emp_code", "SYSTEM")

    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message=f"Task {tsi_id} not found", status_code=404)

    try:
        meta = json.loads(tsi.metadata) if tsi.metadata else {}
    except Exception:
        meta = {}

    job_id = meta.get("tm_check_job_id", "")
    if not job_id:
        return send_error(message="No trademark check job found for this task", status_code=404)

    # Step 1: cache check
    cached_status = meta.get("tm_check_status")
    cached_result = meta.get("tm_check_result")
    cached_has_valid = _has_valid_result(cached_result)
    if cached_status in ("completed", "failed") and (cached_status == "failed" or cached_has_valid):
        _log_step(tsi_id, "CACHE_CHECK", "hit",
                  {"cached_status": cached_status, "job_id": job_id}, emp_id)
        return send_success(data={
            "status": cached_status,
            "result": cached_result,
            "error": meta.get("tm_check_error"),
        })
    _log_step(tsi_id, "CACHE_CHECK", "miss",
              {"cached_status": cached_status, "cached_has_valid": cached_has_valid}, emp_id)

    # Step 2: poll upstream
    _log_step(tsi_id, "UPSTREAM_POLL", "started", {"job_id": job_id}, emp_id)
    t_start = time.time()
    try:
        resp = get_trademark_status(job_id)
    except Exception as e:
        _log_step(tsi_id, "UPSTREAM_POLL", "failed",
                  {"error": str(e), "elapsed_ms": int((time.time() - t_start) * 1000)}, emp_id)
        return send_error(message=f"TM API status poll failed: {e}", status_code=500)

    status = resp.get("status", "")
    result = resp.get("result")
    error_msg = resp.get("error")
    _log_step(tsi_id, "UPSTREAM_POLL", "completed",
              {"upstream_status": status, "has_result": bool(result),
               "has_error": bool(error_msg),
               "elapsed_ms": int((time.time() - t_start) * 1000)}, emp_id)

    # Step 3: normalize agent-legal quirks + compute upstream duration
    has_valid_result = _has_valid_result(result)
    upstream_duration = _compute_upstream_duration(resp)

    if status == "completed" and not has_valid_result:
        prev_error = meta.get("tm_check_error", "")
        final_error, failure_reason = _build_fail_error(error_msg, upstream_duration, prev_error)
        trigger_cooldown = failure_reason in ("circuit_breaker_open", "inferred_fast_fail")
        _log_step(tsi_id, "NORMALIZE_RESULT", "override_to_failed",
                  {"upstream_status": "completed", "final_status": "failed",
                   "failure_reason": failure_reason,
                   "upstream_duration_sec": upstream_duration,
                   "trigger_cooldown": trigger_cooldown,
                   "final_error": final_error}, emp_id)
        meta["tm_check_status"] = "failed"
        meta["tm_check_error"] = final_error
        meta["tm_check_failure_reason"] = failure_reason
        meta["tm_check_result"] = None
        if trigger_cooldown:
            meta["tm_check_cooldown_until"] = time.time() + COOLDOWN_MINUTES * 60
            meta["tm_check_cooldown_reason"] = failure_reason
            _log_step(tsi_id, "COOLDOWN_SET", "activated",
                      {"duration_minutes": COOLDOWN_MINUTES, "reason": failure_reason}, emp_id)
        tsi_repository.update(tsi_id, {"metadata": json.dumps(meta)})
        _log_step(tsi_id, "SAVE_METADATA", "completed", {"status": "failed"}, emp_id)
        return send_success(data={
            "status": "failed",
            "error": final_error,
            "upstream_status": "completed",
            "failure_reason": failure_reason,
            "upstream_duration_sec": upstream_duration,
            "cooldown_active": trigger_cooldown,
        })

    if status == "completed":
        _log_step(tsi_id, "NORMALIZE_RESULT", "valid",
                  {"results_count": len(result.get("results", [])) if isinstance(result, dict) else 0}, emp_id)
        meta["tm_check_status"] = "completed"
        meta["tm_check_result"] = result
        tsi_repository.update(tsi_id, {"metadata": json.dumps(meta)})
        _log_step(tsi_id, "SAVE_METADATA", "completed", {"status": "completed"}, emp_id)
        return send_success(data={"status": "completed", "result": result})

    if status == "failed":
        final_error, failure_reason = _build_fail_error(error_msg, upstream_duration, meta.get("tm_check_error", ""))
        trigger_cooldown = failure_reason in ("circuit_breaker_open", "inferred_fast_fail")
        _log_step(tsi_id, "NORMALIZE_RESULT", "failed",
                  {"upstream_error": error_msg, "failure_reason": failure_reason,
                   "upstream_duration_sec": upstream_duration,
                   "trigger_cooldown": trigger_cooldown}, emp_id)
        meta["tm_check_status"] = "failed"
        meta["tm_check_error"] = final_error
        meta["tm_check_failure_reason"] = failure_reason
        if trigger_cooldown:
            meta["tm_check_cooldown_until"] = time.time() + COOLDOWN_MINUTES * 60
            meta["tm_check_cooldown_reason"] = failure_reason
            _log_step(tsi_id, "COOLDOWN_SET", "activated",
                      {"duration_minutes": COOLDOWN_MINUTES, "reason": failure_reason}, emp_id)
        tsi_repository.update(tsi_id, {"metadata": json.dumps(meta)})
        _log_step(tsi_id, "SAVE_METADATA", "completed", {"status": "failed"}, emp_id)
        return send_success(data={
            "status": "failed",
            "error": final_error,
            "failure_reason": failure_reason,
            "upstream_duration_sec": upstream_duration,
            "cooldown_active": trigger_cooldown,
        })

    _log_step(tsi_id, "POLL_PENDING", "in_progress",
              {"upstream_status": status, "job_id": job_id}, emp_id)
    return send_success(data={"status": status, "job_id": job_id})


@router.get("/task/{tsi_id}/trademark-check/result")
async def get_result(tsi_id: str, user: dict = Depends(get_current_user)):
    """Get cached trademark check result from TSI.metadata."""
    from src.modules.tsi.repository import tsi_repository

    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message=f"Task {tsi_id} not found", status_code=404)

    try:
        meta = json.loads(tsi.metadata) if tsi.metadata else {}
    except Exception:
        meta = {}

    status_val = meta.get("tm_check_status")
    result_val = meta.get("tm_check_result")
    error_val = meta.get("tm_check_error")
    # Normalize cached "completed+empty" to "failed" for consistent UI
    if status_val == "completed" and not _has_valid_result(result_val):
        status_val = "failed"
        error_val = error_val or "Upstream completed but returned empty report"

    return send_success(data={
        "job_id": meta.get("tm_check_job_id"),
        "status": status_val,
        "result": result_val,
        "error": error_val,
        "payload": meta.get("tm_check_payload"),
    })


@router.get("/task/{tsi_id}/trademark-check/trace")
async def get_trace(tsi_id: str, user: dict = Depends(get_current_user)):
    """Return timeline of TrademarkCheckAgent steps from TSEV events.

    Each entry: {ts, step, status, details, emp_id}
    Ordered chronologically.
    """
    from src.modules.tsev.repository import tsev_repository

    events = tsev_repository.get_by_tsi(tsi_id) or []
    trace = []
    for ev in events:
        try:
            data = json.loads(ev.event_data) if isinstance(ev.event_data, str) else (ev.event_data or {})
        except Exception:
            continue
        if not isinstance(data, dict) or data.get("agent") != AGENT_NAME:
            continue
        created_at = getattr(ev, "created_at", None)
        trace.append({
            "tsev_id": getattr(ev, "tsev_id", None),
            "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at) if created_at else None,
            "ts": data.get("ts"),
            "step": data.get("step"),
            "status": data.get("status"),
            "details": data.get("details"),
            "emp_id": getattr(ev, "emp_id", None),
        })
    # Sort by ts or created_at
    trace.sort(key=lambda x: x.get("ts") or 0)
    return send_success(data={"trace": trace, "count": len(trace)})
