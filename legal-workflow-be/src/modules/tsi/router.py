"""TSI router -- task creation and management APIs."""

import json
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from typing import List, Optional
from src.auth.dependencies import get_current_user
from src.common.response import send_success, send_error
from src.config.database import get_db
from src.modules.tsi.schema import TSICreateRequest
from src.modules.tsi.service import create_task_l1

router = APIRouter(
    prefix="/api/legal/task",
    tags=["TSI Task"],
)


@router.post("/")
async def create_task(req: TSICreateRequest, user: dict = Depends(get_current_user)):
    """Create a new Level 1 task."""
    try:
        tsi = create_task_l1(req, emp_code=user.get("emp_code", "SYSTEM"))
        return send_success(
            data=tsi.model_dump(mode="json"),
            message="Task created",
            status_code=201,
        )
    except ValueError as e:
        return send_error(message=str(e), status_code=400)


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


@router.post("/{tsi_id}/approve")
async def approve_task(tsi_id: str, user: dict = Depends(get_current_user)):
    """Approve (complete) a TSI L3 task and trigger next step."""
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tri.repository import tri_repository
    from src.modules.emp.repository import emp_repository
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from src.common.status_machine import assert_transition
    from src.modules.workflow.engine import find_and_create_next_step
    from uuid import uuid4

    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message="TSI not found", status_code=404)

    # Use emp_code from JWT directly (supports both EMP seed and BigQuery users)
    emp_code = user.get("emp_code", "")
    role_legal = user.get("role_legal", "")
    empsec = user.get("empsec", "")

    # Determine admin from JWT claims (role_legal and empsec -- NOT emp table)
    is_admin = (role_legal in ("Approver", "Checker")
                or empsec == "SEC4"
                or user.get("role") in ("LEGAL_MANAGER", "ADMIN"))

    if not is_admin:
        # For non-admin users: check assignment via TRI or task creator
        # Find root task to check requested_by
        root_tsi = tsi
        if tsi.my_parent_task:
            parent = tsi_repository.get_by_id(tsi.my_parent_task)
            if parent and parent.my_parent_task:
                root_tsi = tsi_repository.get_by_id(parent.my_parent_task) or parent
            elif parent:
                root_tsi = parent
        is_creator = (root_tsi.requested_by or "") in (emp_code, emp_repository.get_by_code(emp_code).emp_id if emp_repository.get_by_code(emp_code) else "")
        if not is_creator:
            assignments = tri_repository.get_by_tsi(tsi_id)
            assigned_ids = [a.emp_id for a in assignments]
            emp = emp_repository.get_by_code(emp_code)
            user_emp_id = emp.emp_id if emp else emp_code
            if user_emp_id not in assigned_ids and emp_code not in assigned_ids:
                return send_error(message="You are not assigned to this task", status_code=403)

    # Auto-transition PENDING -> IN_PROGRESS if needed
    current_status = tsi.status.value if hasattr(tsi.status, 'value') else tsi.status
    if current_status == 'PENDING':
        tsi_repository.update(tsi_id, {'status': 'IN_PROGRESS'})
        current_status = 'IN_PROGRESS'

    if is_admin:
        # Admin approve -> APPROVED, trigger next step
        try:
            assert_transition(current_status, 'APPROVED')
        except ValueError:
            # If already SUBMITTED, transition SUBMITTED->APPROVED
            from src.common.status_machine import is_valid_transition
            if not is_valid_transition(current_status, 'APPROVED'):
                return send_error(message=f"Cannot approve from {current_status}", status_code=400)

        tsi_repository.update(tsi_id, {'status': 'APPROVED'})
        tsev = TSEV(
            tsev_id=f"TSEV-{uuid4().hex[:8]}",
            tsi_id=tsi_id,
            event_type=TSEVEventType.APPROVE,
            emp_id=emp_code,
        )
        tsev_repository.create(tsev)

        # Trigger next step
        updated_tsi = tsi_repository.get_by_id(tsi_id)
        find_and_create_next_step(updated_tsi)
    else:
        # User submit -> SUBMITTED (waiting for admin review)
        new_status = 'SUBMITTED'
        tsi_repository.update(tsi_id, {'status': new_status})
        tsev = TSEV(
            tsev_id=f"TSEV-{uuid4().hex[:8]}",
            tsi_id=tsi_id,
            event_type=TSEVEventType.UPDATE,
            emp_id=emp_code,
            event_data='{"action": "submit_to_review"}',
        )
        tsev_repository.create(tsev)
        updated_tsi = tsi_repository.get_by_id(tsi_id)

    return send_success(
        data=updated_tsi.model_dump(mode="json"),
        message="Task approved",
    )


@router.post("/{tsi_id}/reject")
async def reject_task(tsi_id: str, req: RejectRequest, user: dict = Depends(get_current_user)):
    """Reject a TSI task."""
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tri.repository import tri_repository
    from src.modules.emp.repository import emp_repository
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from src.common.status_machine import assert_transition
    from uuid import uuid4
    import json

    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message="TSI not found", status_code=404)

    # Use emp_code from JWT directly (supports both EMP seed and BigQuery users)
    emp_code = user.get("emp_code", "")
    role_legal = user.get("role_legal", "")
    empsec = user.get("empsec", "")
    is_admin = (role_legal in ("Approver", "Checker")
                or empsec == "SEC4"
                or user.get("role") in ("LEGAL_MANAGER", "ADMIN"))

    if not is_admin:
        root_tsi = tsi
        if tsi.my_parent_task:
            parent = tsi_repository.get_by_id(tsi.my_parent_task)
            if parent and parent.my_parent_task:
                root_tsi = tsi_repository.get_by_id(parent.my_parent_task) or parent
            elif parent:
                root_tsi = parent
        is_creator = (root_tsi.requested_by or "") in (emp_code, emp_repository.get_by_code(emp_code).emp_id if emp_repository.get_by_code(emp_code) else "")
        if not is_creator:
            assignments = tri_repository.get_by_tsi(tsi_id)
            assigned_ids = [a.emp_id for a in assignments]
            emp = emp_repository.get_by_code(emp_code)
            user_emp_id = emp.emp_id if emp else emp_code
            if user_emp_id not in assigned_ids and emp_code not in assigned_ids:
                return send_error(message="You are not assigned to this task", status_code=403)

    # Auto-transition PENDING -> IN_PROGRESS if needed
    current_status = tsi.status.value if hasattr(tsi.status, 'value') else tsi.status
    if current_status == 'PENDING':
        tsi_repository.update(tsi_id, {'status': 'IN_PROGRESS'})
        current_status = 'IN_PROGRESS'

    try:
        assert_transition(current_status, "REJECTED")
    except ValueError as e:
        return send_error(message=str(e), status_code=400)

    tsi_repository.update(tsi_id, {"status": "REJECTED"})

    tsev = TSEV(
        tsev_id=f"TSEV-{uuid4().hex[:8]}",
        tsi_id=tsi_id,
        event_type=TSEVEventType.REJECT,
        emp_id=emp_code,
        event_data=json.dumps({"reason": req.reason}),
    )
    tsev_repository.create(tsev)

    # Trigger next step even after reject (workflow continues)
    from src.modules.workflow.engine import find_and_create_next_step
    updated_tsi = tsi_repository.get_by_id(tsi_id)
    find_and_create_next_step(updated_tsi)

    return send_success(
        data=updated_tsi.model_dump(mode="json"),
        message="Task rejected",
    )


# =====================================================================
# Wave 7 LSP Bridge — search by metadata + bulk status query
# Routes MUST be declared BEFORE @router.get("/{tsi_id}") so FastAPI
# matches "/search" and "/batch-status" before the wildcard handler.
# =====================================================================


class BatchStatusRequest(BaseModel):
    tsi_ids: List[str] = Field(..., max_length=100)


@router.get("/search")
async def search_tasks_by_metadata(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Wave 7 LSP Bridge — search TSI by metadata.lsp_sr_id (idempotency check).

    Query: ?metadata.lsp_sr_id=<value>
    Returns up to 10 most-recent TSI matching the LSP correlation id.
    """
    target_sr_id = request.query_params.get("metadata.lsp_sr_id")
    if not target_sr_id:
        return send_success(data=[], message="No metadata.lsp_sr_id query param")

    db = get_db()
    cursor = db.execute(
        "SELECT tsi_id, tsi_code, status, metadata, updated_at "
        "FROM tsi WHERE metadata IS NOT NULL "
        "ORDER BY created_at DESC"
    )
    results = []
    for row in cursor.fetchall():
        raw_meta = row["metadata"] if isinstance(row, dict) or hasattr(row, "keys") else row[3]
        if not raw_meta:
            continue
        try:
            meta = json.loads(raw_meta) if isinstance(raw_meta, str) else raw_meta
        except (ValueError, TypeError):
            continue
        if meta.get("lsp_sr_id") != target_sr_id:
            continue
        results.append({
            "tsi_id": row["tsi_id"],
            "tsi_code": row["tsi_code"],
            "status": row["status"],
            "metadata": meta,
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        })
        if len(results) >= 10:
            break
    return send_success(data=results, message=f"Found {len(results)} TSI(s)")


@router.post("/batch-status")
async def batch_status(
    body: BatchStatusRequest,
    user: dict = Depends(get_current_user),
):
    """Wave 7 LSP Bridge — bulk status query (cap 100 IDs per call).

    Body: {"tsi_ids": ["tsi-001", "tsi-002", ...]}
    Returns 1 record per requested id (found=False if missing).
    """
    if not body.tsi_ids:
        return send_success(data=[], message="Empty tsi_ids")

    ids = body.tsi_ids[:100]
    db = get_db()
    placeholders = ",".join(f":id_{i}" for i in range(len(ids)))
    params = {f"id_{i}": tsi_id for i, tsi_id in enumerate(ids)}
    cursor = db.execute(
        f"SELECT tsi_id, status, updated_at FROM tsi WHERE tsi_id IN ({placeholders})",
        params,
    )
    found = {}
    for row in cursor.fetchall():
        found[row["tsi_id"]] = {
            "status": row["status"],
            "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
        }
    results = []
    for tsi_id in ids:
        if tsi_id in found:
            results.append({
                "tsi_id": tsi_id,
                "status": found[tsi_id]["status"],
                "updated_at": found[tsi_id]["updated_at"],
                "found": True,
            })
        else:
            results.append({
                "tsi_id": tsi_id,
                "status": None,
                "updated_at": None,
                "found": False,
            })
    return send_success(data=results, message=f"{len(results)} TSI(s) queried")


@router.get("/{tsi_id}")
async def get_task_detail(tsi_id: str, user: dict = Depends(get_current_user)):
    """Get detailed task information including progress, documents, events."""
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tst.repository import tst_repository
    from src.modules.tsev.repository import tsev_repository
    from src.modules.tdi.repository import tdi_repository
    from src.modules.tri.repository import tri_repository
    from src.modules.tsi_filter.repository import tsi_filter_repository

    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message="TSI not found", status_code=404)

    # Build progress tree
    progress = _build_progress_tree(tsi, tsi_repository, tst_repository)

    # Collect all TSI IDs in the tree (L1 + L2 + L3) for aggregation
    all_tree_ids = _collect_tree_tsi_ids(tsi, tsi_repository)

    # Get documents aggregated from entire tree
    documents = [d.model_dump(mode="json") for d in tdi_repository.get_by_tsi_ids(all_tree_ids)]

    # Get events aggregated from entire tree, ordered by created_at
    events = tsev_repository.get_by_tsi_ids(all_tree_ids)
    events.sort(key=lambda e: e.created_at)
    events_data = [e.model_dump(mode="json") for e in events]

    # Get assignments aggregated from entire tree
    all_assignments = []
    for tid in all_tree_ids:
        all_assignments.extend(tri_repository.get_by_tsi(tid))
    assignments = [a.model_dump(mode="json") for a in all_assignments]

    # Get filters
    filters = [f.model_dump(mode="json") for f in tsi_filter_repository.get_by_tsi(tsi_id)]

    return send_success(data={
        "tsi": tsi.model_dump(mode="json"),
        "progress": progress,
        "documents": documents,
        "events": events_data,
        "assignments": assignments,
        "filters": filters,
    })


@router.put("/{tsi_id}/reassign")
async def reassign_task(tsi_id: str, req: dict, user: dict = Depends(get_current_user)):
    """Reassign a task to a different employee."""
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from uuid import uuid4
    import json

    new_emp_code = req.get("new_emp_code")
    reason = req.get("reason", "")
    if not new_emp_code:
        return send_error(message="new_emp_code is required", status_code=400)

    tsi = tsi_repository.get_by_id(tsi_id)
    if tsi is None:
        return send_error(message=f"TSI '{tsi_id}' not found", status_code=404)

    old_emp = tsi.assigned_to
    tsi_repository.update(tsi_id, {"assigned_to": new_emp_code})

    # Create REASSIGN event
    tsev = TSEV(
        tsev_id=f"TSEV-{uuid4().hex[:8]}",
        tsi_id=tsi_id,
        event_type=TSEVEventType.REASSIGN,
        emp_id=user.get("emp_code", "SYSTEM"),
        event_data=json.dumps({"old_emp": old_emp, "new_emp": new_emp_code, "reason": reason}),
    )
    tsev_repository.create(tsev)

    # Send notification to the newly assigned person
    try:
        from src.modules.notification.service import notify_assigned
        # Lookup email of new assignee from BigQuery
        assignee_email = ""
        try:
            from google.cloud import bigquery
            bq_client = bigquery.Client(project="fp-a-project")
            bq_query = "SELECT google_email FROM sec_data.v_auth_lookup WHERE emp_code = @code OR emp_name = @code LIMIT 1"
            bq_config = bigquery.QueryJobConfig(query_parameters=[
                bigquery.ScalarQueryParameter("code", "STRING", new_emp_code)
            ])
            rows = list(bq_client.query(bq_query, job_config=bq_config).result())
            if rows:
                assignee_email = rows[0].google_email
        except Exception as e:
            print(f"[REASSIGN] Email lookup failed: {e}")

        if assignee_email:
            # Find root task for code/title
            root = tsi
            if tsi.my_parent_task:
                parent = tsi_repository.get_by_id(tsi.my_parent_task)
                if parent:
                    root = parent if not parent.my_parent_task else (tsi_repository.get_by_id(parent.my_parent_task) or parent)
            notify_assigned(
                task_code=root.tsi_code,
                task_title=root.title,
                task_id=root.tsi_id,
                assignee_email=assignee_email,
                assigner_name=user.get("emp_name", "") or user.get("google_email", "Admin"),
            )
    except Exception as e:
        print(f"[REASSIGN] Notification failed: {e}")

    return send_success(data={"tsi_id": tsi_id, "old_emp": old_emp, "new_emp": new_emp_code}, message="Task reassigned")


@router.patch("/{tsi_id}/status")
async def update_task_status(tsi_id: str, req: dict, user: dict = Depends(get_current_user)):
    """LSP Bridge endpoint — update TSI status from external system (LF4/LSP).

    Body: {status: <TSIStatus>, reason?: str}

    Differs from /approve, /reject (which run workflow navigation logic):
    this is a flat status setter for cross-system sync. Validates status enum,
    updates DB, emits TSEV UPDATE event with old→new status delta.

    Use case: LSP user marks SR as DONE → LSP calls this to push status to LF2.
    """
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tsi.model import TSIStatus
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from uuid import uuid4
    import json

    new_status = req.get("status")
    reason = req.get("reason", "")
    if not new_status:
        return send_error(message="status is required", status_code=400)

    try:
        TSIStatus(new_status)
    except ValueError:
        valid = [s.value for s in TSIStatus]
        return send_error(message=f"Invalid status '{new_status}'. Valid: {valid}", status_code=400)

    tsi = tsi_repository.get_by_id(tsi_id)
    if tsi is None:
        return send_error(message=f"TSI '{tsi_id}' not found", status_code=404)

    old_status = tsi.status
    if str(old_status) == new_status:
        return send_success(data={"tsi_id": tsi_id, "status": new_status, "changed": False},
                            message="No change")

    tsi_repository.update(tsi_id, {"status": new_status})

    tsev = TSEV(
        tsev_id=f"TSEV-{uuid4().hex[:8]}",
        tsi_id=tsi_id,
        event_type=TSEVEventType.UPDATE,
        emp_id=user.get("emp_code", "SYSTEM"),
        event_data=json.dumps({
            "field": "status", "old": str(old_status), "new": new_status,
            "reason": reason, "source": "lsp_bridge",
        }),
    )
    tsev_repository.create(tsev)

    return send_success(
        data={"tsi_id": tsi_id, "status": new_status, "changed": True},
        message=f"Status changed: {old_status} -> {new_status}",
    )


@router.post("/{tsi_id}/cancel")
async def cancel_task(tsi_id: str, req: dict, user: dict = Depends(get_current_user)):
    """LSP Bridge endpoint — cancel a TSI from external system (LF4/LSP).

    Body: {reason?: str}

    Sets status=CANCELLED + emits UPDATE event with cancel context.
    Idempotent: re-cancel returns 'No change' instead of error.
    """
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tsi.model import TSIStatus
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from uuid import uuid4
    import json

    reason = req.get("reason", "Cancelled by LSP user")

    tsi = tsi_repository.get_by_id(tsi_id)
    if tsi is None:
        return send_error(message=f"TSI '{tsi_id}' not found", status_code=404)

    if str(tsi.status) == TSIStatus.CANCELLED.value:
        return send_success(data={"tsi_id": tsi_id, "status": "CANCELLED", "changed": False},
                            message="Already cancelled")

    old_status = tsi.status
    tsi_repository.update(tsi_id, {"status": TSIStatus.CANCELLED.value})

    tsev = TSEV(
        tsev_id=f"TSEV-{uuid4().hex[:8]}",
        tsi_id=tsi_id,
        event_type=TSEVEventType.UPDATE,
        emp_id=user.get("emp_code", "SYSTEM"),
        event_data=json.dumps({
            "field": "status", "old": str(old_status), "new": "CANCELLED",
            "reason": reason, "source": "lsp_bridge", "action": "cancel",
        }),
    )
    tsev_repository.create(tsev)

    return send_success(
        data={"tsi_id": tsi_id, "status": "CANCELLED", "changed": True, "reason": reason},
        message=f"TSI cancelled: {old_status} -> CANCELLED",
    )


@router.put("/{tsi_id}/metadata")
async def update_metadata(tsi_id: str, metadata: dict, user: dict = Depends(get_current_user)):
    """Update task metadata (LF240 additional fields)."""
    from src.modules.tsi.repository import tsi_repository
    import json

    tsi = tsi_repository.get_by_id(tsi_id)
    if tsi is None:
        return send_error(message=f"TSI '{tsi_id}' not found", status_code=404)

    tsi_repository.update(tsi_id, {"metadata": json.dumps(metadata)})
    return send_success(data=metadata, message="Metadata updated")


@router.get("/{tsi_id}/metadata")
async def get_metadata(tsi_id: str, user: dict = Depends(get_current_user)):
    """Get task metadata."""
    from src.modules.tsi.repository import tsi_repository
    import json

    tsi = tsi_repository.get_by_id(tsi_id)
    if tsi is None:
        return send_error(message=f"TSI '{tsi_id}' not found", status_code=404)

    metadata = {}
    if hasattr(tsi, 'metadata') and tsi.metadata:
        try:
            metadata = json.loads(tsi.metadata)
        except (json.JSONDecodeError, TypeError):
            pass
    return send_success(data=metadata)


def _collect_tree_tsi_ids(tsi, tsi_repository) -> list[str]:
    """Collect all TSI IDs in the tree (root L1 + all L2 + all L3)."""
    all_tsis = tsi_repository.get_all()

    # Find root L1
    root = tsi
    while root.my_parent_task:
        parent = tsi_repository.get_by_id(root.my_parent_task)
        if parent is None:
            break
        root = parent

    ids = [root.tsi_id]

    # L2 children
    l2_tsis = sorted([t for t in all_tsis if t.my_parent_task == root.tsi_id], key=lambda t: t.created_at)
    for l2 in l2_tsis:
        ids.append(l2.tsi_id)
        # L3 children
        l3_tsis = sorted([t for t in all_tsis if t.my_parent_task == l2.tsi_id], key=lambda t: t.created_at)
        for l3 in l3_tsis:
            ids.append(l3.tsi_id)

    return ids


def _build_progress_tree(tsi, tsi_repository, tst_repository):
    """Build TST tree progress showing status for each node."""
    all_tsis = tsi_repository.get_all()

    # Find root L1
    root = tsi
    while root.my_parent_task:
        parent = tsi_repository.get_by_id(root.my_parent_task)
        if parent is None:
            break
        root = parent

    progress = []

    # L1
    tst_l1 = tst_repository.get_by_id(root.tst_id)
    l1_node = {
        "tsi_id": root.tsi_id,
        "tst_id": root.tst_id,
        "tst_name": tst_l1.tst_name if tst_l1 else "Unknown",
        "tst_level": 1,
        "status": root.status.value,
        "children": [],
    }

    # Find L2 children
    l2_tsis = sorted([t for t in all_tsis if t.my_parent_task == root.tsi_id], key=lambda t: t.created_at)
    for l2 in l2_tsis:
        tst_l2 = tst_repository.get_by_id(l2.tst_id)
        l2_node = {
            "tsi_id": l2.tsi_id,
            "tst_id": l2.tst_id,
            "tst_name": tst_l2.tst_name if tst_l2 else "Unknown",
            "tst_level": 2,
            "status": l2.status.value,
            "children": [],
        }

        # Find L3 children
        l3_tsis = sorted([t for t in all_tsis if t.my_parent_task == l2.tsi_id], key=lambda t: t.created_at)
        for l3 in l3_tsis:
            tst_l3 = tst_repository.get_by_id(l3.tst_id)
            # Get latest comment/feedback for this L3
            from src.modules.tsev.repository import tsev_repository
            l3_events = tsev_repository.get_by_tsi(l3.tsi_id)
            l3_comment = ""
            for ev in reversed(l3_events):
                if ev.emp_id == "AI_REVIEWER":
                    continue  # Skip AI events, only show human comments
                evt = ev.event_type.value if hasattr(ev.event_type, 'value') else ev.event_type
                if evt == "COMMENT" and ev.event_data:
                    l3_comment = ev.event_data
                    break
                if evt == "REJECT" and ev.event_data:
                    import json
                    try:
                        d = json.loads(ev.event_data)
                        l3_comment = d.get("reason", ev.event_data)
                    except Exception:
                        l3_comment = ev.event_data
                    break

            # Get AI review result for this L3
            ai_review = None
            for ev in reversed(l3_events):
                if ev.emp_id == "AI_REVIEWER" and ev.event_data:
                    try:
                        ai_review = json.loads(ev.event_data)
                    except Exception:
                        pass
                    break

            # If no human comment but AI review exists, show AI score as comment
            display_comment = l3_comment
            if not display_comment and ai_review:
                verdict = ai_review.get("verdict", "")
                score = ai_review.get("score", 0)
                summary = ai_review.get("summary", "")
                display_comment = f"AI: {verdict} ({score}%) - {summary}"

            l3_node = {
                "tsi_id": l3.tsi_id,
                "tst_id": l3.tst_id,
                "tst_name": tst_l3.tst_name if tst_l3 else "Unknown",
                "tst_level": 3,
                "status": l3.status.value,
                "comment": display_comment,
                "ai_review": ai_review,
            }
            l2_node["children"].append(l3_node)

        l1_node["children"].append(l2_node)

    progress.append(l1_node)
    return progress
