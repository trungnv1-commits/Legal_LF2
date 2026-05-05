# Apero FP&A — Architecture V2

> Cập nhật: 2026-03-19
> Phiên bản: V2 — Tách 3 module: **FPA**, **P100**, **APR**

---

## Tổng quan

Tài liệu kiến trúc hệ thống **Apero FP&A (Financial Planning & Analysis)**, bao gồm:

- Git repositories
- Danh sách service
- Database architecture (BigQuery)
- Infrastructure & Deployment

Hệ thống được tổ chức thành **3 module chính**:

| Module | Tên đầy đủ | Mô tả |
|--------|-----------|-------|
| **FPA** | Financial Planning & Analysis | Phân bổ chi phí (Allocation), Báo cáo tài chính (Report), Cấu hình hệ thống |
| **P100** | P100 Data Synchronization | Đồng bộ dữ liệu từ hệ thống P100, Convert dữ liệu sang format chuẩn |
| **APR** | Approval & Payment System (FPS) | Quy trình phê duyệt, quản lý thanh toán, master data, workflow |
---

# Chú thích hệ thống

## User Groups

| Code | Nhóm | Mô tả |
|------|------|-------|
| BOD | Executive | Ban Giám Đốc — xem báo cáo tổng hợp cấp cao |
| FCOO | Finance | Bộ phận tài chính — quản lý & vận hành dữ liệu FP&A |
| MKT | Marketing | Bộ phận Marketing — nhập Plan Input MKT-X |
| MGT | Management | Các cấp quản lý, lãnh đạo phòng ban |

---

## System Components

| Code | Layer | Hệ thống | Mô tả |
|------|-------|----------|-------|
| META | Data Source | Google Sheets | Metadata & input thủ công |
| ETL | Pipeline | Google Colab | Xử lý & nạp dữ liệu vào BigQuery |
| Transform | Pipeline | Google BigQuery SQL | Xử lý & tổng hợp dữ liệu |
| BQ | Database | BigQuery | Kho dữ liệu trung tâm (project: `fp-a-project`) |
| BE | Backend | FP&A API (FastAPI) | Backend xử lý logic & transform |
| FE | Frontend | FP&A Dashboard (React) | Giao diện visualize báo cáo |
| INF | Infrastructure | GCP VM + Docker | Server deploy toàn bộ hệ thống |

---

# 1. Data Pipeline

## 1.1 Luồng dữ liệu tổng quát

```
Google Sheets (Metadata)
        ↓
  Google Colab (ETL)
        ↓
     BigQuery (fp-a-project)
        ↓
   FP&A Backend API (FastAPI)
        ↓
   FP&A Frontend Dashboard (React)
```

---

## 1.2 Data Sources

| STT | Nguồn | Loại | FPA | P100 | APR |
|-----|-------|------|-----|------|-----|
| 1 | Google Sheets — Metadata | Manual Input | v | | |
| 2 | Google Sheets — Config / Mapping | Manual Input | v | | |
| 3 | P100 System Output | Auto Sync | | v | |
| 4 | FPS Master Data | Manual + Auto | | | v |

---

## 1.3 ETL Pipeline (Google Colab)

| STT | Component | Chức năng | Output (BigQuery Table) |
|-----|-----------|-----------|------------------------|
| 1 | Ingest Data | Đọc Google Sheets → parse → load BQ | `alloc_input.so_rows` |
| 2 | Transform | Tính toán phân bổ chi phí | `alloc_stage.so_cell_processed_v2` |
| 3 | Data Mart | Tổng hợp báo cáo | `rep_data.rep_cell` |

---

# 2. Git Repositories

## 2.1 Repositories

| STT | Repo | Link | FPA | P100 | APR |
|----|------|------|-----|------|-----|
| 1 | fpa-frontend | https://github.com/fcootest/fpa-frontend | v | v | v |
| 2 | fpa-backend | https://github.com/fcootest/fpa-backend | v | v | v |

## 2.2 Backend — Cấu trúc thư mục theo Module

| STT | Thư mục / File | Link | FPA | P100 | APR | Mô tả |
|-----|---------------|------|-----|------|-----|-------|
| 1 | `api/main.py` | https://github.com/fcootest/fpa-backend/tree/main/api | v | v | v | FastAPI app init, health check, report/task endpoints |
| 2 | `api/task_queue.py` | https://github.com/fcootest/fpa-backend/tree/main/api | v | | | Async task queue cho report build |
| 3 | `api/plan_routes.py` | https://github.com/fcootest/fpa-backend/tree/main/api | v | | | Plan input endpoints (MKT-X, Subscription, PLA4) |
| 4 | `api/data_routes.py` | https://github.com/fcootest/fpa-backend/tree/main/api | | v | | P100 sync & convert endpoints |
| 5 | `api/process_routes.py` | https://github.com/fcootest/fpa-backend/tree/main/api | | | v | Workflow execution endpoints |
| 6 | `api/config_routes.py` | https://github.com/fcootest/fpa-backend/tree/main/api | v | | | Configuration CRUD |
| 7 | `api/auth_routes.py` | https://github.com/fcootest/fpa-backend/tree/main/api | v | v | v | Authentication/JWT |
| 8 | `api/security_routes.py` | https://github.com/fcootest/fpa-backend/tree/main/api | v | v | v | Security filters & roles |
| 9 | `calculate/allocation_runner_refactor.py` | https://github.com/fcootest/fpa-backend/tree/main/calculate | v | | | Allocation orchestration |
| 10 | `calculate/report_runner_refactor.py` | https://github.com/fcootest/fpa-backend/tree/main/calculate | v | | | Report generation orchestration |
| 11 | `calculate/calculate_orchestrator.py` | https://github.com/fcootest/fpa-backend/tree/main/calculate | v | | | Routes calc requests to engines |
| 12 | `calculate/mktx_engine.py` | https://github.com/fcootest/fpa-backend/tree/main/calculate | v | | | MKT-X calculations |
| 13 | `calculate/subscription_engine.py` | https://github.com/fcootest/fpa-backend/tree/main/calculate | v | | | Subscription calculations |
| 14 | `calculate/pla4_engine.py` | https://github.com/fcootest/fpa-backend/tree/main/calculate | v | | | PLA4-ToPT calculations |
| 15 | `db/bigquery_connector.py` | https://github.com/fcootest/fpa-backend/tree/main/db | v | v | v | BigQuery client wrapper |
| 16 | `config/field_mappings.py` | https://github.com/fcootest/fpa-backend/tree/main/config | v | | | Y-Block field mappings |
| 17 | `queries/query_builder.py` | https://github.com/fcootest/fpa-backend/tree/main/queries | v | | | Dynamic SQL query builder |
| 18 | `models/allocation_models.py` | https://github.com/fcootest/fpa-backend/tree/main/models | v | | | AllocationALT, ToItem, ByType models |
| 19 | `models/report_models.py` | https://github.com/fcootest/fpa-backend/tree/main/models | v | | | RepPage, RepTemp, RepCell models |
| 20 | `models/plan_input_models.py` | https://github.com/fcootest/fpa-backend/tree/main/models | v | | | R20Row, PlanInputValue models |
| 21 | `models/sync_models.py` | https://github.com/fcootest/fpa-backend/tree/main/models | | v | | SyncMode, SyncResult models |
| 22 | `models/workflow_models.py` | https://github.com/fcootest/fpa-backend/tree/main/models | | | v | Step, Event, ProcessState models |
| 23 | `models/so_cell_model.py` | https://github.com/fcootest/fpa-backend/tree/main/models | v | v | | SoCell data model |
| 24 | `services/allocation_service.py` | https://github.com/fcootest/fpa-backend/tree/main/services | v | | | Offset calculation, SoCell insertion |
| 25 | `services/p100_connector.py` | https://github.com/fcootest/fpa-backend/tree/main/services | | v | | Read P100 output from BQ |
| 26 | `services/p100_sync_service.py` | https://github.com/fcootest/fpa-backend/tree/main/services | | v | | Sync P100 → so_rows_v2 |
| 27 | `services/convert_service.py` | https://github.com/fcootest/fpa-backend/tree/main/services | | v | | Convert so_rows_v2 → so_cell_processed_v2 |
| 28 | `services/plan_input_service.py` | https://github.com/fcootest/fpa-backend/tree/main/services | v | | | R20Row parsing & validation |
| 29 | `services/config_service.py` | https://github.com/fcootest/fpa-backend/tree/main/services | v | | | Load/validate configuration |
| 30 | `services/security_service.py` | https://github.com/fcootest/fpa-backend/tree/main/services | v | v | v | User roles & permissions |
| 31 | `services/workflow_engine.py` | https://github.com/fcootest/fpa-backend/tree/main/services | | | v | Process step execution |
| 32 | `services/so_cell_factory.py` | https://github.com/fcootest/fpa-backend/tree/main/services | v | | | SoCell creation utilities |
| 33 | `fps/` | https://github.com/fcootest/fpa-backend/tree/main/fps | | | v | FPS module (25+ services, routes, models) |
| 34 | `utils/period_utils.py` | https://github.com/fcootest/fpa-backend/tree/main/utils | v | | | Period/date math utilities |

## 2.3 Frontend — Cấu trúc trang theo Module

| STT | Trang / Component | Link | FPA | P100 | APR | Mô tả |
|-----|-------------------|------|-----|------|-----|-------|
| 1 | `pages/Index.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | Dashboard & Financial Reports |
| 2 | `pages/Config.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | Config Hub |
| 3 | `pages/ZBlock1Config.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | ZBlock1 Configuration |
| 4 | `pages/RepTempManagement.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | Report Template Management |
| 5 | `pages/AllocationConfig.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | Allocation Configuration |
| 6 | `pages/PlanInput.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | Plan Input MKT-X |
| 7 | `pages/ConfigUpload.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | | | Config File Upload |
| 8 | `pages/P100DataSync.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | | v | | P100 Data Synchronization |
| 9 | `pages/ProcessDashboard.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | | | v | Process Runner Dashboard |
| 10 | `pages/ProcessHistory.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | | | v | Process History |
| 11 | `fps/FPSLayout.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps | | | v | FPS Main Layout (7 tabs) |
| 12 | `fps/pages/DashboardPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | FPS Dashboard |
| 13 | `fps/pages/ConfigPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | FPS Master Data Config |
| 14 | `fps/pages/RTBPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | Revenue Tracking Budget |
| 15 | `fps/pages/PEPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | Payment Expense |
| 16 | `fps/pages/PAPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | Payment Approval |
| 17 | `fps/pages/PIPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | Payment Invoice |
| 18 | `fps/pages/PMPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | Payment Movement |
| 19 | `fps/pages/PCPage.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/fps/pages | | | v | Payment Completion |
| 20 | `pages/Login.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/pages | v | v | v | Authentication |
| 21 | `components/auth/AuthGuard.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/components/auth | v | v | v | Auth protection |
| 22 | `components/auth/RoleGuard.tsx` | https://github.com/fcootest/fpa-frontend/tree/main/src/components/auth | v | v | v | Role-based access |

## 2.4 Tech Stack

### Backend

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | FastAPI (Python) |
| BQ Client | `google-cloud-bigquery` |
| Auth | JWT / Service Account |
| Container | Docker |
| Middleware | JWTAuthMiddleware, CORS |

### Frontend

| Thành phần | Công nghệ |
|------------|-----------|
| Framework | React 18.3 + Vite |
| Router | React Router DOM 6.30 |
| UI Library | Shadcn UI (Radix UI) + Tailwind CSS 3.4 |
| Chart Library | Recharts 2.15 |
| State | React Context + TanStack React Query 5.83 |
| Forms | React Hook Form 7.61 + Zod 3.25 |
| API Client | Fetch API |
| Container | Docker |

---

# 3. API Endpoints

## 3.1 API Group Overview

| STT | API Group | Prefix | Số endpoints | FPA | P100 | APR | Mô tả |
|-----|-----------|--------|-------------|-----|------|-----|-------|
| 1 | Report | `/api/report/*` | 2 | v | | | Build & load báo cáo tài chính |
| 2 | Task | `/api/task/*` | 1 | v | | | Quản lý async task queue |
| 3 | Plan Input | `/api/plan/*` | 6 | v | | | Nhập Plan & trigger Calculate Engines |
| 4 | Config | `/api/config/*` | 3 | v | | | Upload/query/validate cấu hình hệ thống |
| 5 | Data Sync | `/api/data/*` | 2 | | v | | Đồng bộ P100 & convert SO_ROWS |
| 6 | P100 Status | `/api/p100/*` | 2 | | v | | Theo dõi trạng thái & lịch sử sync P100 |
| 7 | Process | `/api/process/*` | 5 | | | v | Workflow execution & monitoring |
| 8 | FPS Master Data | `/api/fps/{entity}/*` | ~40 | | | v | CRUD master data (CDT, PT, KR, CTY, LE, EMP, VEN, Contract, Bank Account) |
| 9 | FPS Payment Slips | `/api/fps/{slip}/*` | ~25 | | | v | Payment slips (PE → PA → PI → PM → PC) |
| 10 | FPS Operations | `/api/fps/{ops}/*` | ~10 | | | v | RTB, Dashboard, Export, Approval |
| 11 | Auth | `/api/auth/*` | 2 | v | v | v | Login & verify JWT |
| 12 | Security | `/api/security/*` | 1 | v | v | v | Data-level security filters |

---

## 3.2 Module FPA — API Groups

| STT | API Group | Prefix | Mô tả | Endpoints |
|-----|-----------|--------|-------|-----------|
| 1 | **Report** | `/api/report/*` | Build & load báo cáo | `POST /build` — Submit async report build task |
| | | | | `POST /load` — Load report data with security filtering |
| 2 | **Task** | `/api/task/*` | Async task management | `GET /{task_id}` — Get status of async task |
| 3 | **Plan Input** | `/api/plan/*` | Nhập dữ liệu Plan & chạy Calculate | `POST /save` — Save R20Row plan input values |
| | | | | `GET /load` — Load saved plan input values |
| | | | | `GET /list` — List plan input sessions |
| | | | | `POST /mktx-calculate` — Trigger MKT-X Engine |
| | | | | `POST /subscription-calculate` — Trigger Subscription Engine |
| | | | | `POST /pla4-calculate` — Trigger PLA4-ToPT Engine |
| 4 | **Config** | `/api/config/*` | Cấu hình Allocation & Report | `POST /upload` — Upload allocation/report config |
| | | | | `GET /master` — Query master data config |
| | | | | `GET /validate` — Validate configuration |

---

## 3.3 Module P100 — API Groups

| STT | API Group | Prefix | Mô tả | Endpoints |
|-----|-----------|--------|-------|-----------|
| 1 | **Data Sync** | `/api/data/*` | Đồng bộ & convert dữ liệu P100 | `POST /read-p100` — Trigger P100 sync (FULL/INCREMENTAL) |
| | | | | `POST /convert-so-rows` — Convert so_rows_v2 → so_cell_processed_v2 |
| 2 | **P100 Status** | `/api/p100/*` | Theo dõi sync status | `GET /sync-status` — Get P100 sync status |
| | | | | `GET /sync-history` — P100 sync history |

---

## 3.4 Module APR — API Groups

| STT | API Group | Prefix | Mô tả | Entities / Endpoints |
|-----|-----------|--------|-------|----------------------|
| 1 | **Process Workflow** | `/api/process/*` | Quản lý workflow steps | `GET /status` — Process status for zblock+period |
| | | | | `POST /execute-step` — Execute specific step |
| | | | | `GET /runnable-steps` — List executable steps |
| | | | | `POST /execute-all-runnable` — Execute all runnable |
| | | | | `GET /history` — Event history |
| 2 | **FPS Master Data** | `/api/fps/{entity}/*` | CRUD các bảng master | `cdt` — Cost Distribution Table |
| | | | (mỗi entity: GET list, GET detail, | `pt` — Product/Package Type |
| | | | POST create, PUT update, DELETE) | `kr` — Key Result |
| | | | | `cty` — Country |
| | | | | `le` — Legal Entity |
| | | | | `emp` — Employee |
| | | | | `egr` — Employee Grade |
| | | | | `ven` — Vendor |
| | | | | `contract` — Contract |
| | | | | `bank-account` — Bank Account |
| 3 | **FPS Payment Slips** | `/api/fps/{slip}/*` | Quản lý chứng từ thanh toán | `pe` — Payment Expense (tạo & quản lý phiếu chi) |
| | | | (mỗi slip: GET list, GET detail, | `pa` — Payment Approval (phê duyệt thanh toán) |
| | | | POST create, PUT update, | `pi` — Payment Invoice (hóa đơn) |
| | | | POST submit, POST approve) | `pm` — Payment Movement (chuyển khoản) |
| | | | | `pc` — Payment Completion (hoàn tất) |
| 4 | **FPS Operations** | `/api/fps/{ops}/*` | Vận hành & báo cáo FPS | `rtb` — Revenue Tracking Budget |
| | | | | `approval` — Approval workflow engine |
| | | | | `dashboard` — FPS Dashboard data |
| | | | | `export` — Data export (CSV/Excel) |

---

## 3.5 Shared — API Groups

| STT | API Group | Prefix | FPA | P100 | APR | Mô tả |
|-----|-----------|--------|-----|------|-----|-------|
| 1 | **Auth** | `/api/auth/*` | v | v | v | `POST /login` — User authentication, `GET /verify` — Verify JWT |
| 2 | **Security** | `/api/security/*` | v | v | v | `POST /filter` — Apply data-level security filters |

---

# 4. DATABASE (BigQuery)

**Project**: `fp-a-project`

## 4.1 Dataset Overview

| Dataset | Số bảng | Layer | FPA | P100 | APR | Mô tả |
|---------|---------|-------|-----|------|-----|-------|
| `alloc_config` | 5 | Config | v | | | Allocation configuration (ALT, ByKR, ByType, ToItem) |
| `alloc_input` | 5 | Raw | v | v | | Input data (so_rows, so_rows_v2) |
| `alloc_stage` | 17 | Transformed | v | v | | Processed SO_CELL data |
| `alloc_output` | 2 | Serving | v | | | Allocated output results |
| `allocation_config` | 8 | Config | v | | | Legacy allocation config (NativeTable) |
| `rep_config` | 6 | Config | v | | | Report template config |
| `rep_data` | 3 | Serving | v | | | Report output (RepCell, RepPage) |
| `Report_config` | 15 | Config | v | | | Legacy report config (Google Sheets linked) |
| `Report_data` | 3 | Serving | v | | | Legacy report data |
| `plan_input` | 3 | Raw | v | | | Plan input values & calc output |
| `fps_data` | 37 | Master/Transact | | | v | FPS master data & payment slips |

---

## 4.2 Module FPA — Bảng chi tiết

### Dataset: `alloc_config` (5 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `allocation_alt` | 33 | 11 | Mapping ALT phân bổ | znumber, from_alt_fromalt, to_alt_toalt |
| 2 | `allocation_bykr` | 14 | 50 | Phân bổ theo KR dimensions | from_y_block_fromtype, to_y_block_totype, to_y_block_kr1..kr8 |
| 3 | `allocation_bytype` | 800 | 51 | Quy tắc phân bổ theo type | znumber, ynumber, from_y_block_kr1..kr8, by_block_bytype |
| 4 | `allocation_to_item` | 680 | 11 | Mapping từ item → đích | ynumber, from_y_block_fromtype, to_y_block_totype |
| 5 | `convert_ALT` | 0 | 6 | Convert ALT lookup | ZNumber, ALT_input, FROM_ALT_FromALT |

### Dataset: `alloc_input` (5 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `so_rows` | 21,813 | 452 | Input rows (legacy format) | so_row_id, z_block_*, now_y_block_*, time_x_block_m*_value |
| 2 | `so_rows_v2` | 520,696 | 260 | Input rows (V2 format) | upload_batch_id, so_row_id, z_block_*, now_y_block_* |
| 3 | `so_rows_cal` | 6,341 | 260 | Calculated input rows | upload_batch_id, so_row_id |
| 4 | `so_rows_filter` | 0 | 452 | Filtered input rows | upload_batch_id, so_row_id |
| 5 | `sheet_param` | 0 | 2 | Sheet parameters | string_field_0, string_field_1 |

### Dataset: `alloc_stage` (17 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `so_cell_processed_v2` | 3,245,705 | 109 | **ACTIVE** — SO_CELL processed data | so_row_id, now_y_block_*, time_x_block_* |
| 2 | `so_cell_processed_v3` | 2,986,463 | 109 | SO_CELL V3 | so_row_id, now_y_block_* |
| 3 | `so_cell_raw_v2` | 27,150,997 | 109 | Raw SO_CELL V2 | upload_batch_id, so_row_id |
| 4 | `so_cell_processed` | 1,112,005 | 109 | SO_CELL processed (legacy) | upload_batch_id, so_row_id |
| 5 | `so_cell_processed_A` | 1,718,250 | 109 | SO_CELL processed variant A | upload_batch_id, so_row_id |
| 6 | `so_cell_processed_B` | 1,718,705 | 109 | SO_CELL processed variant B | upload_batch_id, so_row_id |
| 7 | `so_cell_processed_B_v2` | 56,303 | 110 | SO_CELL processed B V2 | upload_batch_id, so_row_id |
| 8 | `so_cell_raw` | 1,112,005 | 109 | Raw SO_CELL (legacy) | upload_batch_id, so_row_id |
| 9 | `so_cell_raw_full` | 158,506 | 110 | Raw SO_CELL full | i_o, z_block_* |
| 10 | `so_cell_processed_backup` | 1,794,513 | 109 | Backup | upload_batch_id, so_row_id |
| 11 | `so_cell_processed_rollback` | 1,673,003 | 109 | Rollback | upload_batch_id, so_row_id |
| 12 | `so_cell_processed_v2_backup` | 1,111,727 | 109 | V2 Backup | so_row_id |
| 13 | `so_cell_processed_v2_backup_20260212` | 1,111,727 | 109 | V2 Backup 2026-02-12 | so_row_id |
| 14 | `so_cell_raw_v2_backup` | 2,974,865 | 109 | Raw V2 Backup | upload_batch_id, so_row_id |
| 15 | `so_cell_raw_v2_backup_20260212` | 2,974,865 | 109 | Raw V2 Backup 2026-02-12 | upload_batch_id, so_row_id |
| 16 | `so_cell_so_cell_test` | 2,643 | 8 | Test mapping | result_so_row_id, source_so_row_id |
| 17 | `socell_socell` | 372,601 | 109 | SoCell-to-SoCell mapping | so_row_id |

### Dataset: `alloc_output` (2 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `so_rows_allocated` | 0 | 263 | Allocated output rows | upload_batch_id, so_row_id |
| 2 | `so_rows_output` | 514 | 184 | Final output | i_o, z_block_zblock1_source, now_y_block_* |

### Dataset: `allocation_config` (8 bảng — Legacy)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `AllocationALT` | 0 | 6 | Legacy ALT config (Sheets linked) | ZNumber, FROM_ALT_FromALT |
| 2 | `AllocationALT_native` | 35 | 6 | ALT config (native BQ) | ZNumber, FROM_ALT_FromALT |
| 3 | `AllocationByKR_NativeTable` | 12 | 47 | ByKR config | FROM_Y_BLOCK_FromType, TO_Y_BLOCK_ToType |
| 4 | `AllocationByType` | 0 | 47 | Legacy ByType (Sheets linked) | ZNumber, YNumber |
| 5 | `AllocationByType_NativeTable` | 1,904 | 47 | ByType config (native BQ) | ZNumber, YNumber |
| 6 | `AllocationToItem_NativeTable` | 742 | 6 | ToItem config | FROM_Y_BLOCK_FromType, YNumber |
| 7 | `AllocationToItem_native` | 0 | 6 | Legacy ToItem | FROM_Y_BLOCK_FromType |
| 8 | `ConvertALT_NativeTable` | 7 | 2 | Convert ALT lookup | znumber, alt_input |

### Dataset: `rep_config` (6 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `rep_temp` | 24 | 2 | Report template master | znumber, rep_temp_type |
| 2 | `rep_temp_block` | 144 | 53 | Template block definitions | ynumber2, myreptemp, now_y_block_fnf_fnf |
| 3 | `rep_temp_block_upload` | 0 | 53 | Template block upload staging | YNumber2, MyRepTemp |
| 4 | `zblock1` | 0 | 20 | ZBlock1 config (active) | ynumber, z_block_zblockplan_category |
| 5 | `zblock1_backup_20260203` | 12 | 16 | ZBlock1 backup | ynumber |
| 6 | `zblock1_native` | 5 | 20 | ZBlock1 native BQ | ynumber, z_block_zblockplan_category |

### Dataset: `rep_data` (3 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `rep_cell` | 16,080 | 54 | **ACTIVE** — Report cell data | znumber, ynumber1, ynumber2, ynumber3, now_value |
| 2 | `rep_filter_item` | 0 | 35 | Report filter items | ynumber3, now_y_block_cdt_cdt1 |
| 3 | `rep_page` | 8 | 18 | Report pages | ynumber1, my_rep_temp, z_block_zblockplan_* |

### Dataset: `Report_config` (15 bảng — Legacy)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `RepCell` | 0 | 52 | Legacy RepCell config (Sheets) | ZNumber, YNumber1 |
| 2 | `RepFilterItem` | 0 | 35 | Legacy filter items | YNumber3 |
| 3 | `RepPage` | 0 | 14 | Legacy report pages | YNumber1, MyRepTemp |
| 4 | `RepTemp` | 0 | 2 | Legacy report templates | ZNumber, REP_TEMP_TYPE |
| 5 | `RepTempBlock` | 0 | 47 | Legacy template blocks | YNumber2, MyRepTemp |
| 6 | `RepTempBlock_NativeTable` | 144 | 46 | Template blocks (native) | ynumber2, myreptemp |
| 7 | `RepTemp_NativeTable` | 24 | 2 | Report templates (native) | ZNumber, REP_TEMP_TYPE |
| 8 | `ZBlock1` | 0 | 10 | Legacy ZBlock1 | YNumber |
| 9 | `ZBlock1_NativeTable` | 21 | 10 | ZBlock1 (native) | YNumber |
| 10 | `zb1_category_master` | 2 | 3 | ZB1 Category master | code, name |
| 11 | `zb1_frequency_master` | 6 | 3 | ZB1 Frequency master | code, name |
| 12 | `zb1_pack_master` | 5 | 3 | ZB1 Pack master | code, name |
| 13 | `zb1_run_master` | 3 | 3 | ZB1 Run master | code, name |
| 14 | `zb1_scenario_master` | 3 | 3 | ZB1 Scenario master | code, name |
| 15 | `zb1_source_master` | 5 | 3 | ZB1 Source master | code, name |

### Dataset: `Report_data` (3 bảng — Legacy)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `RepCell` | 90,000 | 52 | Legacy report cell data | ZNumber, YNumber1, NOW_VALUE |
| 2 | `RepFilterItem` | 0 | 35 | Legacy filter items | YNumber3 |
| 3 | `RepPage` | 13 | 14 | Legacy report pages | YNumber1, MyRepTemp |

### Dataset: `plan_input` (3 bảng)

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `plan_input_value` | 4,359 | 24 | Plan input values | input_id, session_id, plan_type, zblock_string |
| 2 | `plan_calc_output` | 930 | 11 | Calculated plan output | calc_id, batch_id, calc_type, zblock_string, period |
| 3 | `deleted_zblocks` | 2 | 3 | Deleted ZBlocks tracking | zblock_string, deleted_at, deleted_by |

---

## 4.3 Module P100 — Bảng chi tiết

> Module P100 sử dụng chung các bảng trong `alloc_input` và `alloc_stage`:

| STT | Dataset | Bảng | R/W | Mô tả |
|-----|---------|------|-----|-------|
| 1 | `alloc_input` | `so_rows_v2` | WRITE | P100 sync ghi dữ liệu vào đây (FULL/INCREMENTAL) |
| 2 | `alloc_stage` | `so_cell_processed_v2` | WRITE | Convert so_rows_v2 → so_cell_processed_v2 |
| 3 | `alloc_stage` | `so_cell_raw_v2` | WRITE | Raw SO_CELL from P100 |

**Luồng P100**:
```
P100 Output (External) → api/data/read-p100 → alloc_input.so_rows_v2
                                                       ↓
                        api/data/convert-so-rows → alloc_stage.so_cell_processed_v2
```

---

## 4.4 Module APR (FPS) — Bảng chi tiết

### Dataset: `fps_data` (37 bảng)

#### Master Data Tables

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 1 | `fps_kr` | 5 | 2 | Key Result master | kr_code, kr_name |
| 2 | `fps_le` | 9 | 4 | Legal Entity master | le_code, le_name, country, representative |
| 3 | `fps_pt` | 4 | 2 | Product/Package Type | pt_code, pt_name |
| 4 | `fps_cdt` | 12 | 7 | Cost Distribution Table | cdt_code, cdt_name, cdt_level, parent_cdt_code, team_head |
| 5 | `fps_cty` | 10 | 2 | Country master | country_code, country_name |
| 6 | `fps_emp` | 6 | 4 | Employee master | emp_code, emp_name, email, grade_code |
| 7 | `fps_egr` | 8 | 3 | Employee Grade | grade_code, grade_name, grade_level |
| 8 | `fps_ven` | 5 | 15 | Vendor master | vendor_code, vendor_name, vendor_type, tax_number |
| 9 | `fps_month` | 12 | 2 | Month master | month_code, month_name |
| 10 | `fps_bank_account` | 3 | 8 | Bank accounts | account_id, le_code, bank_name, account_number, currency |
| 11 | `fps_contract` | 3 | 12 | Contracts | contract_id, contract_type, le_code, vendor_code |

#### Configuration Tables

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 12 | `fps_ast` | 8 | 10 | Approval Steps | step_id, step_code, step_name, step_order, document_type |
| 13 | `fps_arl` | 6 | 12 | Approval Roles | arl_id, kr_code, le_code, pt_code, cdt_code |
| 14 | `fps_apv` | 9 | 3 | Approvers | apv_id, emp_code, arl_id |
| 15 | `fps_bgc` | 3 | 5 | Budget Codes | bgc_code, kr_code, le_code, pt_code, cdt_code |
| 16 | `fps_approval_threshold` | 4 | 8 | Approval thresholds | threshold_id, cdt_code, approval_type, amount_min, amount_max |
| 17 | `fps_fpsdt` | 3 | 3 | Document Templates | template_id, kr_code, template_name |
| 18 | `fps_fpsdi` | 0 | 5 | Document Template Items | item_id, template_id, item_name, item_order |
| 19 | `fps_id_counter` | 5 | 2 | ID auto-increment | entity_type, current_value |

#### Lookup Tables

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 20 | `fps_tlt` | 3 | 2 | Transaction Line Types | code, name |
| 21 | `fps_tmt` | 3 | 2 | Transaction Method Types | code, name |
| 22 | `fps_tst` | 3 | 2 | Transaction Status Types | code, name |
| 23 | `fps_tut` | 2 | 2 | Transaction Unit Types | code, name |

#### Transaction Tables

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 24 | `fps_trs` | 10 | 12 | Transactions | trs_id, kr_code, le_code, pt_code, cdt_code |
| 25 | `fps_tev` | 18 | 6 | Transaction Events | tev_id, trs_id, event_type, user_id, arl_id |

#### Payment Slip Tables

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 26 | `fps_pe_slip` | 11 | 12 | Payment Expense slips | pe_slip_id, rtb_item_id, trs_id, status, cfa_type |
| 27 | `fps_pe_line` | 17 | 11 | PE line items | pel_id, pe_slip_id, trs_id, bgc_code |
| 28 | `fps_pa_slip` | 4 | 3 | Payment Approval slips | pa_slip_id, trs_id, status |
| 29 | `fps_pa_line` | 9 | 6 | PA line items | pal_id, pa_slip_id, pel_id, trs_id, amount |
| 30 | `fps_pi_slip` | 1 | 4 | Payment Invoice slips | pi_slip_id, trs_id, pe_slip_id, status |
| 31 | `fps_pi_line` | 1 | 6 | PI line items | pil_id, pi_slip_id, pel_id, trs_id, amount |
| 32 | `fps_pm_slip` | 1 | 5 | Payment Movement slips | pm_slip_id, trs_id, pi_slip_id, status |
| 33 | `fps_pm_line` | 1 | 6 | PM line items | pml_id, pm_slip_id, pil_id, trs_id, amount |
| 34 | `fps_pc_slip` | 1 | 5 | Payment Completion slips | pc_slip_id, trs_id, pe_slip_id, pm_slip_id, status |
| 35 | `fps_pc_line` | 1 | 6 | PC line items | pcl_id, pc_slip_id, pel_id, trs_id, amount |

#### RTB (Revenue Tracking Budget) Tables

| STT | Bảng | Rows | Columns | Mô tả | Key Columns |
|-----|------|------|---------|-------|-------------|
| 36 | `fps_rtb_sheet` | 2 | 5 | RTB sheets | sheet_id, sheet_name, le_code, year, status |
| 37 | `fps_rtb_item` | 3 | 5 | RTB line items | item_id, sheet_id, month_code, bgc_code, amount |

---

# 5. Calculation Workflows

## 5.1 FPA — Allocation Flow

```
1. Load AllocationALT (znumber, from_alt, to_alt, from_type, to_type)
2. Load AllocationToItem & AllocationByType config
3. For each AllocationByType item:
   → Build SO_CELL query using YBLOCK_FIELD_MAPPING
   → Query SoCell from alloc_stage.so_cell_processed_v2
   → Apply allocation (Direct, Offset, ByAgg, GAgg)
   → Insert allocated SoCell
```

## 5.2 FPA — Report Generation Flow

```
1. Load/create RepPage record
2. Load RepTemp & RepTempBlock definitions
3. Extract filter types (CDT, PT, HR, Channel...) from RepTempBlock
4. Query AllocationToItem for each filter type
5. Build Cartesian product of filter combinations
6. For each combination × period:
   → Query SoCell (Plan, Actual, Forecast)
   → Aggregate by KR if specified
   → Create RepCell record
   → Insert into rep_data.rep_cell
```

## 5.3 P100 — Sync & Convert Flow

```
1. Read P100 output (external source)
2. Validate schema compatibility
3. Stamp batch metadata (upload_batch_id, uploaded_at)
4. Insert into alloc_input.so_rows_v2 (FULL or INCREMENTAL)
5. Convert: Query alloc_input.so_rows_v2
6. Copy fields 1:1 to alloc_stage.so_cell_processed_v2
7. Stamp convert metadata (convert_batch_id, uploaded_by)
```

## 5.4 FPA — Calculate Engines

| Engine | Input | Formula | Output |
|--------|-------|---------|--------|
| MKT-X | E16 plan values (OMC, CPI, RATE, ARPP) | NO-OMC-INS=OMC/CPI, NO-PS=NO-OMC-INS*RATE, GI=NO-PS*ARPP | Values by period/scenario/CDT/PT |
| Subscription | SI-110 subscriber + E16 plan | PCA subscription formulas | SO-330 subscriber projections |
| PLA4-ToPT | SI-110 + E16 data | PC_1 (P&L Waterfall) + PC_2 (CDT Aggregation) | PT-level plan allocation |

---

# 6. Infrastructure

## 6.1 Server & Deployment

| Component | Chi tiết |
|-----------|----------|
| Server | GCP VM (e2-standard hoặc tương đương) |
| OS | Ubuntu |
| Containerization | Docker |
| Orchestration | Docker Compose |
| Web Server / Proxy | Nginx (reverse proxy cho BE & FE) |
| SSL | Certbot / Let's Encrypt |
| Config API | Cloud Run (`fpa-config-api-21672960606.us-central1.run.app`) |
| Domain | `fpa.aperogroup.ai` |

---

## 6.2 Storage & Utilities

| Component | Vai trò | FPA | P100 | APR |
|-----------|---------|-----|------|-----|
| BigQuery | Data warehouse chính | v | v | v |
| Google Sheets | Metadata input (legacy) | v | | |
| Google Colab | ETL pipeline | v | | |
| GCP Service Account | Auth BigQuery (ai-690@fp-a-project) | v | v | v |

---

# 7. Frontend Navigation & Routing

## 7.1 Route Map

| Path | Page | FPA | P100 | APR | Role Access |
|------|------|-----|------|-----|-------------|
| `/login` | Login | v | v | v | Public |
| `/` | Financial Reports Dashboard | v | | | All roles |
| `/plan/mkt-x` | Plan Input MKT-X | v | | | FCOO + MKT |
| `/data/p100-sync` | P100 Data Sync | | v | | FCOO only |
| `/runner` | Process Dashboard | | | v | FCOO only |
| `/runner/history` | Process History | | | v | FCOO only |
| `/config` | Config Hub | v | | | FCOO only |
| `/config/dashboard` | Config Dashboard | v | | | FCOO only |
| `/config/zblock1` | ZBlock1 Config | v | | | FCOO only |
| `/config/reptemp-mgmt` | RepTemp Management | v | | | FCOO only |
| `/config/allocation` | Allocation Config | v | | | FCOO only |
| `/config/email` | Email Settings | v | | | FCOO only |
| `/config/upload` | Config Upload | v | | | FCOO only |
| `/fps` | FPS Payment System | | | v | All roles |

---

# 8. Tổng hợp thống kê

## Repositories

| Layer | Repo | Link | Số lượng |
|-------|------|------|----------|
| Frontend | `fpa-frontend` | https://github.com/fcootest/fpa-frontend | 1 |
| Backend | `fpa-backend` | https://github.com/fcootest/fpa-backend | 1 |
| ETL Notebooks | Google Colab | (internal) | ~3 notebooks |
| **Tổng** | | | **2 repos + notebooks** |

---

## Database

| Platform | Dataset | Số bảng | Module |
|----------|---------|---------|--------|
| BigQuery | `alloc_config` | 5 | FPA |
| BigQuery | `alloc_input` | 5 | FPA + P100 |
| BigQuery | `alloc_stage` | 17 | FPA + P100 |
| BigQuery | `alloc_output` | 2 | FPA |
| BigQuery | `allocation_config` | 8 | FPA (Legacy) |
| BigQuery | `rep_config` | 6 | FPA |
| BigQuery | `rep_data` | 3 | FPA |
| BigQuery | `Report_config` | 15 | FPA (Legacy) |
| BigQuery | `Report_data` | 3 | FPA (Legacy) |
| BigQuery | `plan_input` | 3 | FPA |
| BigQuery | `fps_data` | 37 | APR |
| **Tổng** | **11 datasets** | **104 tables** | |

---

## User Coverage

| Service | FPA | P100 | APR | BOD | FCOO | MKT | MGT |
|---------|-----|------|-----|-----|------|-----|-----|
| FP&A Dashboard (FE) | v | | | v | v | | v |
| Plan Input (FE) | v | | | | v | v | |
| P100 Data Sync (FE) | | v | | | v | | |
| Process Runner (FE) | | | v | | v | | |
| FPS Payment (FE) | | | v | | v | | v |
| Config Hub (FE) | v | | | | v | | |
| FP&A API (BE) | v | v | v | v | v | v | v |
| BigQuery Direct | v | v | v | | v | | |
| Google Sheets (Legacy) | v | | | | v | | |
| Google Colab ETL | v | | | | v | | |
