# Legal Workflow — Staging API Guide

> Hướng dẫn cho AI agent / script / FE khác gọi sang backend staging.

## Base URL

```
https://lww-backend-21672960606.asia-southeast1.run.app
```

- **Cloud Run IAM**: public (allUsers có roles/run.invoker) — không cần GCP token
- **CORS**: allow-list theo origin (xem Lớp 2)
- **Auth**: JWT Bearer (trừ vài endpoint public)

---

## Lớp 1 — Health check

```bash
curl https://lww-backend-21672960606.asia-southeast1.run.app/api/health
# → 200 {"success":true,"data":{"version":"0.1.0"},"message":"OK"}
```

⚠️ KHÔNG có `/health` (thiếu prefix /api) — sẽ trả 404.

---

## Lớp 2 — CORS

Allow-list origin:

| Origin | Allowed |
|---|---|
| http://localhost:5173 / :5174 / :5175 / :5176 / :3000 | ✅ |
| https://lww-frontend-21672960606.asia-southeast1.run.app | ✅ |
| https://lww.mikai.tech | ✅ |
| Khác | ❌ 400 "Disallowed CORS origin" |

Server-to-server (curl, Postman, requests lib) KHÔNG bị CORS ảnh hưởng — bỏ qua lớp này.

Thêm origin mới: sửa `src/config/settings.py` → redeploy.

---

## Lớp 3 — Authentication (JWT)

### Login

```
POST /api/auth/login
Content-Type: application/json

{"email": "trungnv1@apero.vn"}            # dev/staging
{"google_token": "eyJ..."}                # production (Google ID token)
```

**Response 200**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "emp_code": "F.00323",
      "emp_name": "TrungNV1",
      "empsec": "SEC1",
      "role_legal": "Approver",
      "exp": 1776769246
    }
  },
  "message": "OK"
}
```

**Response 401**:
- Invalid Google token → token Google sai
- Employee not found → email chưa có trong BigQuery permissions

### Gọi endpoint protected

Mọi endpoint (trừ /api/health, /api/auth/login, /docs, /openapi.json) yêu cầu:

```
Authorization: Bearer <token>
```

Thiếu → 401 {"detail":"Not authenticated"}.

---

## Endpoint chính

| Method | Path | Mục đích |
|---|---|---|
| POST | /api/auth/login | Login, nhận JWT |
| GET | /api/health | Health check |
| GET | /api/legal/my-tasks?page=1&page_size=20 | List task của user |
| GET | /api/legal/task/{tsi_id} | Chi tiết task |
| POST | /api/legal/task/{tsi_id}/approve | Approve step |
| POST | /api/legal/task/{tsi_id}/reject | Reject (body {"reason":"..."}) |
| POST | /api/legal/task/{tsi_id}/upload-file | Upload doc (multipart) |
| POST | /api/legal/task/{tsi_id}/ai-review | AI review document |
| POST | /api/legal/task/{tsi_id}/trademark-check/submit | Submit TM check (LF220) |
| GET | /api/legal/task/{tsi_id}/trademark-check/status | Poll status |
| GET | /api/legal/task/{tsi_id}/trademark-check/result | Cached result |
| PUT | /api/legal/task/{tsi_id}/metadata | Update LF240 metadata |
| GET | /api/legal/dashboard/stats | KPI dashboard |
| GET | /api/legal/emp/assignable | List reviewer/approver |

Full spec: GET /docs (Swagger) hoặc GET /openapi.json.

---

## Trademark Check flow (LF220)

```
1. POST /api/legal/task/{tsi_id}/trademark-check/submit
   Body: {
     "appNames": [{"appName":"MyApp","subtitle":"AI Editor"}],
     "platform": "ios",
     "shortDescs": ["AI photo enhance"],
     "iconUrls": ["https://cdn/icon.png"]
   }
   → 200 {"job_id":"uuid","status":"processing"}

2. Poll mỗi 5-10s:
   GET /api/legal/task/{tsi_id}/trademark-check/status
   → {"status":"pending"|"processing"|"completed"|"failed"}

3. Completed:
   → {"status":"completed","result":{"results":[...]}}
```

Typical duration: 7-10 phút.

---

## End-to-end example (Python)

```python
import requests, time

BASE = "https://lww-backend-21672960606.asia-southeast1.run.app"
EMAIL = "trungnv1@apero.vn"

# Login
r = requests.post(f"{BASE}/api/auth/login", json={"email": EMAIL})
token = r.json()["data"]["token"]
H = {"Authorization": f"Bearer {token}"}

# Submit TM check
tsi_id = "TSI-xxx"
r = requests.post(
    f"{BASE}/api/legal/task/{tsi_id}/trademark-check/submit",
    json={
        "appNames": [{"appName": "PhotoAI", "subtitle": "AI Photo Editor"}],
        "platform": "ios",
        "iconUrls": ["https://cdn.apero.vn/photoai/icon.png"],
    },
    headers=H,
)
print(r.json())

# Poll
while True:
    time.sleep(10)
    d = requests.get(f"{BASE}/api/legal/task/{tsi_id}/trademark-check/status", headers=H).json()["data"]
    print("status:", d.get("status"))
    if d.get("status") in ("completed", "failed"):
        print(d.get("result") or d.get("error"))
        break
```

---

## End-to-end example (JavaScript)

```js
const BASE = "https://lww-backend-21672960606.asia-southeast1.run.app";

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return (await r.json()).data.token;
}

async function submitTm(token, tsiId, payload) {
  const r = await fetch(`${BASE}/api/legal/task/${tsiId}/trademark-check/submit`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

const token = await login("trungnv1@apero.vn");
const result = await submitTm(token, "TSI-xxx", {
  appNames: [{ appName: "PhotoAI" }],
  platform: "ios",
});
```

---

## End-to-end example (bash)

```bash
BASE="https://lww-backend-21672960606.asia-southeast1.run.app"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"trungnv1@apero.vn"}' | python -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")

curl -sS "$BASE/api/legal/my-tasks?page=1&page_size=5" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Troubleshooting

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| 404 trên /health | Thiếu /api prefix | Dùng /api/health |
| 401 Not authenticated | Thiếu Bearer token | Login trước, gắn header |
| 401 Employee not found | Email chưa có trong BigQuery permissions | Contact admin |
| 400 Disallowed CORS origin | Browser gọi, origin không allow-list | Thêm vào CORS_ORIGINS + redeploy, hoặc gọi server-side |
| TM API submit failed | Agent-Legal upstream lỗi | Check https://agent-legal.coderhanoi.id.vn/health |
| CORS error browser console | Response không kèm CORS header | Check origin trong allow-list |

---

## Response envelope (thống nhất)

```json
// Success
{"success": true, "data": <any>, "message": "OK"}

// Error
{"success": false, "error": "message", "detail": "..."}
```

---

## Rate limit & timeout

- Không rate limit (Cloud Run auto-scale)
- Cold start ~1-5s request đầu
- TM check async — submit trả ngay, poll riêng
- Client timeout recommend: 30s submit, 10s poll

---

## Verified 2026-04-21

| Check | Status |
|---|---|
| Cloud Run IAM public | ✅ allUsers có roles/run.invoker |
| /api/health | ✅ 200 OK |
| CORS allow localhost:5173 | ✅ |
| CORS deny evil.com | ✅ 400 |
| Login trungnv1@apero.vn | ✅ JWT returned |
| Protected endpoint no token | ✅ 401 |
| Protected endpoint with token | ✅ 200 (48 tasks) |
