"""Dashboard service -- aggregate task statistics."""

from src.modules.tsi.repository import tsi_repository
from src.modules.tri.repository import tri_repository
from src.modules.tst.repository import tst_repository
from src.modules.emp.repository import emp_repository


def _get_latest_status(root_tsi, all_tsis):
    """Get the latest L3 status for a root task (same logic as my_tasks)."""
    root_id = root_tsi.tsi_id
    l2s = [t for t in all_tsis if t.my_parent_task == root_id]
    all_l3s = []
    for l2 in l2s:
        l3s = [t for t in all_tsis if t.my_parent_task == l2.tsi_id]
        all_l3s.extend(l3s)
    if all_l3s:
        all_l3s.sort(key=lambda t: t.updated_at, reverse=True)
        s = all_l3s[0].status
        return s.value if hasattr(s, "value") else s
    s = root_tsi.status
    return s.value if hasattr(s, "value") else s


def get_dashboard_data(emp_code=None, role=None):
    """Dashboard counts based on L1 root tasks only (consistent with My Tasks)."""
    all_tsis = tsi_repository.get_all()
    root_tsis = [t for t in all_tsis if t.my_parent_task is None]


    # Role-scoped filtering (non-admin sees only their tasks)
    if role != "ADMIN":
        emp = emp_repository.get_by_code(emp_code) if emp_code else None
        emp_id = emp.emp_id if emp else emp_code
        filtered = []
        for root in root_tsis:
            req = root.requested_by or ""
            asgn = root.assigned_to or ""
            if req in (emp_code, emp_id) or asgn in (emp_code, emp_id):
                filtered.append(root)
        root_tsis = filtered


    # Count by latest status (same logic as My Tasks)
    summary = {"pending": 0, "in_progress": 0, "completed": 0, "overdue": 0}
    by_type = {"copyright": 0, "trademark": 0, "policy": 0, "contract": 0}

    for root in root_tsis:
        status = _get_latest_status(root, all_tsis)


        # Check overdue
        from datetime import datetime, date
        if root.due_date:
            try:
                due = date.fromisoformat(root.due_date) if isinstance(root.due_date, str) else root.due_date
                if due < date.today() and status not in ("COMPLETED", "APPROVED"):
                    summary["overdue"] += 1
            except Exception:
                pass
        if status in ("PENDING", "PENDING_REVIEW", "SUBMITTED"):
            summary["pending"] += 1
        elif status == "IN_PROGRESS":
            summary["in_progress"] += 1
        elif status in ("COMPLETED", "APPROVED"):
            summary["completed"] += 1
        elif status == "REJECTED":
            summary["pending"] += 1  # Rejected goes back to pending

        # By type
        tst = tst_repository.get_by_id(root.tst_id)
        if tst:
            name = tst.tst_name.lower()
            if "copyright" in name:
                by_type["copyright"] += 1
            elif "trademark" in name:
                by_type["trademark"] += 1
            elif "policy" in name:
                by_type["policy"] += 1
            elif "contract" in name:
                by_type["contract"] += 1

        # Recent tasks (5 most recent L1 roots)
    recent = sorted(root_tsis, key=lambda t: t.created_at, reverse=True)[:5]
    recent_tasks = []
    for r in recent:
        tst = tst_repository.get_by_id(r.tst_id)
        recent_tasks.append({
            "tsi_id": r.tsi_id,
            "tsi_code": r.tsi_code,
            "title": r.title,
            "type": tst.tst_name if tst else "",
            "status": _get_latest_status(r, all_tsis),
            "created_at": r.created_at.isoformat() if hasattr(r.created_at, "isoformat") else str(r.created_at),
        })
    return {"summary": summary, "by_type": by_type, "recent_tasks": recent_tasks}
