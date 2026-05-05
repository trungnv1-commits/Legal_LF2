# Agent-Legal Trademark Check API — Bug Report & Support Request

**Báo cáo từ:** Apero Legal Workflow Team
**Gửi tới:** Coderhanoi AI Team (maintainer of `agent-legal.coderhanoi.id.vn`)
**Ngày:** 2026-04-23 (updated v2)
**Mức độ:** **P0 — Production outage**, 100% trademark check requests trả empty report

---

## 1. Tóm tắt

Hệ thống Legal Workflow của Apero tích hợp Trademark Check API của các bạn qua:
- `POST https://agent-legal.coderhanoi.id.vn/chat` với payload `/trademark-check {...}`
- `GET https://agent-legal.coderhanoi.id.vn/status/:jobId`

**Hiện trạng:** 100% request đều fail-fast (3-7 giây thay vì 7-10 phút bình thường) và trả `status=completed, result=null, error=null` — không có signal debug nào. `/health` vẫn báo "healthy" dù service thực chất broken.

Báo cáo này tổng hợp **4 bug patterns** với **3 case reproducible mới nhất** (2026-04-21 → 2026-04-23), kèm evidence cụ thể (jobId + threadId + timestamp UTC + duration) để team Coderhanoi debug server-side.

### Trạng thái hiện tại (2026-04-23)

| Bug | Status | Root cause |
|-----|--------|------------|
| **D — Silent fail** (P0) | ❌ Đang xảy ra | status=completed + result=null + error=null — không có explanation |
| **A — VietnamIP SSL** | ⚠️ Quan sát được | Scraping target có cert invalid |
| **B — Circuit breaker** | ⚠️ Quan sát được | CB mở → mọi job fail-fast < 500ms |
| **C — LangGraph recursion** | ⚠️ Quan sát được | Input có `:` → workflow loop hit limit 25 |

---

## 2. Environment

| Item | Value |
|------|-------|
| Agent-Legal URL | `https://agent-legal.coderhanoi.id.vn` |
| Agent-Legal health | `GET /health` → `{"status":"healthy"}` (luôn trả healthy kể cả khi broken functional — **monitoring false positive**) |
| Apero BE | `lww-backend-21672960606.asia-southeast1.run.app` (Cloud Run, Python 3.13 FastAPI) |
| Apero FE | `lww-frontend-21672960606.asia-southeast1.run.app` (React 19 Vite) |
| Integration period | 2026-04-21 đến nay |
| Test period | 2026-04-21 → 2026-04-23 |
| Latest BE revision (workaround deployed) | `lww-backend-00058-r65` |
| Latest FE revision | `lww-frontend-00052-8tp` |

---

## 3. Bug A — VietnamIP SSL certificate verify failure

### Mô tả
Agent-Legal scrape VietnamIP source, HTTPS client reject cert → fail sau 3 retries. Nguyên nhân khả dĩ:
- Server VietnamIP dùng self-signed cert
- Intermediate CA không trong trust store Node.js v18+
- Cert expired

### Evidence
```json
// Job 29666d24-0202-4b84-9d4b-cf075060c3d6
// Input: {"appNames":[{"appName":"PhotoAI"}],"platform":"ios"}
{
  "jobId": "29666d24-0202-4b84-9d4b-cf075060c3d6",
  "status": "failed",
  "createdAt": "2026-04-21T11:15:42.011Z",
  "updatedAt": "2026-04-21T11:15:45.541Z",
  "error": "VietnamIP failed after 3 attempts: unable to verify the first certificate"
}
```
Duration: **3.5 giây** (3 retries).

### Đề xuất fix
1. **Quick fix:** `rejectUnauthorized: false` trong axios/fetch khi gọi VietnamIP (acceptable vì read-only scrape, không gửi credentials)
2. **Correct fix:** cài CA chain VietnamIP vào container: `NODE_EXTRA_CA_CERTS=/path/to/vietnamip-ca.pem`
3. **Fallback:** cho phép disable source này qua config

---

## 4. Bug B — Circuit breaker không reset, lan truyền fail sang mọi job

### Mô tả
Sau khi Bug A fire N lần, circuit breaker của VietnamIP mở → **mọi job mới fail < 500ms** dù input không liên quan VietnamIP.

### Evidence
```json
// Job bcc4b003-36bd-4e83-b90e-f9944f91ff66 (test ngay sau 1 job fail)
{
  "jobId": "bcc4b003-36bd-4e83-b90e-f9944f91ff66",
  "status": "failed",
  "createdAt": "2026-04-21T11:16:06.189Z",
  "updatedAt": "2026-04-21T11:16:06.398Z",
  "error": "Circuit breaker open for VietnamIP"
}
```
Duration: **209ms** — không chạy pipeline gì cả.

### Vấn đề
- CB phủ toàn bộ service, không chỉ VietnamIP source
- Không có admin endpoint reset manual
- Cooldown không documented
- WIPO/USPTO/StoreSearch khỏe mạnh cũng bị block theo

### Đề xuất fix
1. **Isolate CB per-source** — chỉ block VietnamIP, source khác vẫn chạy → job có partial result
2. **Admin reset endpoint:** `POST /admin/circuit-breaker/reset?source=VietnamIP` (protected)
3. **Expose CB state:** `GET /circuit-breaker/status` → `{"VietnamIP": "open since ...", "WIPO_NAME": "closed"}`
4. **Config `enabled_sources`:** caller opt-out source ngay từ submit payload

---

## 5. Bug C — LangGraph recursion limit reached

### Mô tả
Input cụ thể (VD `appName` có `:` hoặc dài) → LangGraph workflow entering infinite loop → abort ở recursion limit 25.

### Evidence
```json
// Job 07c21e1b-1a8b-4564-be54-39170de85719
// Input: {"appNames":[{"appName":"AI Chatbot Assistant: TeraBot"}],"platform":"ios",
//         "iconUrls":["https://drive.google.com/uc?export=view&id=1msXVWOVPXhvE8SFrL6LD5qNQJyrTmK8s"]}
{
  "jobId": "07c21e1b-1a8b-4564-be54-39170de85719",
  "status": "completed",   // ⚠ completed nhưng thực ra đã fail (Bug D pattern)
  "result": null,
  "error": "Recursion limit of 25 reached without hitting a stop condition. You can increase the limit by setting the \"recursionLimit\" config key.\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langgraph/GRAPH_RECURSION_LIMIT/"
}
```

### Vấn đề
- **Status mapping sai:** lỗi LangGraph → `completed` thay vì `failed` (xem Bug D)
- Recursion limit 25 quá thấp cho pipeline 6 sources parallel
- App name có `:` có thể trigger LLM classification node loop

### Đề xuất fix
1. **Tăng `recursionLimit`:** `{ recursionLimit: 100 }` trong `graph.invoke(...)`
2. **Debug graph tìm cycle:** node nào self-loop?
3. **Sanitize appName:** strip `: / |` server-side
4. **Map recursion exception → status=failed**

---

## 6. Bug D — Silent fail: status=completed + result=null + error=null (P0 CRITICAL)

### Mô tả
**Đây là bug NGHIÊM TRỌNG NHẤT và đang diễn ra 100%.** Agent-Legal trả `status=completed` với **cả `result` và `error` đều null**. Không có signal nào để caller hiểu chuyện gì xảy ra.

### Evidence mới nhất (3 case liên tiếp, cách nhau vài tiếng — reproducible 100%)

#### Case 1 — 2026-04-23T08:19 UTC (mới nhất)
```json
{
  "jobId": "127a43eb-cfff-4556-ac75-04feefdc50a7",
  "threadId": "2b37470f-66c7-408a-aaf1-159af9d0bd8e",
  "status": "completed",
  "createdAt": "2026-04-23T08:19:19.860Z",
  "updatedAt": "2026-04-23T08:19:24.832Z",
  "result": null
  // KHÔNG có field "error"
}
```
**Duration: 4.972 giây** (vs 7-10 phút typical). Input: minimal (App Name + Drive direct iconUrl + ios).

#### Case 2 — 2026-04-23T07:25 UTC
```json
{
  "jobId": "baca9b2f-3618-4e70-9740-f9c983198667",
  "threadId": "4c717ba1-969e-42e9-8ae6-00322ff4be76",
  "status": "completed",
  "createdAt": "2026-04-23T07:25:01.683Z",
  "updatedAt": "2026-04-23T07:25:08.469Z",
  "result": null
  // KHÔNG có field "error"
}
```
**Duration: 6.786 giây.**

#### Case 3 — 2026-04-21T11:04 UTC (TeraBot)
Đã hết 24h TTL, nhưng pattern cùng: `status=completed, result=null` + error field có "Recursion limit..." (Bug C flavor).

### Quan sát hệ thống

**3 request cách nhau 3 tiếng, cùng pattern fail-fast (< 10s), cùng response shape** → **systemic issue**, KHÔNG phải race/flaky. Agent-legal đang broken 100% ở backend nhưng:
- `/health` vẫn báo healthy
- HTTP response hợp lệ (200)
- Job lifecycle "thành công" (pending → processing → completed)

→ Nghi vấn: pipeline failing silently ở một node cụ thể, exception bị swallow, result=null, status vẫn mark completed.

### Giả thuyết root cause
1. Circuit breaker mở (Bug B) → pipeline short-circuit → mark completed but không populate error
2. Node trong LangGraph throw exception → bị catch silently → clear error state trước khi return
3. Race condition "mark completed" vs "save result" — status update trước khi result lưu
4. Upstream data source (WIPO/USPTO/VietnamIP) rate-limit / block IP agent-legal → empty response swallowed

### Đề xuất fix (ưu tiên thứ tự)
1. **Invariant assertion** — không cho phép completed + null:
   ```javascript
   // Trước khi mark job completed
   if (status === 'completed' && !result) {
     status = 'failed';
     error = error || 'Pipeline returned empty result — check individual source logs';
   }
   ```
2. **Capture mọi node exception** — wrap từng LangGraph node với try/catch, persist error vào state
3. **Thêm field `stages_completed[]` + `stages_failed[]`:**
   ```json
   {
     "status": "failed",
     "error": "VietnamIP timeout",
     "stages_completed": ["submit", "WIPO_NAME", "USPTO_NAME"],
     "stages_failed": ["VietnamIP"],
     "partial_result": {...}  // nếu có
   }
   ```
4. **Sửa `/health`** để reflect functional state, không chỉ HTTP-up:
   ```json
   {
     "status": "degraded",
     "last_successful_job": "2026-04-20T10:00:00Z",
     "recent_failure_rate": "100% in last 1h",
     "sources": {"VietnamIP": "circuit_open", "WIPO_NAME": "healthy"}
   }
   ```

---

## 7. Apero đã workaround thế nào

Chúng tôi đã deploy các workaround sau trong `lww-backend` (revision `00058-r65`) để UI không broken hoàn toàn. **Tuy nhiên feature Trademark Check vẫn KHÔNG tạo được report thực sự — 100% user thấy error card.**

### 7.1 — Structured step-level logging (TrademarkCheckAgent trace)

Mỗi bước agent (SUBMIT_START, VALIDATE_INPUT, NORMALIZE_ICON_URL, UPSTREAM_SUBMIT, CACHE_CHECK, UPSTREAM_POLL, NORMALIZE_RESULT, SAVE_METADATA, COOLDOWN_SET) được log vào TSEV (PostgreSQL) + Cloud Logging. Endpoint admin debug:
```
GET /api/legal/task/{tsi_id}/trademark-check/trace
→ {"trace": [...], "count": N}
```
Đây là nền tảng chúng tôi phát hiện ra các bug trong báo cáo này.

### 7.2 — Normalize upstream response

```python
# Khi status=completed nhưng result=null → treat as failed
if status == "completed" and not has_valid_result:
    final_status = "failed"
    final_error, failure_reason = _build_fail_error(error_msg, upstream_duration, prev_error)
```

### 7.3 — Fail-fast detection (Bug D workaround)

Tính duration từ upstream `createdAt/updatedAt`. Nếu < 30s + empty result → classify `inferred_fast_fail` với error message rõ ràng:
> *"Upstream fail-fast (5.0s < 30s threshold). Likely circuit breaker open or infrastructure outage. Wait 10-15 minutes and retry, or notify admin."*

### 7.4 — Failure reason classifier

| Classification | Detection logic |
|---|---|
| `circuit_breaker_open` | Error chứa "circuit breaker" |
| `langgraph_recursion` | Error chứa "recursion limit" |
| `upstream_ssl_fail` | Error chứa "certificate" / "ssl" |
| `upstream_error` | Có error field khác |
| `inferred_fast_fail` | Duration < 30s + empty result + no error |
| `cached_error` | Fallback từ lần poll trước |
| `unknown` | Generic fallback |

### 7.5 — Client-side cooldown (10 phút)

Khi failure_reason = `circuit_breaker_open` hoặc `inferred_fast_fail` → lưu `tm_check_cooldown_until` vào TSI.metadata. Submit endpoint check cooldown trước → return 429 với seconds remaining.

→ **Bảo vệ upstream:** giảm tải khi agent-legal đang broken, tăng cơ hội CB tự reset.

### 7.6 — Input sanitizer (Bug C workaround)

Detect suspicious chars trong appName (`:` `|` `/` `?` `*`), length < 2 hoặc > 30 chars. Log step `SANITIZE_APPNAME: warned`. Trim whitespace tự động.

### 7.7 — UI improvements

- Auto-poll `/status` mỗi 15s — user không cần bấm Check manual
- Red error card với 4 causes gợi ý + upstream error text (mono-font)
- Classification pill (red badge `Reason: inferred_fast_fail`)
- Duration pill (`Upstream: 4.972s`) — bằng chứng fail-fast
- Cooldown pill (`Cooldown active (10 min)`)
- "Show Agent Trace" button → timeline expandable để debug

### Giới hạn workaround
**Không thể fix pipeline thực tế** — user vẫn KHÔNG nhận được trademark report. Feature hoàn toàn không dùng được cho legal production. Cần Coderhanoi fix root cause.

---

## 8. Ưu tiên xử lý đề nghị

| # | Bug | Priority | Effort | Impact nếu fix |
|---|-----|----------|--------|----------------|
| D | Silent fail — invariant assertion | **P0** | Thấp (1-2h) | Mỗi fail có error message → caller biết root cause |
| A | VietnamIP SSL | **P1** | Thấp (`rejectUnauthorized: false` hoặc cài CA) | 1 source khỏe lại |
| B | CB isolate per-source + reset endpoint | **P1** | Trung bình (refactor CB wrapper) | Job không bị block dây chuyền |
| C | LangGraph recursion — tăng limit + sanitize | **P2** | Thấp (tăng config) + debug | Tránh edge case input fail |

**Recommend P0:** fix Bug D trước. Dù A/B/C chưa fix, caller vẫn có error message hữu ích → debug tự chẩn đoán được.

---

## 9. Đề xuất config API bổ sung (nice to have)

Cho phép caller kiểm soát behavior qua payload để giảm phụ thuộc infrastructure:

```json
{
  "appNames": [{"appName": "MyApp"}],
  "platform": "ios",
  "_options": {
    "enabled_sources": ["WIPO_NAME", "USPTO_NAME", "StoreSearch"],
    "recursion_limit": 50,
    "timeout_seconds": 600,
    "fail_on_source_error": false,
    "return_partial_result": true
  }
}
```

Và `GET /metrics` để caller monitor health thực:
```json
{
  "success_rate_24h": "0%",
  "avg_duration_sec": 5.2,
  "sources": {
    "WIPO_NAME": {"status": "healthy", "p50_latency_ms": 2500},
    "VietnamIP": {"status": "circuit_open", "last_error": "...", "open_since": "..."}
  }
}
```

---

## 10. Thông tin hỗ trợ debug

### Priority 0 — Silent fail reproducible 100%

**Case 1 (trong TTL):** `127a43eb-cfff-4556-ac75-04feefdc50a7`
- threadId: `2b37470f-66c7-408a-aaf1-159af9d0bd8e`
- UTC: 2026-04-23T08:19:19.860Z → 08:19:24.832Z
- Duration: **4.972s**
- Status=completed, result=null, error=(missing)

**Case 2 (trong TTL):** `baca9b2f-3618-4e70-9740-f9c983198667`
- threadId: `4c717ba1-969e-42e9-8ae6-00322ff4be76`
- UTC: 2026-04-23T07:25:01.683Z → 07:25:08.469Z
- Duration: **6.786s**
- Status=completed, result=null, error=(missing)

→ 2 case cách nhau **54 phút**, cùng pattern → **systemic, KHÔNG phải flaky/race**.

### Priority 1 — Evidence đã hết TTL nhưng reproducible

- `07c21e1b-1a8b-4564-be54-39170de85719` — LangGraph recursion (Bug C) — reproduce bằng App Name có `:`
- `29666d24-0202-4b84-9d4b-cf075060c3d6` — VietnamIP SSL (Bug A)
- `bcc4b003-36bd-4e83-b90e-f9944f91ff66` — Circuit breaker (Bug B)

### Reproduce Bug D

```bash
# Minimal input — đã verify reproducible
curl -X POST https://agent-legal.coderhanoi.id.vn/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"/trademark-check {\"appNames\":[{\"appName\":\"TestApp\"}],\"platform\":\"ios\"}"}'

# Đợi 10s rồi poll:
curl https://agent-legal.coderhanoi.id.vn/status/<jobId>
# Expected: status=completed, result=null, KHÔNG có error — sau <10s
```

### Pattern thống kê (dựa trên Apero TSEV log)

| Ngày | Jobs submitted | Jobs completed với valid result | Silent fails |
|------|---------------|---------------------------------|--------------|
| 2026-04-21 | ~5 | 0 | 5 (100%) |
| 2026-04-22 | ~3 | 0 | 3 (100%) |
| 2026-04-23 (đến 08:20) | ~4 | 0 | 4 (100%) |

**Success rate = 0% trong 3 ngày.** Không có 1 job nào trả valid result kể từ khi Apero bắt đầu integrate.

---

## 11. Liên hệ

- **Apero Legal Team:** TrungNV1 — `trungnv1@apero.vn`
- **Apero BE revision (có workaround + structured logging):** `lww-backend-00058-r65`
- **Apero FE revision (auto-poll + trace viewer):** `lww-frontend-00052-8tp`
- **Admin debug endpoint:** `GET /api/legal/task/{tsi_id}/trademark-check/trace` (JWT protected — có thể share token nếu cần)
- **API guide:** `STAGING_API_GUIDE.md`
- **Kiến trúc tổng thể Legal v1b:** `LegalWorkflow_HEFAS_v1.md` (HEFAS v2.0 framework)

Rất mong team AI Coderhanoi hỗ trợ fix **Bug D (P0) sớm nhất có thể** vì đang ảnh hưởng 100% request. Chúng tôi sẵn sàng:
- Cung cấp log chi tiết hơn (TSEV event dump, request/response log)
- Test lại ngay khi các bạn deploy fix (có infra staging sẵn)
- Call sync nếu cần discuss technical detail

Cảm ơn!

— Legal Workflow Team, Apero Group
