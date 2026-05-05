"""Notification router -- send email notifications."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from src.auth.dependencies import get_current_user
from src.common.response import send_success, send_error


def _lookup_email(code_or_name: str) -> str:
    """Lookup google_email from emp_code or emp_name."""
    if not code_or_name:
        return ""
    # Check EXCEPTION_USERS + MockPermissionService
    try:
        from src.modules.sec.service import EXCEPTION_USERS, MockPermissionService
        for u in list(EXCEPTION_USERS) + list(MockPermissionService.MOCK_DATA):
            if u.emp_code == code_or_name or u.emp_name == code_or_name:
                return u.google_email
    except Exception:
        pass
    # BigQuery
    try:
        from google.cloud import bigquery
        client = bigquery.Client(project="fp-a-project")
        query = "SELECT google_email FROM sec_data.v_auth_lookup WHERE emp_code = @code OR emp_name = @code LIMIT 1"
        config = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter("code", "STRING", code_or_name)
        ])
        rows = list(client.query(query, job_config=config).result())
        if rows:
            return rows[0].google_email
    except Exception:
        pass
    return ""


router = APIRouter(prefix="/api/legal", tags=["Notifications"])


class SendBackRequest(BaseModel):
    tsi_id: str
    rejected_steps: list[dict] = []  # [{name, comment}]


class NotifyReviewerRequest(BaseModel):
    tsi_id: str


@router.post("/task/{tsi_id}/send-back")
async def send_back_to_submitter(tsi_id: str, req: SendBackRequest, user: dict = Depends(get_current_user)):
    """Checker/Approver sends feedback email to Submitter."""
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from src.modules.notification.service import notify_send_back
    from src.modules.sec.bigquery_service import BigQueryPermissionService
    from uuid import uuid4
    import json

    print(f"[SEND-BACK] tsi_id={tsi_id}, rejected_steps={len(req.rejected_steps)}")
    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message="Task not found", status_code=404)

    # Find root task for code/title
    root = tsi
    if tsi.my_parent_task:
        parent = tsi_repository.get_by_id(tsi.my_parent_task)
        if parent and parent.my_parent_task:
            root = tsi_repository.get_by_id(parent.my_parent_task) or parent
        elif parent:
            root = parent

    # Find submitter email
    submitter_email = ""
    requested_by = root.requested_by or ""
    print(f"[SEND-BACK] Looking up email for requested_by={requested_by}")
    if requested_by:
        # 1. Check EXCEPTION_USERS first (non-BigQuery users)
        try:
            from src.modules.sec.service import EXCEPTION_USERS, MockPermissionService
            for exc in EXCEPTION_USERS:
                if exc.emp_code == requested_by or exc.emp_name == requested_by:
                    submitter_email = exc.google_email
                    break
            if not submitter_email:
                for mock in MockPermissionService.MOCK_DATA:
                    if mock.emp_code == requested_by or mock.emp_name == requested_by:
                        submitter_email = mock.google_email
                        break
        except Exception as e:
            print(f"[SEND-BACK] Exception user lookup failed: {e}")
        # 2. Try BigQuery
        if not submitter_email:
            try:
                from google.cloud import bigquery
                client = bigquery.Client(project="fp-a-project")
                query = "SELECT google_email FROM sec_data.v_auth_lookup WHERE emp_code = @code OR emp_name = @code LIMIT 1"
                job_config = bigquery.QueryJobConfig(query_parameters=[
                    bigquery.ScalarQueryParameter("code", "STRING", requested_by)
                ])
                rows = list(client.query(query, job_config=job_config).result())
                if rows:
                    submitter_email = rows[0].google_email
            except Exception as e:
                print(f"[SEND-BACK] BigQuery lookup failed: {e}")
        print(f"[SEND-BACK] submitter_email={submitter_email}")

    reviewer_name = user.get("emp_name", "") or user.get("google_email", "Reviewer")

    # Send email
    sent = False
    if submitter_email:
        sent = notify_send_back(
            task_code=root.tsi_code,
            task_title=root.title,
            task_id=root.tsi_id,
            submitter_email=submitter_email,
            reviewer_name=reviewer_name,
            rejected_steps=req.rejected_steps,
        )

    # Log event
    tsev = TSEV(
        tsev_id=f"TSEV-{uuid4().hex[:8]}",
        tsi_id=root.tsi_id,
        event_type=TSEVEventType.COMMENT,
        emp_id=user.get("emp_code", "SYSTEM"),
        event_data=json.dumps({"type": "SEND_BACK", "to": submitter_email, "sent": sent, "steps": req.rejected_steps}),
    )
    tsev_repository.create(tsev)

    return send_success(
        data={"sent": sent, "to": submitter_email},
        message=f"Feedback sent to {submitter_email}" if sent else "Feedback logged (email not configured)"
    )


@router.post("/task/{tsi_id}/notify-reviewer")
async def notify_reviewer(tsi_id: str, user: dict = Depends(get_current_user)):
    """Submitter notifies Checker/Approver that task is ready."""
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tsev.model import TSEV, TSEVEventType
    from src.modules.tsev.repository import tsev_repository
    from src.modules.notification.service import notify_submitted
    from uuid import uuid4
    import json

    tsi = tsi_repository.get_by_id(tsi_id)
    if not tsi:
        return send_error(message="Task not found", status_code=404)

    # Find root task
    root = tsi
    if tsi.my_parent_task:
        parent = tsi_repository.get_by_id(tsi.my_parent_task)
        if parent and parent.my_parent_task:
            root = tsi_repository.get_by_id(parent.my_parent_task) or parent
        elif parent:
            root = parent

    # Find reviewer email (assigned_to)
    reviewer_email = _lookup_email(root.assigned_to or "")

    # If no assigned_to, try to find Approver users
    if not reviewer_email:
        try:
            from google.cloud import bigquery
            client = bigquery.Client(project="fp-a-project")
            query = "SELECT google_email FROM sec_data.v_auth_lookup WHERE role_legal = 'Approver' LIMIT 3"
            rows = list(client.query(query).result())
            if rows:
                reviewer_email = rows[0].google_email
        except Exception:
            pass

    submitter_name = user.get("emp_name", "") or user.get("google_email", "Submitter")

    sent = False
    if reviewer_email:
        sent = notify_submitted(
            task_code=root.tsi_code,
            task_title=root.title,
            task_id=root.tsi_id,
            reviewer_email=reviewer_email,
            submitter_name=submitter_name,
        )

    # Log event
    tsev = TSEV(
        tsev_id=f"TSEV-{uuid4().hex[:8]}",
        tsi_id=root.tsi_id,
        event_type=TSEVEventType.COMMENT,
        emp_id=user.get("emp_code", "SYSTEM"),
        event_data=json.dumps({"type": "NOTIFY_REVIEWER", "to": reviewer_email, "sent": sent}),
    )
    tsev_repository.create(tsev)

    return send_success(
        data={"sent": sent, "to": reviewer_email},
        message=f"Notification sent to {reviewer_email}" if sent else "Notification logged (email not configured)"
    )
