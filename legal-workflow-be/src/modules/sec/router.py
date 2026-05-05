"""SEC auth router -- login endpoint."""

from fastapi import APIRouter
from src.modules.sec.schema import LoginRequest
from src.modules.sec.service import get_permission_service
from src.modules.sec.google_auth import verify_google_token
from src.auth.jwt_utils import encode_jwt
from src.common.response import send_success, send_error

router = APIRouter(prefix="/api/auth", tags=["SEC Auth"])


@router.post("/login")
async def login(req: LoginRequest):
    """Login with email or Google token, return JWT with SEC permissions."""
    email = None

    if req.google_token:
        email = verify_google_token(req.google_token)
        if email is None:
            return send_error(message="Invalid Google token", status_code=401)
    elif req.email:
        email = req.email
    else:
        return send_error(message="Email or google_token required", status_code=400)

    svc = get_permission_service()
    print(f"[LOGIN] email={email}, type={type(svc).__name__}")
    try:
        perm = svc.get_by_email(email)
    except Exception as e:
        print(f"[LOGIN] ERROR: {e}")
        return send_error(message=f"Login error: {e}", status_code=500)
    if perm is None:
        print(f"[LOGIN] Employee not found for email={email}")
        return send_error(message=f"Employee not found: {email}", status_code=401)

    payload = perm.model_dump()
    payload["empsec"] = payload["empsec"].value if hasattr(payload["empsec"], "value") else payload["empsec"]
    token = encode_jwt(payload)

    return send_success(data={"token": token, "user": payload})
