# LEGAL WORKFLOW - SESSION COMPACT HANDOFF

> **Date**: 2026-03-27 | **Branch**: master | **Status**: Phase 10 Complete (36/36 steps)

---

## 1. PROJECT OVERVIEW

| Item | Detail |
|------|--------|
| **Backend** | Python FastAPI @ port 8100, SQLite (WAL), 16 modules |
| **Frontend** | React 18 + Vite + Tailwind + Shadcn UI @ port 5173 |
| **Auth** | JWT (PyJWT), Zustand store, role-based guards |
| **Tests** | 158 BE (ALL PASS) + 32 FE (2 pre-existing failures) |
| **Workflows** | 4 seeded: LF210 (Copyright), LF220 (Trademark), LF230 (Policy), LF240 (Contract) |
| **E2E** | All 4 workflows have passing end-to-end tests |
| **Database** | SQLite, 14 tables, WAL mode, auto-seed on startup |
| **LOC** | ~3,088 total (2,100 BE + 988 FE) |

---

## 2. TECH STACK

```
Backend:  FastAPI 0.115.6 | Uvicorn | Pydantic 2 | PyJWT | SQLite (WAL) | pytest
Frontend: React 18 | TypeScript | Vite 5 | Tailwind CSS | Shadcn/Radix | Zustand | Axios | Vitest
```

---

## 3. DIRECTORY STRUCTURE

```
Legal/
├── .claude/launch.json              # FE dev server config
├── architecturepack_Legal_v7.md     # Full architecture (56K lines, LATEST)
├── IncrementalStepPlan-Legal.md     # 36-step plan
├── HUONG_DAN_SU_DUNG.md            # Vietnamese user guide
├── generate_doc.js                  # Doc generation utility
│
├── legal-workflow-be/
│   ├── .env                         # JWT secret, DB path, CORS, AI keys
│   ├── legal.db                     # SQLite database (auto-created)
│   ├── requirements.txt             # Python deps
│   ├── pytest.ini
│   ├── uploads/                     # File upload storage
│   ├── src/
│   │   ├── app.py                   # FastAPI app + startup + 16 routers
│   │   ├── auth/                    # jwt_utils.py, dependencies.py
│   │   ├── common/                  # response.py, status_machine.py
│   │   ├── config/                  # database.py (14 tables), settings.py
│   │   ├── seeds/                   # 9 seed files (emp, tst, tnt, trt, lf210-240)
│   │   └── modules/
│   │       ├── tst/                 # TaskType (hierarchical L1/L2/L3)
│   │       ├── tnt/                 # TaskNextType (transitions + conditions)
│   │       ├── tdt/                 # TaskDocType
│   │       ├── tdtp/                # TaskDocTypeTemplate (1:1 TDT)
│   │       ├── trt/                 # TaskRoleType (4 roles)
│   │       ├── emp/                 # Employee (6 seeded, read-only)
│   │       ├── tsi/                 # TaskItem (CORE) + my_tasks_router
│   │       ├── tsi_filter/          # Filter values per task
│   │       ├── tsev/                # TaskEvent (audit log)
│   │       ├── tri/                 # TaskRoleItem (assignments)
│   │       ├── tdi/                 # TaskDocItem (documents)
│   │       ├── filters/             # Filter lookups
│   │       ├── workflow/            # ENGINE: engine.py, assignment.py, condition_evaluator.py
│   │       ├── dashboard/           # Summary metrics
│   │       ├── ai_review/           # AI document review
│   │       └── reports/             # SLA + Workload
│   └── tests/                       # 29 files, 158 tests
│       ├── conftest.py, helpers.py
│       ├── test_*.py (24 unit test files)
│       └── integration/ (5 E2E files: lf210, lf220, lf230, lf240, final)
│
└── legal-workflow-fe/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig*.json
    ├── dist/                        # Build output (ready)
    └── src/
        ├── main.tsx, App.tsx        # Entry + Router (10 routes)
        ├── components/
        │   ├── auth/RoleGuard.tsx
        │   └── layout/AppLayout.tsx, Sidebar.tsx
        ├── pages/                   # 11 pages
        │   ├── LoginPage.tsx        # JWT token input
        │   ├── DashboardPage.tsx    # Summary cards
        │   ├── MyTasksPage.tsx      # Task list + filters
        │   ├── CreateTaskPage.tsx   # Task creation form
        │   ├── TaskDetailPage.tsx   # Full task view + actions
        │   ├── Config*.tsx          # TST, TRT, TDT, Filters (admin)
        │   ├── SLAReportPage.tsx
        │   └── WorkloadReportPage.tsx
        ├── services/api.ts          # Axios + JWT interceptor → localhost:8100/api
        ├── stores/auth.store.ts     # Zustand
        └── __tests__/ (8 test files)
```

---

## 4. DATABASE SCHEMA (14 Tables)

### Config Tables
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `tst` | TaskType (52 rows, L1/L2/L3) | tst_id, tst_code, tst_name, tst_level, myParentTask, sla_days |
| `tnt` | TaskNextType (~40 transitions) | tnt_id, from_tst_id, to_tst_id, condition_expr, priority |
| `tdt` | TaskDocType (~18 rows) | tdt_id, tdt_code, tdt_name |
| `tdtp` | TaskDocTypeTemplate (1:1 TDT) | tdtp_id, tdt_id, template_file_ref, template_structure |
| `trt` | TaskRoleType (4 roles) | trt_id, trt_code, trt_name |
| `tst_trt` | TST ↔ TRT junction | tst_id, trt_id |
| `tst_tdt` | TST ↔ TDT junction | tst_id, tdt_id |
| `tst_filter` | TST filter config | tst_id, filter_entity, filter_code |
| `emp` | Employee (6 rows) | emp_code, emp_name, email, department |

### Transaction Tables
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `tsi` | TaskItem (instances) | tsi_id, tsi_code, tst_id, status, parent_tsi_id, created_by |
| `tsi_filter` | Filter values per TSI | tsi_id, filter_entity, filter_code, filter_value |
| `tdi` | TaskDocItem (uploads) | tdi_id, tsi_id, tdt_id, file_path, version |
| `tsev` | TaskEvent (audit log) | tsev_id, tsi_id, event_type, event_data, created_by |
| `tri` | TaskRoleItem (assignments) | tri_id, tsi_id, trt_id, emp_code |

### Status Machine
```
DRAFT → IN_PROGRESS → PENDING_REVIEW → SUBMITTED → APPROVED → COMPLETED
                                                  → REJECTED (→ loops back)
Any → CANCELLED
```

---

## 5. API ENDPOINTS (~35)

### Config (ADMIN)
```
GET/POST    /api/config/tst          # TaskType CRUD
PUT/DELETE  /api/config/tst/{id}
GET/POST    /api/config/tnt          # Transitions (query: ?from_tst_id=)
GET/POST    /api/config/tdt          # DocType
POST        /api/config/tdtp         # DocTypeTemplate
GET/POST    /api/config/trt          # RoleType
POST        /api/config/tst-trt      # Mappings
POST        /api/config/tst-tdt
POST        /api/config/tst-filter
```

### Operations (Authenticated)
```
GET         /api/emp                 # Employee list
GET         /api/emp/{code}
POST        /api/task                # Create task (TSI L1 → auto L2/L3)
GET         /api/task/{id}           # Task detail (tree, docs, events, roles)
POST        /api/task/{id}/approve   # Approve → next step
POST        /api/task/{id}/reject    # Reject → branch/loop
POST        /api/task/{id}/event     # Add event (comment, etc.)
POST        /api/task/{id}/document  # Upload document
POST        /api/tri                 # Assign role
GET         /api/my-tasks            # Current user's tasks
GET         /api/dashboard           # Summary metrics
GET         /api/reports/sla         # SLA report
GET         /api/reports/workload    # Workload report
GET         /api/health              # Health check
```

---

## 6. WORKFLOW ENGINE (Core Logic)

### engine.py — Auto-navigation
```python
navigate_and_create_first_step(tsi_l1):
  1. Find L1's TST → get L2 children
  2. Create TSI L2 (first phase)
  3. Find L2's TST → get L3 children
  4. Evaluate TNT conditions → pick first matching L3
  5. Create TSI L3 (first step) with status IN_PROGRESS
  6. Copy filters from L1 → L2 → L3
  7. Trigger auto-assignment
```

### assignment.py — Filter matching
```python
assign_handler(tsi_l3):
  1. Get TST's required roles (via tst_trt)
  2. For each role, find TRI pool
  3. Match TSI_Filter values against employee scope
  4. Auto-assign best match
```

### condition_evaluator.py — JSON Logic
- Evaluates TNT condition_expr against TSI context
- Supports: ==, !=, >, <, and, or, in, round_count

---

## 7. FOUR WORKFLOWS

### LF210 - Copyright Review
- L1: LF210 → L2: LF211 (Input), LF212 (Review)
- L3: LF211.1 (Prepare) → LF212.1-212.5 (5 review steps)
- Roles: SUBMITTOR, LEGAL_APPROVER
- Docs: UI_COMPARISON, COPYRIGHT_REPORT

### LF220 - Trademark Check
- Similar hierarchy, 7-8 sub-steps
- Roles: SUBMITTOR, TEAM_APPROVER, LEGAL_APPROVER

### LF230 - Policy Review
- Parallel branches (PP, TOS) + review loop
- Reject-branching with condition evaluation

### LF240 - Contract Review (Most Complex)
- 19 TST, 24 TNT
- Parallel review, escalation, round_count branching
- 7-level approval chain

---

## 8. SEED DATA

### Employees (6)
| emp_code | Name | Role Context |
|----------|------|-------------|
| TiepTA | Tiep Tran | Submittor |
| MinhPT | Minh Pham | Team Approver |
| TrungNV | Trung Nguyen | Finance Approver |
| HuongLT | Huong Le | Legal Approver |
| LanNTH | Lan Nguyen | Submittor |
| DucNH | Duc Nguyen | Multi-role |

### TST L1 IDs
| Code | Workflow | TST ID |
|------|----------|--------|
| TST-001 | LF210 Copyright | First L1 |
| TST-010 | LF220 Trademark | Second L1 |
| TST-021 | LF230 Policy | Third L1 |
| TST-034 | LF240 Contract | Fourth L1 |

### Roles (4)
SUBMITTOR, TEAM_APPROVER, FINANCE_APPROVER, LEGAL_APPROVER

---

## 9. STARTUP COMMANDS

```bash
# Backend
cd legal-workflow-be
pip install -r requirements.txt
python -m uvicorn src.app:app --host 0.0.0.0 --port 8100 --reload

# Frontend
cd legal-workflow-fe
npm install
npm run dev   # → http://localhost:5173

# Swagger
http://localhost:8100/api/docs

# Run BE tests
cd legal-workflow-be && python -m pytest -v

# Run FE tests
cd legal-workflow-fe && npx vitest run
```

### JWT Token (for testing)
```python
import jwt, datetime
token = jwt.encode({
    "emp_code": "TiepTA",
    "emp_name": "Tiep Tran",
    "roles": ["SUBMITTOR"],
    "exp": datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=8)
}, "legal-workflow-dev-secret-key-change-in-production", algorithm="HS256")
```

---

## 10. KNOWN ISSUES

1. **FE test failures** (pre-existing): `CreateTask.test.tsx` & `TaskDetail.test.tsx` — API response format mismatch
2. **datetime.utcnow()** deprecation warnings in Python — replace with `datetime.now(UTC)`
3. **Missing SQLite indexes** — add on tsi_id, tst_id, emp_code for performance

---

## 11. RECOMMENDED NEXT STEPS

1. Fix 2 failing FE tests (API response format alignment)
2. Add SQLite indexes on frequently queried columns
3. Replace deprecated datetime.utcnow()
4. Docker deployment configuration
5. CI/CD pipeline setup
6. Production .env configuration
7. TDTP template rendering (document generation from templates)

---

## 12. KEY ARCHITECTURE DECISIONS

- **SQLite** over BigQuery — simpler, in-memory for tests
- **WAL Mode** — better read concurrency
- **Service Layer**: Repository → Service → Router pattern
- **Hierarchical Tasks**: L1 (workflow) → L2 (phase) → L3 (step)
- **JSON Logic** for TNT condition evaluation
- **Filter Matching** for auto-assignment
- **Conditional Seed** — one-time init on startup
- **Zustand** for FE auth state (lightweight)
- **Shadcn UI** — pre-built, customizable components

---

## 13. IMPORTANT FILE REFERENCES

| File | Purpose |
|------|---------|
| `architecturepack_Legal_v7.md` | **MASTER REFERENCE** — full system design (56K lines) |
| `IncrementalStepPlan-Legal.md` | 36-step implementation roadmap |
| `legal-workflow-be/src/app.py` | FastAPI app entry + all router registrations |
| `legal-workflow-be/src/config/database.py` | Full 14-table schema |
| `legal-workflow-be/src/modules/workflow/engine.py` | Core workflow navigation logic |
| `legal-workflow-be/src/modules/workflow/assignment.py` | Auto-assignment logic |
| `legal-workflow-be/src/modules/tsi/service.py` | TSI create/approve/reject |
| `legal-workflow-be/src/seeds/` | All seed data (4 workflows) |
| `legal-workflow-fe/src/App.tsx` | FE router + routes |
| `legal-workflow-fe/src/services/api.ts` | API client config |

---

*Generated: 2026-03-27 | Phase 10 Complete | 36/36 Steps | 158 BE + 32 FE Tests*
