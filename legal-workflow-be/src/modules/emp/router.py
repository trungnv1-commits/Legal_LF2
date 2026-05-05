"""EMP router — employee list and detail APIs."""

from fastapi import APIRouter, Depends, Query
from typing import Optional
from src.auth.dependencies import get_current_user
from src.common.response import send_success, send_error
from src.modules.emp.repository import emp_repository

router = APIRouter(
    prefix="/api/legal/emp",
    tags=["EMP"],
)


@router.get("/")
async def list_emp(
    department: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """List employees, optionally filtered by department."""
    items = emp_repository.get_all(department=department)
    return send_success(data=[item.model_dump(mode="json") for item in items])


@router.get("/assignable")
async def list_assignable(user: dict = Depends(get_current_user)):
    """List Checker + Approver users for task assignment (from BigQuery)."""
    import os
    results = []
    
    # Try BigQuery first
    if os.environ.get("USE_BIGQUERY_AUTH", "").lower() == "true":
        try:
            from google.cloud import bigquery
            client = bigquery.Client(project="fp-a-project")
            query = """
                SELECT emp_code, emp_name, role_legal, google_email
                FROM sec_data.v_auth_lookup
                WHERE role_legal IN ('Approver', 'Checker')
                ORDER BY role_legal, emp_name
            """
            rows = list(client.query(query).result())
            for row in rows:
                results.append({
                    "emp_code": row.emp_code if row.emp_code != '#N/A' else '',
                    "emp_name": row.emp_name,
                    "role_legal": row.role_legal,
                    "display": f"{row.emp_name} ({row.role_legal})",
                })
        except Exception as e:
            print(f"[EMP] BigQuery assignable lookup failed: {e}")
    
    # Fallback: local EMP + Mock
    if not results:
        try:
            from src.modules.sec.service import MockPermissionService
            for u in MockPermissionService.MOCK_DATA:
                if u.role_legal in ('Approver', 'Checker'):
                    results.append({
                        "emp_code": u.emp_code,
                        "emp_name": u.emp_name,
                        "role_legal": u.role_legal,
                        "display": f"{u.emp_name} ({u.role_legal})",
                    })
        except Exception:
            pass
    
    return send_success(data=results)


@router.get("/{emp_code}")
async def get_emp(emp_code: str, user: dict = Depends(get_current_user)):
    """Get employee detail by code."""
    emp = emp_repository.get_by_code(emp_code)
    if emp is None:
        return send_error(message=f"Employee '{emp_code}' not found", status_code=404)
    return send_success(data=emp.model_dump(mode="json"))


