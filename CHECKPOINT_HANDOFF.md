# LEGAL WORKFLOW — Session Checkpoint & Handoff

**Người bàn giao:** TrungNV1 (`trungnv1@apero.vn`) + Claude Code Assistant
**Ngày:** 2026-04-23
**Mục đích:** Document hoàn chỉnh để người tiếp theo có đủ context tiếp tục công việc

---

## 1. Tổng quan dự án

**Legal Workflow App** của Apero Group — quản lý 4 loại task pháp lý:
- **LF210** Copyright Check
- **LF220** Trademark Check (tích hợp agent-legal external API)
- **LF230** Policy Review
- **LF240** Contract Review

**Roles:** Submitter / Checker / Approver — phân quyền qua BigQuery `v_auth_lookup` + JWT.

---

## 2. Production / Staging URLs

### Live services (Cloud Run, project `fp-a-project`, region `asia-southeast1`)

| Service | Latest revision | URL |
|---------|-----------------|-----|
| **Backend** (FastAPI) | `lww-backend-00058-r65` | https://lww-backend-21672960606.asia-southeast1.run.app |
| **Frontend** (React/Vite) | `lww-frontend-00052-8tp` | https://lww-frontend-21672960606.asia-southeast1.run.app |
| **Custom domain FE** | (cùng FE) | https://lww.mikai.tech |

### External AI services

| Service | URL | Status |
|---------|-----|--------|
| Agent-Legal (Trademark Check) | https://agent-legal.coderhanoi.id.vn | ❌ **Đang broken — silent fail 100%** |
| OpenAI API | api.openai.com | ✅ OK (gpt-4o-mini cho AI Review) |
| Anthropic Claude | api.anthropic.com | ✅ OK (alternative model) |

### Infrastructure

| Resource | Identifier |
|----------|-----------|
| GCP Project | `fp-a-project` |
| Cloud SQL | `legal-workflow-db` (db-f1-micro, asia-southeast1, PostgreSQL) |
| BigQuery view | `v_auth_lookup` (SEC permission matrix) |
| GCS bucket | `gs://apero-legal-storage/` (document uploads) |
| GCS config (proposed v1b) | `gs://apero-legal-config/` (chưa dùng) |
| Email sender | `trungnv1@apero.vn` (Gmail SMTP port 465) |
| Cloud Build trigger | `gcloud run deploy --source .` (buildpacks, no Dockerfile) |

---

## 3. Documents quan trọng (đọc theo thứ tự)

Tất cả lưu tại `C:\Users\Administrator\OneDrive\SEPO26\Legal_v2\`:

| # | File | Nội dung | Khi nào đọc |
|---|------|----------|-------------|
| 1 | **`STAGING_API_GUIDE.md`** (266 dòng) | Hướng dẫn gọi API staging — auth flow, endpoints, examples Python/JS/bash, troubleshooting | Đầu tiên — để hiểu API surface |
| 2 | **`LegalWorkflow_HEFAS_v1.md`** (1100+ dòng) | Architecture Pack v1b theo framework HEFAS — 7 layers L0-L6, 6 MCP servers / 27 tools, 5 agents, decision rules, configurable params | Khi muốn refactor sang v1b agent-native |
| 3 | **`AgentLegal_BugReport_Coderhanoi.md`** (397 dòng) | Bug report P0 chi tiết về 4 bugs upstream agent-legal, kèm evidence (jobIds, timestamps), proposed fixes, Apero workarounds | Khi liên hệ team Coderhanoi |
| 4 | `Agent-Legal Trademark Check API.txt` | Spec API gốc do Coderhanoi cung cấp (input schema, output schema, 6 data sources) | Tham chiếu khi debug TM |
| 5 | `architecturepack_Legal_v7.md` | Architecture pack version cũ hơn v7 (pre-HEFAS) | Tham khảo lịch sử |
| 6 | `SEC_Permission_System.md` | Phân quyền SEC0-SEC5 + role_legal | Khi làm việc với auth/role |
| 7 | `IncrementalStepPlan-Legal-SEC.md` | Plan implement SEC | Tham khảo plan cũ |
| 8 | `SESSION_COMPACT_HANDOFF.md` | Handoff từ session compact trước | Lịch sử session |

---

## 4. Source code structure

### Backend `legal-workflow-be/`

```
src/
├── app.py                          # FastAPI create_app() factory
├── auth/
│   ├── jwt_utils.py                # encode_jwt, decode_jwt
│   └── dependencies.py             # get_current_user
├── config/
│   ├── settings.py                 # CORS_ORIGINS, env vars
│   └── database.py                 # SQLAlchemy session
├── modules/
│   ├── ai_review/                  # AI Doc Review (Copyright/Policy/Contract)
│   │   ├── router.py               # POST /api/legal/task/{id}/ai-review
│   │   ├── service.py              # OpenAI/Claude call
│   │   └── file_reader.py          # Extract text from PDF/DOCX
│   ├── trademark_check/            # ⭐ ĐÃ ĐƯỢC ENHANCE TRONG SESSION NÀY
│   │   ├── router.py               # 4 endpoints: submit, status, result, trace
│   │   └── service.py              # Wrapper agent-legal
│   ├── sec/                        # SEC Permission via BigQuery
│   │   ├── router.py               # POST /api/auth/login
│   │   ├── service.py              # BigQuery query v_auth_lookup
│   │   └── google_auth.py          # Google ID token verify
│   ├── tsi/, tst/, tdi/, tsev/     # Task instance, template, document, event
│   ├── emp/                        # Employee cache + /assignable
│   ├── notify/                     # Email + send-back + reviewer notification
│   ├── filters/                    # PT/LE/CTY tags
│   └── dashboard/                  # KPI stats
├── common/
│   └── response.py                 # send_success, send_error envelope
└── modules/agent_runtime/          # ⭐ MỚI v1b (chưa implement)

# Top-level files
Procfile                            # web: uvicorn src.app:create_app --factory --host 0.0.0.0 --port ${PORT:-8080}
.python-version                     # 3.13.12
requirements.txt                    # FastAPI 0.115, psycopg2-binary 2.9.10, ...
```

### Frontend `legal-workflow-fe/`

```
src/
├── pages/
│   ├── LoginPage.tsx               # Google OAuth
│   ├── MyTasksPage.tsx             # Task list
│   ├── TaskDetailPage.tsx          # ⭐ ĐÃ ĐƯỢC ENHANCE TRONG SESSION NÀY (1100+ dòng)
│   ├── CreateTaskPage.tsx          # Create new task
│   ├── DashboardPage.tsx           # KPI dashboard
│   ├── ConfigTSTPage.tsx           # Admin TST config
│   ├── FiltersPage.tsx             # Admin filter manage
│   ├── SLAReportPage.tsx           # SLA report
│   ├── WorkloadPage.tsx            # Workload view
│   └── SettingsPage.tsx            # User settings
├── components/
│   ├── Sidebar.tsx                 # Navigation
│   ├── Header.tsx                  # Top bar
│   ├── SkeletonLoader.tsx          # Loading states
│   ├── EmptyState.tsx              # Empty states
│   └── ErrorBoundary.tsx
├── stores/
│   └── auth.store.ts               # Zustand with persist
└── services/
    └── api.ts                      # Axios client (VITE_API_URL)

# Top-level files
server.js                           # Node http static server (serves dist/ on $PORT)
package.json                        # "start": "node server.js"
.env.production                     # VITE_API_URL=https://lww-backend-21672960606...
```

---

## 5. Công việc đã hoàn thành trong session này

### 5.1 — Trademark Check API integration

**Đã build:**
- BE module `trademark_check/` proxy agent-legal (submit + poll)
- FE form input (App Name, Subtitle, Platform, Icon URL, Short Desc) trong TaskDetailPage cho LF220 tasks
- Cache result vào `TSI.metadata` JSON

### 5.2 — UI/UX improvements

| Feature | File | Description |
|---------|------|-------------|
| Auto-poll status | TaskDetailPage.tsx (useEffect line ~270) | Poll `/status` mỗi 15s khi `processing`, stop khi completed/failed. Hiển thị elapsed counter (M:SS). |
| Red error card với 4 nguyên nhân | TaskDetailPage.tsx | Khi failed/empty result, show card đỏ với hints VietnamIP/LangGraph/Drive/AppName |
| Risk summary pills | TaskDetailPage.tsx | High/Medium/Low count khi result valid |
| Agent Trace timeline expandable | TaskDetailPage.tsx | Button "Show Agent Trace (N)" → chronological steps với status colors |
| Failure classification pills | TaskDetailPage.tsx | `Reason: inferred_fast_fail` + `Upstream: 6.8s` + `Cooldown active (10 min)` |
| Icon URL real-time validator | TaskDetailPage.tsx | Warning khi paste Drive `/view` link (auto-convert khi submit) |
| Submit new check button | TaskDetailPage.tsx | Reset state để submit lại không cần reload |
| Cache-Control no-store | server.js | index.html không cache → user thấy bundle mới ngay |

### 5.3 — BE workarounds + structured logging

**File `legal-workflow-be/src/modules/trademark_check/router.py`:**

| Helper function | Purpose |
|----------------|---------|
| `_log_step()` | Emit Cloud Logging + persist TSEV row (audit trail). Mọi agent step đều ghi |
| `_normalize_icon_url()` | Convert Drive `/view` → `uc?export=view&id=...` |
| `_has_valid_result()` | Check result có `results[]` không empty |
| `_compute_upstream_duration()` | Tính delta `updatedAt - createdAt` từ agent-legal response |
| `_sanitize_app_name()` | Detect suspicious chars (`:`, `|`, `/`, `?`, `*`), length issues, whitespace |
| `_check_cooldown()` | Đọc `tm_check_cooldown_until` từ metadata, return remaining seconds |
| `_build_fail_error()` | Classify failure_reason: circuit_breaker_open / langgraph_recursion / upstream_ssl_fail / upstream_error / inferred_fast_fail / cached_error / unknown |

**Constants:**
- `FAIL_FAST_THRESHOLD_SEC = 30`
- `COOLDOWN_MINUTES = 10`
- `SUSPICIOUS_APPNAME_CHARS = (":", "|", "/", "?", "*")`

**Endpoints:**
- `POST /api/legal/task/{tsi_id}/trademark-check/submit` — log SUBMIT_START → VALIDATE_INPUT → SANITIZE_APPNAME → NORMALIZE_ICON_URL → UPSTREAM_SUBMIT → SAVE_METADATA. Check cooldown first (return 429 nếu đang cooldown).
- `GET /api/legal/task/{tsi_id}/trademark-check/status` — log CACHE_CHECK → UPSTREAM_POLL → NORMALIZE_RESULT → COOLDOWN_SET (nếu trigger) → SAVE_METADATA
- `GET /api/legal/task/{tsi_id}/trademark-check/result` — return cached, normalize completed+empty → failed
- `GET /api/legal/task/{tsi_id}/trademark-check/trace` — ⭐ MỚI — return chronological TSEV events filtered by `agent=TrademarkCheckAgent`

### 5.4 — Infrastructure fixes

| Fix | Why |
|-----|-----|
| Pin Python `3.13.12` trong `.python-version` | Buildpacks default Python 3.14, psycopg2-binary 2.9.9 không có wheel. 3.13 OK với 2.9.10 |
| Upgrade `psycopg2-binary` `2.9.9` → `2.9.10` | Có manylinux wheel cho cp313 |
| Tạo `Procfile` với uvicorn command | Buildpacks cần entrypoint cho Python project |
| FE `server.js` Node http static | Buildpacks không serve dist/ tự nhiên; thêm `"start": "node server.js"` vào package.json |
| FE `.env.production` | Vite build dùng `.env.production` chứ không phải `.env.local` |
| Cache-Control `no-store` cho index.html | Tránh browser cache HTML cũ → user không thấy bundle mới |

---

## 6. Bugs hiện tại (chưa giải quyết — phụ thuộc Coderhanoi)

Chi tiết trong `AgentLegal_BugReport_Coderhanoi.md`. Tóm tắt:

| Bug | Mức | Mô tả | Apero workaround | Coderhanoi cần fix |
|-----|-----|-------|------------------|---------------------|
| **D — Silent fail** | **P0** | `status=completed` + `result=null` + `error=null`, duration 3-7s. Reproducible 100% | Detect fail-fast (<30s) + classify `inferred_fast_fail` + show clear error message | Invariant assertion: completed phải có result hoặc error. Tracking stages_completed/failed |
| **A — VietnamIP SSL** | P1 | "VietnamIP failed after 3 attempts: unable to verify the first certificate" | (không thể fix client-side) | `rejectUnauthorized: false` hoặc cài CA chain |
| **B — Circuit breaker** | P1 | "Circuit breaker open for VietnamIP" → mọi job fail < 500ms | Client-side cooldown 10 phút | Isolate CB per-source + admin reset endpoint + expose state |
| **C — LangGraph recursion** | P2 | "Recursion limit of 25 reached" với input có `:` | Input sanitizer warning | Tăng `recursionLimit` config + debug graph cycle |

**Pattern thống kê:** 3 ngày liên tiếp (2026-04-21 → 2026-04-23), success rate **0%** — feature trademark check thực chất KHÔNG dùng được.

---

## 7. Cách deploy

### Backend
```bash
cd legal-workflow-be
gcloud run deploy lww-backend \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --quiet
```

### Frontend
```bash
cd legal-workflow-fe
gcloud run deploy lww-frontend \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated \
  --max-instances 3 \
  --quiet
```

### Rollback
```bash
gcloud run services update-traffic lww-backend \
  --region asia-southeast1 \
  --to-revisions <PREVIOUS_REVISION>=100
```

---

## 8. Testing cheatsheet

### Login + get JWT
```bash
BASE="https://lww-backend-21672960606.asia-southeast1.run.app"
TOKEN=$(curl -sS -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"trungnv1@apero.vn"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
```

### Test trademark check (đang cooldown sẽ trả 429)
```bash
TSI="TSI-xxx"  # task LF220
curl -sS -X POST "$BASE/api/legal/task/$TSI/trademark-check/submit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appNames":[{"appName":"PhotoAI"}],"platform":"ios"}'
```

### Xem agent trace timeline
```bash
curl -sS "$BASE/api/legal/task/$TSI/trademark-check/trace" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

### Health check upstream agent-legal trực tiếp
```bash
curl -sS https://agent-legal.coderhanoi.id.vn/health
# {"status":"healthy",...} (lưu ý: healthy nhưng functionally broken — false positive)
```

### Reproduce Bug D (silent fail) trực tiếp upstream
```bash
JOB=$(curl -sS -X POST "https://agent-legal.coderhanoi.id.vn/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"/trademark-check {\"appNames\":[{\"appName\":\"TestApp\"}],\"platform\":\"ios\"}"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['jobId'])")
echo "Job: $JOB"
sleep 10
curl -sS "https://agent-legal.coderhanoi.id.vn/status/$JOB" | python -m json.tool
# Expected: status=completed, result=null, KHÔNG có error sau <10s — Bug D pattern
```

---

## 9. Việc cần làm tiếp (đề xuất priority)

### Ngay lập tức (P0)
1. **Gửi `AgentLegal_BugReport_Coderhanoi.md`** cho team Coderhanoi qua Slack/email/ticket support
2. **Thông báo legal team** tạm ngưng dùng LF220 Trademark Check vì broken 100%
3. **Monitor Cloud Logging:** filter `jsonPayload.agent=TrademarkCheckAgent` để theo dõi pattern fail

### Ngắn hạn (P1)
4. **Admin reset cooldown endpoint:** `POST /api/legal/task/{tsi_id}/trademark-check/reset-cooldown` cho role Approver — hiện phải SQL thủ công
5. **Dashboard banner:** detect N lần fail-fast liên tiếp → hiện cảnh báo system-wide cho user
6. **Email template Vietnamese** cho bạn liên hệ Coderhanoi (draft sẵn nếu cần)
7. **Test FE auto-poll** với task có pipeline thành công (chờ Coderhanoi fix Bug D)

### Trung hạn (P2 — implement v1b HEFAS)
8. **Implement Agent Runtime layer** trong `lww-backend` theo `LegalWorkflow_HEFAS_v1.md`:
   - Tạo bảng `agent_config` + `workflow_rules` (Cloud SQL Alembic migration)
   - Module `src/modules/agent_runtime/` với `runtime.py`, `config_loader.py`, `rule_loader.py`, `mcp_registry.py`
   - Wrap existing modules thành MCP tools (không sửa logic, chỉ bọc)
9. **Migrate 5 agents** lần lượt: TrademarkCheckAgent → CopyrightReviewAgent → PolicyReviewAgent → ContractReviewAgent → NotifyOverdueAgent
10. **Admin UI** để CRUD `agent_config` + view `workflow_rules` qua web
11. **Cloud Scheduler** trigger NotifyOverdueAgent (W-RULE-105) — hiện chưa có cron

### Dài hạn (P3)
12. **Thêm Langfuse** cho LLM tracing (hiện chỉ có structured logging)
13. **Chaos engineering test:** kill agent-legal → verify MCP retry + fallback hoạt động
14. **Multi-tenancy:** support nhiều org cùng dùng (hiện chỉ Apero)

---

## 10. Liên hệ + Credentials

### Người liên quan
- **Owner:** TrungNV1 — `trungnv1@apero.vn` (legal-team@apero.vn nếu có)
- **Apero Group** — chủ codebase
- **Coderhanoi** — maintainer agent-legal API (đang owe fix 4 bugs P0/P1)

### Test users (BigQuery v_auth_lookup)
- **Approver:** `trungnv1@apero.vn` (emp_code F.00323, role_legal=Approver, empsec=SEC1)
- Tạo user mới: thêm row vào BigQuery `v_auth_lookup` table

### Credentials (KHÔNG checkin git)
- **OPENAI_API_KEY** — env var Cloud Run BE
- **ANTHROPIC_API_KEY** — env var Cloud Run BE
- **TM_API_URL** — `https://agent-legal.coderhanoi.id.vn` (env var)
- **GMAIL_APP_PASSWORD** — env var Cloud Run BE (cho SMTP send)
- **GCP service account** — auto-mounted bởi Cloud Run

---

## 11. Tóm tắt nhanh

**TL;DR cho người tiếp nhận:**

1. **Hệ thống hoạt động bình thường** trừ feature **LF220 Trademark Check** vì agent-legal upstream broken
2. **Apero đã workaround** bằng fail-fast detection, cooldown 10 phút, structured logging — UI không bị broken, có error message rõ ràng
3. **Cần Coderhanoi fix** 4 bugs (đặc biệt Bug D P0) — báo cáo chi tiết đã sẵn ở `AgentLegal_BugReport_Coderhanoi.md`
4. **Roadmap v1b** (refactor sang Agent-Native + MCP) đã có ở `LegalWorkflow_HEFAS_v1.md` — implementation chưa bắt đầu, chỉ là kiến trúc đề xuất
5. **Frontend & Backend** đều deploy trên Cloud Run asia-southeast1, build bằng `gcloud run deploy --source .` (Buildpacks)
6. **Logging:** mọi agent step ghi vào TSEV (PostgreSQL) + Cloud Logging — query qua endpoint `/trademark-check/trace` hoặc Cloud Console

### File checklist trong Legal_v2/

| File | Mục đích | Trạng thái |
|------|----------|------------|
| `STAGING_API_GUIDE.md` | API spec cho người gọi vào staging | ✅ Up-to-date |
| `LegalWorkflow_HEFAS_v1.md` | Architecture Pack v1b | ✅ Up-to-date |
| `AgentLegal_BugReport_Coderhanoi.md` | Bug report P0 | ✅ Up-to-date (v2) |
| **`CHECKPOINT_HANDOFF.md`** (file này) | Handoff document | ✅ Mới — đọc đầu tiên |

---

## 12. Glossary (thuật ngữ Apero-specific)

| Term | Nghĩa |
|------|-------|
| **TSI** | Task Instance — task thực tế của user, hierarchy theo template |
| **TST** | Task Template — definition L1/L2/L3 cho 4 workflow types |
| **TDI** | Task Document — file/link upload per L3 step |
| **TSEV** | Task Event — audit log (CREATE/APPROVE/REJECT/COMMENT/UPLOAD/AI agent step) |
| **EMP** | Employee — cache từ BigQuery |
| **SEC** | Security Permission — SEC0 (highest restrict) → SEC5 (open) |
| **CDT** | Cost Department — phân loại theo phòng ban |
| **PT** | Project Type — phân loại theo loại dự án |
| **role_legal** | Role trong workflow Legal — Submitter / Checker / Approver |
| **LF210/220/230/240** | 4 workflow types — Copyright/Trademark/Policy/Contract |
| **Agent-Legal** | Service external của Coderhanoi cho Trademark Check pipeline |
| **HEFAS** | Hierarchical Task Structure framework (L0-L6) — kiến trúc đề xuất v1b |
| **W-RULE / A-RULE** | Workflow-level / Agent-level Decision Rules trong v1b |
| **MCP** | Model Context Protocol — đóng gói tools cho AI agents (đề xuất v1b) |

---

> **Bàn giao xong.** Tất cả docs ở `C:\Users\Administrator\OneDrive\SEPO26\Legal_v2\`. Có thắc mắc liên hệ TrungNV1.
