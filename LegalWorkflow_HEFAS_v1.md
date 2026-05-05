# LEGAL WORKFLOW — Architecture Pack (Harness Agent HEFAS)
## Phiên bản: v0.1 HEFAS Harness Agent — v1b (Agent-Native + MCP)
### Ngày: 2026-04-22
### Framework: HEFAS v2.0 — Hierarchical Task Structure (L0-L6)
### Approach: BAP — Business-Agent-Performance

---

> **Mục đích:** Tái cấu trúc hệ thống Legal Workflow (LF210/LF220/LF230/LF240) sang kiến trúc Agent-Native với MCP Tools và Decision Rules. Khi thay đổi yêu cầu nghiệp vụ (đổi LLM, đổi ngưỡng risk, thêm workflow con), chỉ cần cập nhật agent prompt/rules/config, KHÔNG cần sửa code Python/TypeScript.
>
> **Thay đổi chính so với hiện tại:**
> 1. **MCP Tool Servers** thay thế hard-coded API calls đến OpenAI/Claude/agent-legal
> 2. **Decision Rules** thay thế if/else branching theo `tst_id.startsWith("TST-010")` trong FE và backend
> 3. **Agent Definition** chuẩn hóa cho 4 workflow: TrademarkCheckAgent, CopyrightReviewAgent, PolicyReviewAgent, ContractReviewAgent
> 4. **Configurable Parameters** thay thế hard-coded constants
>
> **Nguyên tắc:** Nghiệp vụ thay đổi → cập nhật Decision Rules + Parameters → agent tự áp dụng. KHÔNG cần deploy code.

---

# MỤC LỤC HEFAS

| Layer | Tên | HEFAS Code | Nội dung |
|-------|-----|------------|----------|
| — | **Architecture Overview** | — | So sánh v1a vs v1b, use cases, FAQ |
| L0 | Setup Harness | T000 | Infrastructure, config, GCP credentials |
| L1 | Business Harness | T100 | Domain model (TSI/TST/TDI/TSEV/EMP), 4 workflow types |
| L2 | Performance Harness | T200 | Service boundaries, caching, async polling |
| L3 | Agent Tool Harness — MCP | T300 | MCP Server catalog: legal-doc-mcp, trademark-mcp, permission-mcp, notify-mcp |
| L4 | Agent Behavior Harness — Agent-Native | T400 | 4 workflow agents, decision rules, configurable parameters |
| L5 | Implementation Harness | T500 | Cloud SQL schema, FastAPI endpoints, React UI contracts |
| L6 | Operational Harness | T600 | Cloud Run deploy, monitoring, feedback loop |

---

# ARCHITECTURE OVERVIEW: CÁCH TRIỂN KHAI VÀ VẬN HÀNH v1b

## So sánh vận hành v1a vs v1b

### v1a — Cách hiện tại (code cứng)

```
FE React ──REST─> FastAPI BE ──> OpenAI/Claude (AI Review)
                              └─> agent-legal.coderhanoi.id.vn (Trademark)
```

Khi submitter bấm "Run Trademark Check":
1. FE gọi `POST /api/legal/task/{tsi_id}/trademark-check/submit`
2. BE **code cứng** payload shape, hard-code `TM_BASE_URL`, proxy agent-legal
3. Agent-legal chạy pipeline 6 sources — hard-coded risk threshold, Nice classes [9, 42]
4. Kết quả cached TSI.metadata
5. FE render với **code cứng** `isLF220 = tst_id.startsWith("TST-010")`

Đổi nghiệp vụ → sửa code → commit → Cloud Build → deploy → downtime.

### v1b — Cách mới (Agent-Native + MCP)

```
FE React ──REST─> FastAPI BE ──> Agent Runtime (MOI)
                                   │ (đọc Decision Rules + Agent Prompt từ CONFIG)
                                   └─> MCP Tool Servers (wrap code cũ)
                                        ├─> OpenAI/Claude (AI Review)
                                        └─> agent-legal (Trademark)
```

Khác biệt:
- **FE:** Không đổi, vẫn gọi cùng endpoints
- **BE:** Endpoints giữ nguyên, logic điều khiển bởi W-RULE
- **Tools:** Code gọi upstream vẫn tồn tại, đóng gói MCP Tool với config runtime

## Ba loại workload trong Legal v1b

| Loại | Workload | Cách hoạt động | Ai gọi MCP? |
|------|----------|----------------|-------------|
| **Agent-Driven** | AI Review, Trademark Check, Policy Review, Contract Check | Agent Runtime đọc Decision Rules | Agent |
| **Scheduler-Driven** | SLA monitoring, Overdue email, Weekly report | Cron gọi MCP cố định | Scheduler |
| **User-Driven Sync** | Task CRUD, upload, approve/reject | FE → BE trực tiếp | FE |

### Tại sao SLA là Scheduler-Driven?

Pipeline cố định, không rẽ nhánh. Giá trị v1b: **ops linh hoạt** — bật/tắt reminder, đổi cron time, đổi template qua config.

## Cụ thể: Cùng 1 use case, v1a vs v1b

### Use case 1: Submit LF220 task

**v1a:**
```
FE → POST /api/legal/task
  → BE code cứng auto-deadline T+1 cho LF220
  → FE navigate TaskDetailPage
  → useEffect code cứng isLF220 = tst_id.startsWith("TST-010")
```

**v1b:**
```
FE → POST /api/legal/task (endpoint giữ nguyên)
  → BE tra W-RULE-101: "Trademark Check → deadline T+{{TM_DEADLINE_DAYS}}"
  → W-RULE-102: "Trademark Check → TrademarkCheckAgent"
  → TrademarkCheckAgent đọc A-TM-001 → quyết định load result hay show form
```

### Use case 2: Đổi LLM từ GPT-4 → Claude Opus

**v1a:** Sửa service.py → build → deploy BE

**v1b:** Config `AI_REVIEW_MODEL = "claude-opus-4-6"` → agent tự dùng → KHÔNG deploy

### Use case 3: Thêm workflow LF250 (NDA Review)

**v1a:** Sửa BE + FE, deploy 2 services

**v1b:**
1. DB: thêm TST-050 templates (SQL migration)
2. Config: row workflow_rules + agent_config cho NDAReviewAgent
3. FE tự detect workflow từ `/api/legal/workflow-types`
4. KHÔNG deploy code

### Use case 4: Bỏ VietnamIP source (SSL fail)

**v1a:** Không thể — agent-legal là external (Coderhanoi)

**v1b:** Config `TM_SOURCES_ENABLED: ["WIPO_NAME","USPTO_NAME","StoreSearch"]` → Runtime filter trước khi trả FE

## Câu hỏi thường gặp

### Agent Runtime là gì?

Layer logic mới trong `lww-backend` (không service riêng):
- Load Agent Prompts, Decision Rules, Configurable Parameters từ `agent_config`
- Nhận trigger từ API hoặc Cloud Scheduler
- Chọn Agent → đọc rules → gọi MCP Tools

| Cách | Mô tả | Phù hợp |
|------|-------|---------|
| **A: Embedded** | Tích hợp `lww-backend`, module `agent_runtime/` | **Recommend iteration 1** |
| **B: Centralized** | Service mới `legal-agent-orchestrator` | Kiến trúc sạch, thêm service |

### MCP Tools có phải viết lại code?

**Không.** Wrapper quanh code hiện có:

```python
# v1a giữ nguyên
def submit_trademark_check(payload, thread_id=None):
    body = {"message": f"/trademark-check {json.dumps(payload)}"}
    return requests.post(f"{TM_BASE_URL}/chat", json=body, timeout=30).json()

# v1b thêm wrapper
@mcp_tool("submit_trademark_check")
def submit_trademark_check_tool(input):
    base_url = config.get("TM_API_URL")
    enabled_sources = config.get("TM_SOURCES_ENABLED")
    payload = input.dict()
    payload["_meta"] = {"enabled_sources": enabled_sources}
    return TrademarkSubmitOutput(submit_trademark_check(payload))
```

### Config lưu ở đâu?

| Option | Ưu/nhược |
|--------|---------|
| **Cloud SQL** (`agent_config` table) | Dễ CRUD, cache 60s — **recommend** |
| **GCS bucket** YAML | Audit qua versioning, cần reload |
| **Secret Manager** | Cho credentials |

## Tác động đến từng vai trò

| Góc nhìn | Thay đổi? |
|----------|-----------|
| Legal officer | Không thấy gì khác |
| FE developer | Không đổi endpoint, thêm fetch workflow-config |
| BE developer | Code cũ giữ, bọc MCP. Điều phối từ if/else → Rules |
| DevOps | Vẫn Cloud Run, thêm service hoặc tích hợp |
| Legal Manager / Product | **Hưởng lợi lớn nhất** — đổi SLA/LLM/sources qua config |

---

# LAYER 0: SETUP HARNESS (T000)

## T011 — Project Directory Structure

```
Legal_v2/
├── legal-workflow-be/             # FastAPI (Cloud Run: lww-backend)
│   ├── src/
│   │   ├── app.py                 # create_app() factory
│   │   ├── auth/                  # JWT
│   │   ├── modules/
│   │   │   ├── ai_review/         # → legal-doc-mcp
│   │   │   ├── trademark_check/   # → trademark-mcp
│   │   │   ├── sec/               # → permission-mcp
│   │   │   ├── notify/            # → notify-mcp
│   │   │   ├── tsi/, tst/, tdi/, tsev/, emp/, dashboard/
│   │   │   └── agent_runtime/     # MỚI v1b
│   │   └── config/
│   ├── Procfile
│   ├── .python-version
│   └── requirements.txt
├── legal-workflow-fe/             # React/Vite (lww-frontend)
│   ├── src/
│   │   ├── pages/                 # MyTasks, TaskDetail, CreateTask
│   │   ├── components/
│   │   ├── stores/                # Zustand
│   │   └── services/api.ts
│   ├── server.js                  # Node static
│   └── package.json
└── docs/
```

## T012 — Technology Stack

**Backend (Python 3.13 FastAPI):**
- Cloud Run: `lww-backend-21672960606.asia-southeast1.run.app`
- FastAPI 0.115, Pydantic 2.10, PyJWT, SQLAlchemy + psycopg2-binary 2.9.10
- Cloud SQL PostgreSQL, BigQuery, GCS, Gmail SMTP
- openai SDK, anthropic SDK, requests (agent-legal)

**Frontend (React 19 Vite 8):**
- Cloud Run: `lww-frontend-21672960606.asia-southeast1.run.app`
- Zustand 5, React Router 7.13, Tailwind CSS 4.2, Phosphor Icons
- Build Vite → serve Node http server

**Infrastructure:**
- Cloud Run (asia-southeast1), max-instances=3
- Cloud SQL PostgreSQL: legal-workflow-db (db-f1-micro)
- BigQuery: v_auth_lookup permission matrix
- GCS: apero-legal-storage

**External AI:**
- OpenAI (gpt-4o-mini) — AI Review
- Claude (claude-sonnet-4-6) — alternative
- Agent-Legal: https://agent-legal.coderhanoi.id.vn — Trademark (6 sources)

---

# LAYER 1: BUSINESS HARNESS (T100)

## T110 — Entity Catalog

### ERD100 — Task Management:

| Code | Entity | Table | Vai trò |
|------|--------|-------|---------|
| TST | TaskTemplate | tst | Template L1-L3 |
| TSI | TaskInstance | tsi | Task thực tế |
| TDI | TaskDocument | tdi | File/link per L3 |
| TSEV | TaskEvent | tsev | Audit log |
| ASG | Assignment | assignment | TSI ↔ EMP |

### ERD200 — Identity & Permission:

| Code | Entity | Location | Vai trò |
|------|--------|----------|---------|
| EMP | Employee cache | emp | Cache từ BigQuery |
| SEC | Permission | BigQuery v_auth_lookup | Source of truth |

## T122 — Workflow Types (LF2xx)

| Code | Template | Use Case | AI | Deadline |
|------|----------|----------|----|----|
| **LF210** | TST-001* | Copyright Check | AI Review (OpenAI) | T+1 |
| **LF220** | TST-010* | Trademark Check | AI Review + agent-legal TM | T+1 |
| **LF230** | TST-020* | Policy Review | AI Review (Claude) | T+2 |
| **LF240** | TST-034* | Contract Review | AI Review + LF240 metadata | T+1 |

---

# LAYER 2: PERFORMANCE HARNESS (T200)

## T211 — Cross-service Dependencies

```
lww-frontend ─HTTP─> lww-backend
                        ├─HTTP─> agent-legal (Coderhanoi)
                        ├─HTTPS─> openai.com / api.anthropic.com
                        ├─SQL─> Cloud SQL PostgreSQL
                        ├─API─> BigQuery v_auth_lookup
                        ├─API─> GCS apero-legal-storage
                        └─SMTP─> smtp.gmail.com:465
```

## T212 — Resilience Patterns

| Upstream | Failure | Current | v1b Target |
|----------|---------|---------|------------|
| agent-legal TM | Timeout, 500, recursion, SSL | Retries 0 | MCP retry 3x, circuit breaker, fallback sources |
| OpenAI/Claude | 429 | Bubble error | Exponential backoff, model fallback |
| BigQuery | Quota | Cache 5min | TTL cache Redis/SQL |
| GCS upload | Timeout | Error user | Resumable, background retry |
| SMTP | Rate limit 500/day | Silent fail | Queue Cloud Tasks |

## T220 — Caching Strategy

| Data | Layer | TTL | Invalidation |
|------|-------|-----|--------------|
| TM result | TSI.metadata | Permanent (24h upstream) | On resubmit |
| AI Review | TSEV event_data | Permanent (audit) | Never |
| Permission | In-memory | 5min | On login |
| Assignable employees | In-memory | 60s | On page load |

---

# LAYER 3: AGENT TOOL HARNESS — MCP (T300)

## 3.1 — legal-doc-mcp (6 tools)

Purpose: AI-powered document review (Copyright, Policy, Contract).

| # | Tool | Input | Output | LLM? | v1a Method |
|---|------|-------|--------|------|-----------|
| 1 | `read_document_content` | `{tdi_id}` | `{text, pages, mime}` | No | `ai_review.file_reader.read_file_content` |
| 2 | `review_copyright` | `{text, template: "TST-001"}` | `{verdict, score, checklist, summary}` | LLM | `ai_review.service.run_ai_review` |
| 3 | `review_policy` | `{text, policy_framework}` | `{verdict, score, risks[]}` | LLM | — (new) |
| 4 | `review_contract` | `{text, partner_info, pe_code}` | `{verdict, score, clauses_flagged[]}` | LLM | — (partial) |
| 5 | `extract_document_entities` | `{text}` | `{parties[], dates[], amounts[]}` | LLM light | — |
| 6 | `compare_doc_versions` | `{tdi_id_v1, tdi_id_v2}` | `{changes[], summary}` | LLM | — |

## 3.2 — trademark-mcp (5 tools)

Purpose: Wrapper quanh agent-legal Trademark Check API.

| # | Tool | Input | Output | LLM? | v1a Method |
|---|------|-------|--------|------|-----------|
| 1 | `submit_trademark_check` | `{appNames[], platform, shortDescs[], iconUrls[], features[], enabled_sources[]}` | `{jobId, threadId, status}` | No | `trademark_check.service.submit_trademark_check` |
| 2 | `get_trademark_status` | `{jobId}` | `{status, result?, error?}` | No | `trademark_check.service.get_trademark_status` |
| 3 | `normalize_trademark_result` | `{raw_response}` | `{status, result, error}` | No | v1b (hiện trong router.py) |
| 4 | `filter_trademark_sources` | `{result, enabled_sources[]}` | `{filtered}` | No | v1b new |
| 5 | `summarize_trademark_risk` | `{result}` | `{overall_risk, recommendations[], summary}` | LLM Vietnamese | v1b new |

## 3.3 — permission-mcp (4 tools)

| # | Tool | Input | Output | LLM? | v1a Method |
|---|------|-------|--------|------|-----------|
| 1 | `lookup_employee_permission` | `{email}` | `{emp_code, empsec, role_legal, cdt}` | No | `sec.service.get_by_email` |
| 2 | `list_assignable_users` | `{workflow_type}` | `{users[]}` | No | `emp.router /assignable` |
| 3 | `verify_action_authority` | `{emp_code, tsi_id, action}` | `{authorized, reason}` | No | (dispersed) |
| 4 | `cache_invalidate_permission` | `{email?}` | `{invalidated}` | No | v1b new |

## 3.4 — notify-mcp (5 tools)

| # | Tool | Input | Output | LLM? | v1a Method |
|---|------|-------|--------|------|-----------|
| 1 | `send_reviewer_notification` | `{tsi_id, reviewer_email}` | `{sent}` | No | `notify.service.send_reviewer_notification` |
| 2 | `send_back_to_submitter` | `{tsi_id, rejected_steps[], note}` | `{sent}` | LLM optional | `notify.service.send_back_notification` |
| 3 | `send_overdue_reminder` | `{tsi_ids[]}` | `{sent_count}` | No | cron TBD |
| 4 | `generate_email_body` | `{template_id, context}` | `{html, text}` | LLM Claude | v1b new |
| 5 | `track_notification_history` | `{tsi_id, channel, recipient}` | `{logged}` | No | (dispersed) |

## 3.5 — storage-mcp (4 tools)

| # | Tool | Input | Output | LLM? | v1a Method |
|---|------|-------|--------|------|-----------|
| 1 | `upload_document` | `{tsi_id, file, filename, mime}` | `{gs_url, size}` | No | `tdi.router /upload-file` |
| 2 | `generate_signed_url` | `{gs_url, ttl, for_download}` | `{signed_url}` | No | `tdi.service.resolve_file_url` |
| 3 | `delete_document` | `{tdi_id}` | `{deleted}` | No | `tdi.router DELETE` |
| 4 | `extract_doc_preview` | `{tdi_id}` | `{thumbnail_url, preview_text}` | No | v1b new |

## 3.6 — dashboard-mcp (3 tools)

| # | Tool | Input | Output | LLM? | v1a Method |
|---|------|-------|--------|------|-----------|
| 1 | `compute_kpi_stats` | `{emp_code, date_range}` | `{total, completed, pending, overdue, by_workflow}` | No | `dashboard.service` |
| 2 | `list_recent_tasks` | `{emp_code, limit}` | `{tasks[]}` | No | `dashboard.service` |
| 3 | `generate_exec_summary` | `{stats, timeframe}` | `{summary_text}` | LLM Claude business | v1b new |

## 3.7 — Tổng hợp

| MCP Server | Số tool | Domain |
|-----------|---------|--------|
| legal-doc-mcp | 6 | AI doc review |
| trademark-mcp | 5 | Trademark (agent-legal wrapper) |
| permission-mcp | 4 | SEC lookup |
| notify-mcp | 5 | Email + in-app |
| storage-mcp | 4 | GCS ops |
| dashboard-mcp | 3 | KPI aggregation |
| **Tổng** | **27** | |

---

# LAYER 4: AGENT BEHAVIOR HARNESS — AGENT-NATIVE (T400)

## T410 — Agent Catalog

### 4.1 — CopyrightReviewAgent (LF210)

Tools: legal-doc-mcp (read, review_copyright, extract_entities), storage-mcp (signed_url), notify-mcp (send_reviewer, track_history), permission-mcp (verify_authority)

System Prompt:
```
Ban la CopyrightReviewAgent. Nhiem vu: review tai lieu ban quyen LF210.

KHI NHAN REQUEST:
1. Doc tsi_id, load progress tree
2. Ap dung A-COPY-001

QUY TRINH:
- read_document_content cho moi doc trong activeL3
- review_copyright(text, template="TST-001") — model={{LLM_MODEL_COPYRIGHT}}
- IF PASS AND score>={{AUTO_APPROVE_THRESHOLD}}: auto-approve
- IF FAIL: flag, send_back
- IF PASS_WITH_NOTES: cho human Checker review
- Log TSEV (emp_id="AI_REVIEWER")
```

Params: `LLM_MODEL_COPYRIGHT=gpt-4o-mini`, `AUTO_APPROVE_THRESHOLD=85`, `COPYRIGHT_PROMPT`, `MAX_DOCUMENT_SIZE_MB=10`

### 4.2 — TrademarkCheckAgent (LF220)

Tools: trademark-mcp (all 5), legal-doc-mcp (read_doc optional), notify-mcp (send_reviewer, track_history)

System Prompt:
```
Ban la TrademarkCheckAgent. Nhiem vu: kiem tra trademark LF220.

KHI NHAN REQUEST:
1. Validate: appNames[0].appName khong rong, platform in [ios, android]
2. Ap dung A-TM-001

SUBMIT:
- Normalize iconUrl: drive.google.com/file/d/X/view → uc?export=view&id=X
- Filter sources theo {{TM_SOURCES_ENABLED}}
- submit_trademark_check

POLL (moi {{TM_POLL_INTERVAL}}s):
- get_trademark_status(jobId)
- IF completed/failed:
    - normalize_trademark_result
    - IF empty result va completed: treat as failed
    - filter_trademark_sources
    - summarize_trademark_risk
    - save TSI.metadata
- IF elapsed > {{TM_MAX_POLL_DURATION}}: timeout

LUU Y: Icon URL HTTPS + .png/.svg. Max 1 concurrent TM job per TSI.
```

Params: `TM_API_URL=https://agent-legal.coderhanoi.id.vn`, `TM_SOURCES_ENABLED=["WIPO_NAME","USPTO_NAME","StoreSearch","WIPOImage"]`, `TM_POLL_INTERVAL=10`, `TM_MAX_POLL_DURATION=900`, `TM_NICE_CLASSES=[9,42]`

### 4.3 — PolicyReviewAgent (LF230)

Tools: legal-doc-mcp (read, review_policy, extract_entities), storage-mcp, notify-mcp

System Prompt:
```
Ban la PolicyReviewAgent. Nhiem vu: review policy compliance LF230.

1. Load doc
2. review_policy(text, framework={{POLICY_FRAMEWORK}})
3. IF risks > {{MAX_RISKS_AUTO}}: require Approver
4. Summary Vietnamese, log TSEV
```

Params: `LLM_MODEL_POLICY=claude-sonnet-4-6`, `POLICY_FRAMEWORK=apero-2026-v1`, `MAX_RISKS_AUTO=3`

### 4.4 — ContractReviewAgent (LF240)

Tools: legal-doc-mcp (read, review_contract, extract_entities), storage-mcp (signed_url, upload), notify-mcp (send_reviewer, generate_email)

System Prompt:
```
Ban la ContractReviewAgent. Nhiem vu: review hop dong doi tac LF240.

1. Load metadata (PE code, partner info, purpose)
2. Validate required fields
3. review_contract(text, partner_info, pe_code)
4. extract_document_entities: verify parties match metadata
5. Flag clauses {{FLAG_CLAUSES}}
6. Send to Approver with summary
```

Params: `LLM_MODEL_CONTRACT=claude-opus-4-6`, `CONTRACT_DEADLINE_DAYS=2`, `REQUIRE_PE_CODE=true`, `FLAG_CLAUSES=["indemnity","liability_cap","ip_assignment","termination"]`

### 4.5 — NotifyOverdueAgent (Scheduled)

Tools: dashboard-mcp (compute_kpi_stats), notify-mcp (send_overdue, generate_email, track_history)

System Prompt:
```
Ban la NotifyOverdueAgent. Chay {{CRON_HOUR}}h moi sang.

1. compute_kpi_stats(date_range=today) → overdue list
2. Group by submitter email
3. Cho moi submitter:
    - generate_email_body(template="overdue_reminder", context)
    - send_overdue_reminder(tsi_ids)
    - track_notification_history
```

Params: `CRON_HOUR=9`, `CRON_ENABLED=true`, `REMINDER_INCLUDE_MANAGER=true`

## T420 — Decision Rules Framework

> 2 cấp: W-RULE (workflow-level) + A-xxx (agent-level)

## 5.0 — Workflow-Level Rules (W-RULE)

### W-RULE-101: CopyrightReviewAgent on LF210
```yaml
trigger: User clicks "AI Check" OR step SUBMITTED
condition: workflow_type == "LF210" AND activeL3 has documents
action: invoke CopyrightReviewAgent with {tsi_id, activeL3_id}
```

### W-RULE-102: TrademarkCheckAgent on LF220
```yaml
trigger: User opens TaskDetailPage for LF220
condition: workflow_type == "LF220"
action: invoke TrademarkCheckAgent.loadCachedResult OR showForm
```

### W-RULE-103: PolicyReviewAgent on LF230
```yaml
trigger: User clicks "AI Check" on LF230
condition: workflow_type == "LF230" AND activeL3 has documents
action: invoke PolicyReviewAgent
```

### W-RULE-104: ContractReviewAgent on LF240
```yaml
trigger: User clicks "Submit to Review" on LF240
condition: workflow_type == "LF240" AND metadata complete
action: invoke ContractReviewAgent
fallback: validation error if metadata missing
```

### W-RULE-105: Daily overdue reminder
```yaml
trigger: Cloud Scheduler cron 9am Asia/Ho_Chi_Minh
condition: CRON_ENABLED == true
action: invoke NotifyOverdueAgent
schedule: "0 9 * * *"
```

### W-RULE-106: Send-back on reject
```yaml
trigger: Approver clicks "Send Back to Submitter"
condition: any L3 status=REJECTED
action: invoke send_back_to_submitter tool (no agent)
```

## 5.1 — A-COPY-001: Copyright review pipeline
```yaml
rules:
  step_1: load_active_l3(tsi_id) → tdi_id list
  step_2: for each tdi_id: read_document_content
  step_3: review_copyright(text, template=activeL3.tst_id)
  step_4: IF PASS AND score>={{AUTO_APPROVE_THRESHOLD}}: auto-approve
          ELSE IF FAIL: flag + notify
          ELSE: human review
  step_5: log TSEV
```

## 5.2 — A-TM-001: Submit + poll flow
```yaml
rules:
  submit_1: validate_input({appNames, platform, iconUrl?})
  submit_2: normalizeIconUrl — Drive /view → uc?export=view&id=
  submit_3: filter sources by {{TM_SOURCES_ENABLED}}
  submit_4: submit_trademark_check → jobId
  submit_5: save jobId to TSI.metadata, status="processing"
  poll every {{TM_POLL_INTERVAL}}s:
    p1: get_trademark_status(jobId)
    p2: normalize_trademark_result
    p3: IF completed/failed:
          filter_trademark_sources
          summarize_trademark_risk
          save TSI.metadata
          break
    p4: IF elapsed > {{TM_MAX_POLL_DURATION}}: mark timeout
```

## 5.2b — A-TM-002: Retry with fallback sources
```yaml
trigger: A-TM-001 fails with "VietnamIP" or "circuit breaker"
rules:
  step_1: retry with TM_SOURCES_ENABLED=["WIPO_NAME","USPTO_NAME","StoreSearch"]
  step_2: IF fail again: escalate admin, notify user
```

## 5.3 — A-POL-001: Policy review
```yaml
rules:
  step_1: read_document_content(tdi_id)
  step_2: review_policy(text, framework={{POLICY_FRAMEWORK}})
  step_3: IF risks > {{MAX_RISKS_AUTO}}:
            flag for manager (role_legal=Approver)
          ELSE: auto-summarize, notify Checker
  step_4: log TSEV
```

## 5.4 — A-CON-001: Contract review
```yaml
rules:
  pre: validate metadata [requester_phone, manager_email, partner_contact_email, pe_code, purpose]
  step_1: read_document_content(contract_tdi)
  step_2: extract_document_entities(text)
  step_3: verify parties.match metadata.partner_info (similarity > 0.8)
  step_4: review_contract(text, partner_info, pe_code)
  step_5: flag clauses in {{FLAG_CLAUSES}}
  step_6: generate summary, send to Approver
```

## 5.5 — A-OVD-001: Daily overdue scan
```yaml
rules:
  step_1: query tasks WHERE due_date < today AND status NOT IN [COMPLETED, REJECTED]
  step_2: group by submitter_email
  step_3: for each submitter:
            generate_email_body(template="overdue_reminder", context)
            send_overdue_reminder(tsi_ids)
            IF {{REMINDER_INCLUDE_MANAGER}}: CC manager_email
            track_notification_history
```

## T460 — Configurable Parameters

| Category | Parameter | Current | Update |
|----------|-----------|---------|--------|
| **AI Review** | LLM_MODEL_COPYRIGHT | "gpt-4o-mini" | agent_config |
| | LLM_MODEL_POLICY | "claude-sonnet-4-6" | agent_config |
| | LLM_MODEL_CONTRACT | "claude-opus-4-6" | agent_config |
| | AUTO_APPROVE_THRESHOLD | 85 | agent_config |
| **Trademark** | TM_API_URL | "agent-legal.coderhanoi.id.vn" | Secret Manager |
| | TM_SOURCES_ENABLED | ["WIPO_NAME","USPTO_NAME","StoreSearch","WIPOImage"] | agent_config |
| | TM_POLL_INTERVAL | 10 | agent_config |
| | TM_MAX_POLL_DURATION | 900 | agent_config |
| **Notification** | EMAIL_FROM | "trungnv1@apero.vn" | Secret Manager |
| | CRON_OVERDUE_HOUR | 9 | agent_config |
| | REMINDER_INCLUDE_MANAGER | true | agent_config |
| **Contract** | CONTRACT_DEADLINE_DAYS | 2 | agent_config |
| | REQUIRE_PE_CODE | true | agent_config |
| | FLAG_CLAUSES | ["indemnity","liability_cap","ip_assignment","termination"] | agent_config |
| **Storage** | MAX_UPLOAD_SIZE_MB | 10 | agent_config |
| **Cache** | PERMISSION_CACHE_TTL | 300 | agent_config |

## T470 — Cách cập nhật khi nghiệp vụ thay đổi

| Loại | Ví dụ | Cập nhật | Deploy? |
|------|-------|----------|---------|
| Đổi LLM | gpt-4o-mini → claude-sonnet | LLM_MODEL_COPYRIGHT | KHÔNG |
| Đổi ngưỡng | 85 → 90 | AUTO_APPROVE_THRESHOLD | KHÔNG |
| Bỏ VietnamIP | SSL fail | TM_SOURCES_ENABLED | KHÔNG |
| Đổi email sender | | EMAIL_FROM (Secret) | KHÔNG |
| Đổi cron | 9am → 10am | CRON_OVERDUE_HOUR | KHÔNG |
| Thêm LF250 | NDA Review | workflow_rules + agent_config | KHÔNG |
| Sửa prompt | | COPYRIGHT_PROMPT | KHÔNG |
| Đổi Nice classes | Add class 35 | (Coderhanoi external) | Họ deploy |

---

# LAYER 5: IMPLEMENTATION HARNESS (T500)

## T510 — Database Schema

```sql
-- Task instances
CREATE TABLE tsi (
  tsi_id VARCHAR PRIMARY KEY,
  tsi_code VARCHAR,
  tst_id VARCHAR REFERENCES tst(tst_id),
  my_parent_task VARCHAR,
  title TEXT, status VARCHAR, priority VARCHAR,
  due_date DATE, assigned_to VARCHAR, requested_by VARCHAR,
  created_at TIMESTAMP,
  metadata JSONB
);

CREATE TABLE tst (
  tst_id VARCHAR PRIMARY KEY,
  tst_name TEXT, tst_level INT,
  parent_tst_id VARCHAR,
  template_json JSONB
);

CREATE TABLE tdi (
  tdi_id VARCHAR PRIMARY KEY,
  tsi_id VARCHAR REFERENCES tsi(tsi_id),
  tdt_id VARCHAR, file_name TEXT,
  file_url TEXT, link_url TEXT, version INT,
  uploaded_by VARCHAR, uploaded_at TIMESTAMP
);

CREATE TABLE tsev (
  tsev_id VARCHAR PRIMARY KEY,
  tsi_id VARCHAR REFERENCES tsi(tsi_id),
  event_type VARCHAR, emp_id VARCHAR,
  event_data JSONB, created_at TIMESTAMP
);

-- v1b NEW
CREATE TABLE agent_config (
  config_id VARCHAR PRIMARY KEY,
  agent_name VARCHAR, param_name VARCHAR,
  param_value JSONB,
  updated_by VARCHAR, updated_at TIMESTAMP,
  UNIQUE (agent_name, param_name)
);

CREATE TABLE workflow_rules (
  rule_id VARCHAR PRIMARY KEY,
  rule_type VARCHAR, agent_name VARCHAR,
  rule_yaml TEXT,
  enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMP
);
```

**BigQuery v_auth_lookup:**
```sql
(google_email, emp_code, emp_name, empgrade, empsec, pt_allowed, cdt_allowed, cdt, role_legal)
```

## T520 — API Contracts

**Auth:** `POST /api/auth/login`

**Task:** `GET /api/legal/my-tasks`, `GET /api/legal/task/{tsi_id}`, `POST /api/legal/task/{tsi_id}/{approve|reject|upload-file|send-back|notify-reviewer}`, `PUT /api/legal/task/{tsi_id}/{metadata|reassign}`

**AI & TM:** `POST /api/legal/task/{tsi_id}/ai-review`, `POST /api/legal/task/{tsi_id}/trademark-check/submit`, `GET /api/legal/task/{tsi_id}/trademark-check/{status|result}`

**Dashboard:** `GET /api/legal/dashboard/stats`, `GET /api/legal/emp/assignable`

**v1b NEW:** `GET /api/legal/workflow-types`, `GET|PUT /api/legal/agent-config/{agent_name}/{param}`

## T530 — Agent Runtime Skeleton

```python
# src/modules/agent_runtime/runtime.py
class AgentRuntime:
    def __init__(self):
        self.config = ConfigLoader()       # agent_config table
        self.rules = RuleLoader()           # workflow_rules table
        self.tools = MCPToolRegistry()

    async def invoke(self, agent_name: str, context: dict) -> dict:
        rules = self.rules.get_for_agent(agent_name)
        system_prompt = self.config.get(f"{agent_name}.SYSTEM_PROMPT")

        workflow_rule = self.rules.match_workflow(context)
        if not workflow_rule:
            return {"error": "No matching workflow rule"}

        for rule in rules:
            for step in rule.steps:
                tool_input = self._resolve(step.input, context)
                result = await self.tools.call(step.tool, tool_input)
                context[step.output_key] = result
                if step.break_condition and self._eval(step.break_condition, context):
                    break
        return context

# router.py (v1b)
@router.post("/task/{tsi_id}/trademark-check/submit")
async def submit_check(tsi_id: str, req, user=Depends(get_current_user)):
    return await agent_runtime.invoke("TrademarkCheckAgent", {
        "action": "submit", "tsi_id": tsi_id,
        "payload": req.dict(), "user": user,
    })
```

## T540 — Testing Strategy

| Level | Tool | Scope |
|-------|------|-------|
| Unit | pytest | MCP tool wrappers |
| Integration | pytest + httpx | Agent Runtime + DB + mock MCP |
| E2E | Playwright | FE + real BE staging |
| Chaos | Manual | Kill agent-legal → MCP retry + fallback |

---

# LAYER 6: OPERATIONAL HARNESS (T600)

## T610 — Deployment Strategy

**Current v1a:**
- `gcloud run deploy lww-backend --source . --region asia-southeast1`
- `gcloud run deploy lww-frontend --source . --region asia-southeast1`
- Rollback: `gcloud run services update-traffic --to-revisions REV=100`

**v1b additions:**
- agent_config migration via Alembic
- GCS config: gs://apero-legal-config/agent-rules/
- Cloud Scheduler for W-RULE-105
- Langfuse for LLM tracing

## T620 — Monitoring

**Cloud Monitoring:** request_count, latencies p50/p95/p99, custom (trademark_check_success_rate, ai_review_latency_ms)

**Cloud Logging:** structured JSON, filter by agent_name / workflow_type

**Alerts:**
- BE 5xx rate > 1% → PagerDuty
- TM failure > 50% in 10min → Slack #legal-ops
- Overdue > 20 → email manager

**Dashboards:** Grafana (system), LWW FE /dashboard (business)

## T630 — Feedback Loop

**Audit trail:** All agent actions → TSEV with `emp_id="AI_REVIEWER"` or `"SYSTEM"`

**Human-in-the-loop:** AI verdict displayed, requires human Checker approve. Checker marks AI wrong → feedback improves prompt

**Config versioning:** agent_config.updated_by / updated_at, revert via SQL or admin UI

---

# APPENDIX: SUMMARY

**Legal Workflow v0.1 HEFAS v1b:**
- **7 Layers**: L0-L6
- **6 MCP Servers**: legal-doc-mcp (6), trademark-mcp (5), permission-mcp (4), notify-mcp (5), storage-mcp (4), dashboard-mcp (3) = **27 tools**
- **5 Main Agents**: CopyrightReviewAgent (LF210), TrademarkCheckAgent (LF220), PolicyReviewAgent (LF230), ContractReviewAgent (LF240), NotifyOverdueAgent
- **6 W-RULE + Agent-Level Rules** (A-COPY, A-TM, A-POL, A-CON, A-OVD)
- **20+ Configurable Parameters** — runtime updates without deploy
- **Tech**: Python 3.13 FastAPI + React 19 Vite, Cloud SQL PostgreSQL, BigQuery, GCS, Cloud Run asia-southeast1
- **AI**: OpenAI (Copyright), Claude (Policy/Contract), agent-legal Coderhanoi (Trademark external)
- **Framework**: HEFAS v2.0 Hierarchical, BAP (Business-Agent-Performance)

---

> **Tổng kết:**
> - 7 Layers hierarchical
> - 27 MCP tools wrap existing code
> - 5 Agents (4 workflow + 1 scheduled)
> - Decision Rules W-RULE + A-RULE
> - 20+ params runtime updates
> - Backward compatible: FE endpoints unchanged, BE re-organized
> - External: agent-legal.coderhanoi.id.vn (Coderhanoi) — v1b wrapper adds filter + normalize + fallback
> - Key: Configuration + Rules → No code redeploy for business changes
