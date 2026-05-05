"""My Tasks router -- user-specific task list API."""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from src.auth.dependencies import get_current_user
from src.common.response import send_success, send_error

router = APIRouter(
    prefix="/api/legal",
    tags=["My Tasks"],
)


# Cache for name lookups (avoids repeated BigQuery calls)
_name_cache: dict[str, str] = {}

def _batch_load_names(codes: set[str], emp_repository):
    """Batch load names for all codes in one BigQuery call."""
    global _name_cache
    missing = [c for c in codes if c and c not in _name_cache]
    if not missing:
        return
    # 1. Check local EMP table
    still_missing = []
    for code in missing:
        emp = emp_repository.get_by_code(code) or emp_repository.get_by_id(code)
        if emp:
            _name_cache[code] = emp.emp_name
        else:
            still_missing.append(code)
    # 2. Check EXCEPTION_USERS + Mock
    try:
        from src.modules.sec.service import EXCEPTION_USERS, MockPermissionService
        for u in list(EXCEPTION_USERS) + list(MockPermissionService.MOCK_DATA):
            if u.emp_code in still_missing:
                _name_cache[u.emp_code] = u.emp_name
                still_missing = [c for c in still_missing if c != u.emp_code]
            if u.emp_name in still_missing:
                _name_cache[u.emp_name] = u.emp_name
                still_missing = [c for c in still_missing if c != u.emp_name]
    except Exception:
        pass
    # 3. Batch BigQuery for remaining
    if still_missing:
        try:
            from google.cloud import bigquery
            client = bigquery.Client(project="fp-a-project")
            placeholders = ", ".join([f"'{c}'" for c in still_missing])
            query = f"SELECT emp_code, emp_name FROM sec_data.v_auth_lookup WHERE emp_code IN ({placeholders}) OR emp_name IN ({placeholders})"
            rows = list(client.query(query).result())
            for row in rows:
                _name_cache[row.emp_code] = row.emp_name
                _name_cache[row.emp_name] = row.emp_name
        except Exception:
            pass
    # Fallback: use code as name
    for code in missing:
        if code not in _name_cache:
            _name_cache[code] = code

def _lookup_name(code_or_id: str, emp_repository) -> str:
    if not code_or_id:
        return ""
    if code_or_id not in _name_cache:
        _batch_load_names({code_or_id}, emp_repository)
    return _name_cache.get(code_or_id, code_or_id)


def _build_root_entry(root_tsi, all_tsis, emp_repository, tst_repository):
    """Build a task entry dict from an L1 root TSI."""
    root_id = root_tsi.tsi_id

    # Find the latest L3 status in this workflow
    all_l3s_in_tree = []
    l2s = [t for t in all_tsis if t.my_parent_task == root_id]
    for l2 in l2s:
        l3s = [t for t in all_tsis if t.my_parent_task == l2.tsi_id]
        all_l3s_in_tree.extend(l3s)

    latest_status = root_tsi.status.value if hasattr(root_tsi.status, 'value') else root_tsi.status
    if all_l3s_in_tree:
        all_l3s_in_tree.sort(key=lambda t: t.updated_at, reverse=True)
        last_l3 = all_l3s_in_tree[0]
        latest_status = last_l3.status.value if hasattr(last_l3.status, 'value') else last_l3.status

    # Get TST L1 name
    tst_l1_name = ""
    tst_l1 = tst_repository.get_by_id(root_tsi.tst_id)
    if tst_l1:
        tst_l1_name = tst_l1.tst_name

    # Get submitter name (id_name format: TrungNV1, TiepTA, etc.)
    submitted_by_name = _lookup_name(root_tsi.requested_by, emp_repository)

    # Get assigned_to name
    assigned_to_name = _lookup_name(root_tsi.assigned_to, emp_repository)

    return {
        "tsi_id": root_tsi.tsi_id,
        "tsi_code": root_tsi.tsi_code,
        "title": root_tsi.title,
        "status": latest_status,
        "priority": root_tsi.priority.value if hasattr(root_tsi.priority, 'value') and root_tsi.priority else root_tsi.priority,
        "due_date": root_tsi.due_date,
        "assigned_to": root_tsi.assigned_to,
        "assigned_to_name": assigned_to_name,
        "created_at": root_tsi.created_at.isoformat() if hasattr(root_tsi.created_at, 'isoformat') else str(root_tsi.created_at),
        "tst_l1_name": tst_l1_name,
        "submitted_by_name": submitted_by_name,
    }


@router.get("/my-tasks")
async def get_my_tasks(
    user: dict = Depends(get_current_user),
    status: Optional[str] = Query(None),
    type_l1: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    """Get current user tasks grouped by L1 root, showing latest status.
    
    SEC4 (Admin/Approver) sees ALL tasks.
    Other SECs see only tasks assigned to them via TRI.
    """
    from src.modules.emp.repository import emp_repository
    from src.modules.tri.repository import tri_repository
    from src.modules.tsi.repository import tsi_repository
    from src.modules.tst.repository import tst_repository

    empsec = user.get("empsec", "")
    role_legal = user.get("role_legal", "")
    is_admin = empsec == "SEC4" or role_legal in ("Approver", "Checker")

    all_tsis = tsi_repository.get_all()
    seen_roots: dict[str, dict] = {}

    # Map dashboard status groups to actual statuses
    STATUS_GROUPS = {
        "PENDING": ("PENDING", "PENDING_REVIEW", "SUBMITTED", "REJECTED"),
        "IN_PROGRESS": ("IN_PROGRESS",),
        "COMPLETED": ("COMPLETED", "APPROVED"),
    }
    status_match = STATUS_GROUPS.get(status, (status,)) if status else None

    # Preload all names in ONE batch (avoid N+1 BigQuery calls)
    all_codes = set()
    for t in all_tsis:
        if t.my_parent_task is None:
            if t.requested_by: all_codes.add(t.requested_by)
            if t.assigned_to: all_codes.add(t.assigned_to)
    _batch_load_names(all_codes, emp_repository)

    if is_admin:
        # SEC4/Approver: show ALL L1 root tasks
        root_tsis = [t for t in all_tsis if t.my_parent_task is None]
        for root_tsi in root_tsis:
            entry = _build_root_entry(root_tsi, all_tsis, emp_repository, tst_repository)
            if status_match and entry["status"] not in status_match:
                continue
            if type_l1 and type_l1.lower() not in entry.get("tst_l1_name", "").lower():
                continue
            if search and search.lower() not in (entry.get("title","")+entry.get("tsi_code","")).lower():
                continue
            seen_roots[root_tsi.tsi_id] = entry
    else:
        # Other SECs: show tasks where user is creator (requested_by) or assignee (assigned_to)
        emp_code = user.get("emp_code", "")
        # Also resolve emp_id for seed users (TRI compatibility)
        emp = emp_repository.get_by_code(emp_code)
        emp_id = emp.emp_id if emp else emp_code

        # Collect matching root TSIs: created by user OR assigned to user
        for tsi in all_tsis:
            if tsi.my_parent_task is not None:
                continue  # Skip non-root tasks

            requested_by = tsi.requested_by or ""
            assigned_to = tsi.assigned_to or ""

            is_mine = (
                requested_by in (emp_code, emp_id)
                or assigned_to in (emp_code, emp_id)
            )
            if not is_mine:
                continue

            root_id = tsi.tsi_id
            if root_id in seen_roots:
                continue

            entry = _build_root_entry(tsi, all_tsis, emp_repository, tst_repository)
            if status_match and entry["status"] not in status_match:
                continue
            if type_l1 and type_l1.lower() not in entry.get("tst_l1_name", "").lower():
                continue
            if search and search.lower() not in (entry.get("title","")+entry.get("tsi_code","")).lower():
                continue
            seen_roots[root_id] = entry

    tasks = list(seen_roots.values())

    # Pagination
    total = len(tasks)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = tasks[start:end]

    return send_success(data={
        "items": paginated,
        "total": total,
        "page": page,
        "page_size": page_size,
    })
