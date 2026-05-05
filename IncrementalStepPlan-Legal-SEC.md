# IncrementalStepPlan — Legal SEC Permission System

**Project:** Legal Workflow SEC Permission Integration
**Source doc:** `Legal_v2/SEC_Permission_System.md`
**Existing codebase:** `legal-workflow-be` (FastAPI/Python) + `legal-workflow-fe` (React/TS)
**BigQuery dataset:** `fp-a-project.sec_data` (already populated)

---

## Summary

Integrate the SEC permission system (4 levels: SEC1–SEC4) into the existing Legal Workflow app.
Current state: hardcoded JWT tokens for 2 users, no real auth, no data filtering.
Target state: Google SSO → BigQuery permission lookup → session-based PT/CDT data filtering.

---

## Step 0 — SEC Permission Data Models

**Goal:** Define Pydantic models for SEC permission objects so all downstream code has a typed contract.

**Scope:**
- Included: `SecPermission`, `SecLevel`, `PtAllowed`, `CdtAllowed` Pydantic models
- Excluded: No endpoints, no database, no BigQuery, no frontend

**Components touched:** Backend only → `src/modules/sec/models.py` (new file)

**Preconditions:** None (first step)

**Test cases:**
- Backend:
  - `test_sec_permission_model_valid`: construct a SecPermission with valid data → no error
  - `test_sec_permission_model_defaults`: missing optional fields → defaults to SEC1/MyPT/MyCDT/3
  - `test_sec_level_enum`: SEC1, SEC2, SEC3, SEC4 are valid; SEC5 raises ValueError
  - `test_sec_permission_serialization`: `.model_dump()` returns expected dict keys
  - `test_sec_permission_from_bigquery_row`: construct from a dict mimicking BQ response

**Expected artifacts:**
- `src/modules/sec/__init__.py`
- `src/modules/sec/models.py`
- `tests/test_sec_models.py`

**Exit criteria:** All 5 model tests pass. Models importable from `src.modules.sec.models`.

---

## Step 1 — Mock Permission Service

**Goal:** Create a service that returns SEC permission data for a given email, using static mock data (no BigQuery yet).

**Scope:**
- Included: `PermissionService` class with `get_by_email(email: str) -> SecPermission | None`
- Included: Mock implementation with 4 hardcoded users (one per SEC level)
- Excluded: BigQuery connection, Google Auth, endpoints

**Components touched:** Backend → `src/modules/sec/service.py` (new file)

**Preconditions:** Step 0 complete (models exist)

**Test cases:**
- Backend:
  - `test_get_by_email_sec1`: `trangph@apero.vn` → returns SEC1 with MyPT, MyCDT, krf=3
  - `test_get_by_email_sec4`: `hoangdnh@apero.vn` → returns SEC4 with AllPT, AllCDT, krf=7
  - `test_get_by_email_not_found`: `unknown@apero.vn` → returns None
  - `test_get_by_email_case_insensitive`: `TrangPH@apero.vn` → returns same as lowercase
  - `test_service_returns_all_fields`: returned object has emp_code, emp_name, google_email, empsec, pt_allowed, cdt_allowed, krf_level, role_legal, cdt_1

**Expected artifacts:**
- `src/modules/sec/service.py`
- `tests/test_sec_service.py`

**Exit criteria:** All 5 service tests pass with mock data.

---

## Step 2 — Auth Login Endpoint (Mock)

**Goal:** Create `/api/auth/login` that accepts an email, looks up SEC permissions via PermissionService, and returns a JWT containing permission data.

**Scope:**
- Included: `POST /api/auth/login` endpoint; JWT payload includes emp_code, emp_name, role, empsec, pt_allowed, cdt_allowed, krf_level, cdt_1
- Excluded: Google OAuth verification (accepts plain email), BigQuery

**Components touched:**
- Backend → `src/modules/sec/router.py` (new), `src/auth/jwt_utils.py` (unchanged but used)
- Backend → `src/app.py` (register new router)

**Preconditions:** Step 0 + Step 1 complete

**Test cases:**
- Backend:
  - `test_login_valid_email`: POST `{"email": "trangph@apero.vn"}` → 200, response contains `token` and `user` with empsec="SEC1"
  - `test_login_unknown_email`: POST `{"email": "xxx@apero.vn"}` → 401 "Employee not found"
  - `test_login_jwt_contains_sec_fields`: decode returned JWT → payload has empsec, pt_allowed, cdt_allowed, krf_level
  - `test_login_missing_email`: POST `{}` → 422 validation error
  - `test_login_jwt_is_valid`: returned token can be decoded by `decode_jwt()`

**Expected artifacts:**
- `src/modules/sec/router.py`
- `src/modules/sec/schema.py` (LoginRequest model)
- Route registered in `app.py`
- `tests/test_sec_login.py`

**Exit criteria:** All 5 login tests pass. JWT token contains SEC permission fields.

---

## Step 3 — Permission Middleware

**Goal:** Extract SEC permissions from JWT and make them available as `request.state.sec` on every authenticated request.

**Scope:**
- Included: Modify `get_current_user()` to populate `request.state.sec` with SecPermission object
- Included: New `get_current_sec()` dependency for routes that need permissions
- Excluded: No filtering logic yet, no route changes

**Components touched:**
- Backend → `src/auth/dependencies.py` (modify)
- Backend → `src/modules/sec/dependencies.py` (new)

**Preconditions:** Step 2 complete (JWT has SEC fields)

**Test cases:**
- Backend:
  - `test_request_state_has_sec`: authenticated request → `request.state.sec` is a SecPermission object
  - `test_sec_from_jwt_sec1`: token for SEC1 user → `request.state.sec.empsec == "SEC1"`
  - `test_sec_from_jwt_sec4`: token for SEC4 user → `request.state.sec.pt_allowed == "AllPT"`
  - `test_get_current_sec_dependency`: use `Depends(get_current_sec)` in a test route → returns correct SecPermission
  - `test_unauthenticated_no_sec`: request without JWT → 401, no sec state

**Expected artifacts:**
- Modified `src/auth/dependencies.py`
- `src/modules/sec/dependencies.py`
- `tests/test_sec_middleware.py`

**Exit criteria:** All 5 middleware tests pass. Any route using `Depends(get_current_sec)` receives a typed SecPermission.

---

## Step 4 — BigQuery Permission Lookup

**Goal:** Replace mock PermissionService with real BigQuery queries against `sec_data.v_auth_lookup`.

**Scope:**
- Included: `BigQueryPermissionService` that queries `fp-a-project.sec_data.v_auth_lookup`
- Included: Fallback to mock if BigQuery unavailable (for testing/dev)
- Included: Configurable via `settings.USE_BIGQUERY_AUTH` flag
- Excluded: Google OAuth (still accepts plain email), no frontend changes

**Components touched:**
- Backend → `src/modules/sec/bigquery_service.py` (new)
- Backend → `src/modules/sec/service.py` (add factory method)
- Backend → `src/config/settings.py` (add USE_BIGQUERY_AUTH flag)
- Backend → `requirements.txt` (add google-cloud-bigquery)

**Preconditions:** Step 1 complete; BigQuery `sec_data` dataset exists; service account credentials available

**Test cases:**
- Backend:
  - `test_bq_service_returns_sec_permission`: (requires BQ access) query for known email → returns valid SecPermission
  - `test_bq_service_not_found`: query for unknown email → returns None
  - `test_fallback_to_mock_when_bq_unavailable`: set USE_BIGQUERY_AUTH=false → uses MockPermissionService
  - `test_bq_service_field_mapping`: BQ row maps correctly to SecPermission fields
  - `test_service_factory_returns_correct_impl`: factory returns BigQueryPermissionService when USE_BIGQUERY_AUTH=true

**Expected artifacts:**
- `src/modules/sec/bigquery_service.py`
- Modified `src/modules/sec/service.py`
- Modified `src/config/settings.py`
- `tests/test_sec_bigquery.py`

**Exit criteria:** With BQ credentials: real lookup works. Without BQ: graceful fallback to mock. All tests pass.

---

## Step 5 — Google OAuth2 Token Verification

**Goal:** Accept a Google OAuth2 ID token in the login endpoint, verify it with Google, extract email, then look up SEC permissions.

**Scope:**
- Included: Modify `/api/auth/login` to accept `{"google_token": "..."}` instead of plain email
- Included: Verify token via `google.oauth2.id_token` library
- Included: Extract email from verified token → pass to PermissionService
- Excluded: Frontend Google button (next steps), no data filtering yet

**Components touched:**
- Backend → `src/modules/sec/router.py` (modify login endpoint)
- Backend → `src/modules/sec/google_auth.py` (new)
- Backend → `src/config/settings.py` (add GOOGLE_CLIENT_ID)
- Backend → `requirements.txt` (add google-auth)

**Preconditions:** Step 4 complete; Google OAuth2 client ID configured

**Test cases:**
- Backend:
  - `test_google_login_valid_token`: (mocked google verify) → returns JWT with SEC permissions
  - `test_google_login_invalid_token`: invalid/expired Google token → 401 "Invalid Google token"
  - `test_google_login_email_not_in_system`: valid Google token but email not in SEC → 401 "Employee not found"
  - `test_google_auth_extracts_email`: mock verify → extracted email matches expected
  - `test_legacy_email_login_still_works`: POST with `{"email": "..."}` still works in dev mode (backward compat)

**Expected artifacts:**
- `src/modules/sec/google_auth.py`
- Modified `src/modules/sec/router.py`
- Modified `src/config/settings.py`
- `tests/test_sec_google_auth.py`

**Exit criteria:** Google tokens verified correctly. Email extracted and looked up. Legacy email login preserved for dev. All 5 tests pass.

---

## Step 6 — PT Filter on Task List

**Goal:** Filter task list endpoint to only return tasks matching the user's allowed PTs (from emp_pt_allowed).

**Scope:**
- Included: `pt_filter(tsi_list, sec: SecPermission) -> filtered_list` utility
- Included: Apply to `GET /api/my-tasks` and `GET /api/legal/task/` endpoints
- Included: SEC1 users see only tasks with matching PT in tsi_filter; SEC2/3/4 see all
- Excluded: CDT filtering (next step), no frontend changes

**Components touched:**
- Backend → `src/modules/sec/filters.py` (new)
- Backend → `src/modules/tsi/my_tasks_router.py` (modify)
- Backend → `src/modules/tsi/router.py` (modify)

**Preconditions:** Step 3 complete (SecPermission available in request)

**Test cases:**
- Backend:
  - `test_pt_filter_sec1_sees_only_allowed_pts`: SEC1 user with pt_codes=["ED","GA"] → only sees tasks with PT=ED or PT=GA
  - `test_pt_filter_sec4_sees_all`: SEC4 user → sees all tasks regardless of PT
  - `test_pt_filter_task_without_pt_filter`: task has no PT in tsi_filter → visible to all
  - `test_pt_filter_empty_allowed`: SEC1 user with no allowed PTs → sees no tasks with PT filter
  - `test_my_tasks_endpoint_applies_pt_filter`: integration test: authenticated SEC1 request to /api/my-tasks → only returns matching PT tasks

**Expected artifacts:**
- `src/modules/sec/filters.py`
- Modified `src/modules/tsi/my_tasks_router.py`
- `tests/test_sec_pt_filter.py`

**Exit criteria:** SEC1 users see filtered tasks; SEC2/3/4 users see all tasks. All 5 tests pass.

---

## Step 7 — CDT Filter on Task List

**Goal:** Filter task list to only return tasks matching user's allowed CDTs (from emp_cdt_allowed).

**Scope:**
- Included: `cdt_filter(tsi_list, sec: SecPermission) -> filtered_list` utility
- Included: Apply alongside PT filter in task endpoints
- Included: SEC1/SEC3: only own CDT; SEC2: own + parent; SEC4: all
- Excluded: KRF depth (next step), no frontend changes

**Components touched:**
- Backend → `src/modules/sec/filters.py` (extend)
- Backend → `src/modules/tsi/my_tasks_router.py` (modify)

**Preconditions:** Step 6 complete (PT filter exists)

**Test cases:**
- Backend:
  - `test_cdt_filter_sec1_own_cdt_only`: SEC1 user cdt_1=HQ1 → only sees tasks with CDT containing SHQ1
  - `test_cdt_filter_sec2_with_parent`: SEC2 user → sees own CDT + parent CDT tasks
  - `test_cdt_filter_sec4_all`: SEC4 → sees all CDT tasks
  - `test_combined_pt_and_cdt_filter`: SEC1 user → task must pass both PT AND CDT filter
  - `test_task_without_cdt_filter`: task has no CDT in tsi_filter → visible to all

**Expected artifacts:**
- Modified `src/modules/sec/filters.py`
- `tests/test_sec_cdt_filter.py`

**Exit criteria:** Combined PT+CDT filtering works correctly for all 4 SEC levels. All 5 tests pass.

---

## Step 8 — Apply Filters to Dashboard & Reports

**Goal:** Dashboard metrics and reports respect SEC permissions (same PT+CDT filters).

**Scope:**
- Included: Apply `sec_filter()` to dashboard, SLA report, workload report endpoints
- Excluded: No new filter logic (reuse from Steps 6–7), no frontend changes

**Components touched:**
- Backend → `src/modules/dashboard/router.py` (modify)
- Backend → `src/modules/reports/router.py` (modify)

**Preconditions:** Steps 6–7 complete

**Test cases:**
- Backend:
  - `test_dashboard_sec1_filtered`: SEC1 user → dashboard counts only their PT+CDT tasks
  - `test_dashboard_sec4_all`: SEC4 user → dashboard counts all tasks
  - `test_sla_report_filtered`: SEC1 user → SLA report only includes allowed tasks
  - `test_workload_report_filtered`: SEC1 user → workload report limited to own scope
  - `test_reports_with_no_tasks_in_scope`: SEC1 user with no matching tasks → empty report, no error

**Expected artifacts:**
- Modified dashboard and reports routers
- `tests/test_sec_dashboard_reports.py`

**Exit criteria:** All data endpoints respect SEC permissions. All 5 tests pass.

---

## Step 9 — Frontend: Permission Store

**Goal:** Extend the Zustand auth store to hold SEC permission fields received from login.

**Scope:**
- Included: Add `empsec`, `pt_allowed`, `cdt_allowed`, `krf_level`, `cdt_1`, `role_legal` to auth store
- Included: Parse from login response and persist in store
- Excluded: No UI changes yet, no conditional rendering

**Components touched:**
- Frontend → `src/stores/auth.store.ts` (modify)
- Frontend → `src/services/api.ts` (unchanged)

**Preconditions:** Step 2 complete (login API returns SEC fields)

**Test cases:**
- Frontend:
  - `test_auth_store_stores_sec_fields`: after setAuth, store contains empsec, pt_allowed, etc.
  - `test_auth_store_clear_removes_sec`: clearAuth → all SEC fields are null
  - `test_auth_store_default_no_sec`: initial state → SEC fields are null
  - `test_auth_store_user_interface`: User interface includes new SEC fields

**Expected artifacts:**
- Modified `src/stores/auth.store.ts`
- `src/__tests__/auth.store.sec.test.ts`

**Exit criteria:** Store correctly holds and clears SEC permission data. All 4 tests pass.

---

## Step 10 — Frontend: Login Page with Google SSO

**Goal:** Replace hardcoded role-select login with Google Sign-In button. On success, call `/api/auth/login` and store SEC permissions.

**Scope:**
- Included: Google Sign-In button using `@react-oauth/google`
- Included: Call backend login endpoint with Google token
- Included: Store returned JWT + SEC permissions in Zustand
- Included: Keep legacy dev login (role buttons) behind a toggle
- Excluded: No data filtering UI yet

**Components touched:**
- Frontend → `src/pages/LoginPage.tsx` (rewrite)
- Frontend → `package.json` (add @react-oauth/google)
- Frontend → `src/main.tsx` (add GoogleOAuthProvider)

**Preconditions:** Step 5 (Google OAuth backend), Step 9 (permission store)

**Test cases:**
- Frontend:
  - `test_login_page_shows_google_button`: Google Sign-In button is rendered
  - `test_login_page_dev_mode_shows_roles`: dev toggle → shows role-select buttons
  - `test_google_login_success_stores_sec`: mock Google callback → store has SEC data
  - `test_google_login_failure_shows_error`: failed Google auth → error message displayed

**Expected artifacts:**
- Modified `src/pages/LoginPage.tsx`
- Modified `src/main.tsx`
- `src/__tests__/LoginPage.sec.test.tsx`

**Exit criteria:** Google SSO button renders, login flow works, SEC data stored. All 4 tests pass.

---

## Step 11 — Frontend: Permission-Based UI Rendering

**Goal:** Show/hide sidebar menu items and UI elements based on the user's SEC level and role_legal.

**Scope:**
- Included: `SecGuard` component (like RoleGuard but checks empsec/role_legal)
- Included: Config menu items only visible to SEC4 (or configurable)
- Included: Report links restricted based on SEC level
- Excluded: No data filtering in list views (next step)

**Components touched:**
- Frontend → `src/components/auth/SecGuard.tsx` (new)
- Frontend → `src/components/layout/Sidebar.tsx` (modify)

**Preconditions:** Step 9 complete (store has SEC data)

**Test cases:**
- Frontend:
  - `test_sec_guard_allows_matching_level`: SEC4 user + required="SEC4" → children render
  - `test_sec_guard_blocks_insufficient_level`: SEC1 user + required="SEC4" → children not rendered
  - `test_sidebar_sec1_no_config`: SEC1 user → config menu items hidden
  - `test_sidebar_sec4_full_menu`: SEC4 user → all menu items visible
  - `test_sec_guard_with_role_legal`: role_legal="Approver" → approval UI visible

**Expected artifacts:**
- `src/components/auth/SecGuard.tsx`
- Modified `src/components/layout/Sidebar.tsx`
- `src/__tests__/SecGuard.test.tsx`

**Exit criteria:** UI correctly shows/hides based on SEC level. All 5 tests pass.

---

## Step 12 — Frontend: Permission-Filtered Data Display

**Goal:** Task lists and dashboard on frontend correctly display only permitted data (relies on backend filtering from Steps 6–8).

**Scope:**
- Included: Show SEC level badge on user profile area
- Included: Show "filtered view" indicator for SEC1 users
- Included: Empty state when no tasks match permissions
- Excluded: No new API calls (backend already filters)

**Components touched:**
- Frontend → `src/pages/MyTasksPage.tsx` (modify)
- Frontend → `src/pages/DashboardPage.tsx` (modify)
- Frontend → `src/components/layout/AppLayout.tsx` (modify, add user badge)

**Preconditions:** Steps 8–9 complete

**Test cases:**
- Frontend:
  - `test_tasks_page_shows_filtered_indicator`: SEC1 user → "Showing your assigned data" badge visible
  - `test_tasks_page_sec4_no_indicator`: SEC4 user → no filter indicator
  - `test_dashboard_shows_sec_badge`: user profile area shows SEC level badge
  - `test_empty_state_when_no_tasks`: no tasks returned → empty state message displayed

**Expected artifacts:**
- Modified `MyTasksPage.tsx`, `DashboardPage.tsx`, `AppLayout.tsx`
- `src/__tests__/MyTasksPage.sec.test.tsx`

**Exit criteria:** UI reflects permission state correctly. All 4 tests pass.

---

## Step 13 — Integration Test: Full SEC Flow

**Goal:** End-to-end test covering the complete SEC permission flow from login to filtered data.

**Scope:**
- Included: 4 integration test scenarios (one per SEC level)
- Included: Backend: login → get filtered tasks → verify correct filtering
- Included: Frontend: login → navigate → verify correct UI state
- Excluded: No new features

**Components touched:** Tests only

**Preconditions:** All Steps 0–12 complete

**Test cases:**
- Backend (E2E):
  - `test_e2e_sec1_full_flow`: login as SEC1 → create task → list tasks → only own PT+CDT visible
  - `test_e2e_sec4_full_flow`: login as SEC4 → list tasks → all tasks visible
  - `test_e2e_cross_sec_isolation`: SEC1 creates task → SEC1 in different CDT cannot see it → SEC4 can
  - `test_e2e_dashboard_filtering`: each SEC level → dashboard shows correctly scoped counts
- Frontend (E2E):
  - `test_e2e_fe_sec1_login_and_navigate`: mock SEC1 login → sidebar shows limited menu → tasks page shows filter indicator
  - `test_e2e_fe_sec4_login_full_access`: mock SEC4 login → all menu items → no filter indicator

**Expected artifacts:**
- `tests/test_e2e_sec_flow.py` (backend)
- `src/__tests__/e2e/sec-flow.test.tsx` (frontend)

**Exit criteria:** All 6 integration tests pass. System correctly enforces SEC-based data isolation across all 4 levels.

---

## Step Dependency Graph

```
Step 0 (Models)
  └── Step 1 (Mock Service)
        └── Step 2 (Login Endpoint)
              ├── Step 3 (Middleware)
              │     ├── Step 6 (PT Filter)
              │     │     └── Step 7 (CDT Filter)
              │     │           └── Step 8 (Dashboard/Reports)
              │     └── Step 4 (BigQuery)
              │           └── Step 5 (Google OAuth)
              │                 └── Step 10 (FE: Google Login)
              └── Step 9 (FE: Permission Store)
                    ├── Step 10 (FE: Google Login)
                    ├── Step 11 (FE: SecGuard + Sidebar)
                    └── Step 12 (FE: Filtered Display)
                          └── Step 13 (Integration Test)
```

---

## Total: 14 steps (Step 0 – Step 13)

| Step | Name | Components | Estimated Tests |
|------|------|-----------|----------------|
| 0 | SEC Permission Models | BE only | 5 |
| 1 | Mock Permission Service | BE only | 5 |
| 2 | Auth Login Endpoint | BE only | 5 |
| 3 | Permission Middleware | BE only | 5 |
| 4 | BigQuery Lookup | BE only | 5 |
| 5 | Google OAuth Verify | BE only | 5 |
| 6 | PT Filter | BE only | 5 |
| 7 | CDT Filter | BE only | 5 |
| 8 | Dashboard/Reports Filter | BE only | 5 |
| 9 | FE Permission Store | FE only | 4 |
| 10 | FE Google Login Page | FE only | 4 |
| 11 | FE SecGuard + Sidebar | FE only | 5 |
| 12 | FE Filtered Display | FE only | 4 |
| 13 | Integration Test | BE + FE | 6 |
| **Total** | | | **68 tests** |
