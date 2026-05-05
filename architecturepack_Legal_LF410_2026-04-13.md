# Architecture Pack - LF410 Work Management System

> Project: **Legal**
> Module: **LF410 — Quy trình Quản trị Công việc Phòng Pháp chế**
> Version: **v1.0** (extends architecturepack_Legal_v7.md)
> Date: **2026-04-13**
> Source: `Voi_LF410.xlsx` (3 sheets: Quản trị công việc, Weekly Report, Phân công tự động)

---

## Tóm tắt Scope

**LF410** là quy trình quản trị (management layer) đứng trên tất cả các quy trình chuyên môn (LF1xx/LF2xx/LF3xx). LF410 **KHÔNG** thay thế các workflow LF210/LF220/LF230/LF240 hiện có trong v7, mà **bổ sung** lớp:

- **Tiếp nhận** yêu cầu đa kênh (Discord, Zalo, Email, Họp, Tự phát sinh)
- **Phân loại + Auto-assign** theo bảng rules (R00–R37)
- **Theo dõi** tiến độ định kỳ (Hiện trạng Thứ 2 & Thứ 4)
- **Weekly Report** tự động tổng hợp
- **Monthly/Quarterly review** đối chiếu với "Voi Tổng" (mục tiêu)

**Phạm vi thay đổi Entity Schema**:
- Mở rộng `TSI` (thêm 10 fields)
- Mở rộng `TSEV` (thêm 14 event_type mới)
- **Entity mới**: `ARL` (AssignmentRule), `WRP` (WeeklyReport), `PLG` (PriorityLevelGrid), `CLG` (ComplexityLevelGrid)

---

## Table of Contents

1. EntityRelationshipDescription
2. ProcessDescription
3. UIWireFrame
4. UserFlows
5. Complex Logic
6. Feature & Layer
7. Task Classification
8. System Design Recommendations

---

# 1. EntityRelationshipDescription

## 1.1 Reuse Existing Entities (từ v7)

| Entity | Vai trò trong LF410 | Thay đổi |
|--------|---------------------|----------|
| **TST** (TaskType) | Định nghĩa LF411–LF418 như Level-2/Level-3 dưới L1=`Management` | Thêm 8 TST mới |
| **TSI** (TaskItem) | Mỗi dòng NOWA200 = 1 TSI | **Mở rộng schema** (+10 fields) |
| **TNT** (TaskNextType) | Luồng chuyển tiếp LF411→LF412→...→LF418 | Thêm ~20 TNT |
| **TRT** (TaskRoleType) | Thêm role: REQUESTER, RECEIVER, MAIN_SUPPORTER, LEGAL_MANAGER | Thêm 4 role mới |
| **TRI** (TaskRoleItem) | Assignment PIC / Main Supporter | Không đổi |
| **TSEV** (TaskEvent) | Ghi nhận mọi hành động | **Mở rộng event_type** |
| **TDT** (TaskDocType) | Các loại file: Output file, Template | Không đổi |
| **TDI** (TaskDocItem) | File thực tế trên Google Drive | Không đổi |
| **EMP** (Employee) | 5 nhân sự Legal: LyNT, TrangCTH, LinhDK, LinhNK, LinhLNP | Không đổi |
| **CTY** (Country) | Phân biệt VN / Nước ngoài / Cross-border | Không đổi |
| **LE** (LegalEntity) | Pháp nhân: SGO, BGO, CGO, UGO, VGOH, VVOS... | Thêm data từ Phân công tự động |

## 1.2 Extend TSI Schema (bắt buộc thay đổi)

> **ĐÂY LÀ THAY ĐỔI ENTITY SCHEMA** → ảnh hưởng Task Classification (xem Section 7).

| Field mới | Type | Required | Description |
|-----------|------|----------|-------------|
| `urgency_level` | ENUM(UT1,UT2,UT3) | Y | UT1 🔴 (chiến lược/khẩn), UT2 🟡 (quan trọng/không gấp), UT3 🟢 (vận hành) |
| `complexity_level` | ENUM(L1,L2,L3,L4) | Y | L1 Chaotic, L2 Complex, L3 Complicated, L4 Simple |
| `legal_type` | ENUM(A_ASSET,E_ENTITY,L_LABOR) | Y | Nhóm công việc pháp lý |
| `request_channel` | ENUM(DISCORD,ZALO,EMAIL,MEETING,IN_PERSON,AUTO) | Y | Kênh tiếp nhận (LF411) |
| `requested_by_external` | STRING | N | Người yêu cầu ngoài (không có trong EMP) |
| `main_supporter_id` | STRING (FK → EMP) | N | Người hỗ trợ phụ (nếu PIC overload) |
| `drive_link` | STRING | N | Link Google Drive lưu output |
| `vendor_used` | STRING (FK → fps_ven) | N | Vendor nếu dùng dịch vụ ngoài (EY, PWC, One Visa...) |
| `cancel_reason` | STRING | N | Lý do cancel (nếu status = CANCELLED) |
| `task_code_display` | STRING | Y | Mã hiển thị dạng [A072], [A085] (auto-gen, khác với tsi_code) |

Cập nhật `status` enum: thêm `NOT_START`. Giữ nguyên: `IN_PROGRESS`, `DONE` (= COMPLETED), `CANCELLED`.

## 1.3 Extend TSEV event_type (+14 mới)

| event_type mới | Mô tả | Khi nào tạo |
|----------------|-------|-------------|
| `REQUEST_RECEIVED` | Nhận yêu cầu từ kênh ngoài | LF411 L2-1 |
| `TASK_INGESTED` | Nhập dòng mới NOWA200 | LF411 L2-2 |
| `AUTO_ASSIGNED` | Hệ thống tự phân công theo rule | LF412 L2-2 (ARL) |
| `MANAGER_REVIEWED` | Sếp review task Not start | LF412 L2-1 |
| `ASSIGNMENT_SET` | Sếp set PIC + Priority + Deadline + Todo | LF412 L2-2 |
| `STATUS_UPDATE` | Cập nhật "Hiện trạng [ngày]" định kỳ | LF414 L2-1 |
| `BLOCKER_REPORTED` | PIC báo blocker > 2 ngày | LF414 L2-2 |
| `ESCALATION_BOD` | Escalate vượt thẩm quyền | LF414 / LF415 |
| `DAILY_REVIEW` | Sếp review daily 9h30 | LF415 L2-1 |
| `COORDINATION_ACTION` | Sếp điều phối (đổi PIC, thêm supporter, đổi deadline) | LF415 L2-2 |
| `WEEKLY_REPORT_SUBMITTED` | Nhân viên nộp Weekly Report | LF416 |
| `DONE_CHECKLIST_PASS` | Task pass checklist 5 điểm | LF417 L2-1 |
| `MONTHLY_REVIEW` | Sếp review cuối tháng | LF418 L2-1 |
| `QUARTERLY_ALIGNMENT` | Đối chiếu Voi Tổng cuối quý | LF418 L2-2 |

## 1.4 New Entities

### 1.4.1 Entity: ARL (AssignmentRule) — MỚI

> Cấu hình 30+ rules phân công tự động (R00–R37 + Override R00–R03).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `arl_id` | STRING (PK) | Y | ID duy nhất |
| `arl_code` | STRING (UNIQUE) | Y | Mã rule: R00, R01, R10, R21... |
| `arl_group` | ENUM(OVERRIDE,LF1xx,LF2xx,LF3xx) | Y | Nhóm rule (thứ tự ưu tiên) |
| `priority_order` | INT | Y | Thứ tự áp dụng |
| `tst_id_match` | STRING (FK → TST) | N | TaskType phù hợp (null = bất kỳ) |
| `legal_type_match` | ENUM(A_ASSET,E_ENTITY,L_LABOR,ANY) | N | Loại pháp lý |
| `country_scope` | ENUM(VN,FOREIGN,CROSS_BORDER,FOUNDER,ANY) | Y | Địa bàn áp dụng |
| `complexity_scope` | STRING | N | VD: L1,L2 hoặc L3,L4 (CSV) |
| `keyword_match` | STRING (JSON array) | N | Từ khóa nhận dạng |
| `default_pic_id` | STRING (FK → EMP) | Y | PIC chính |
| `default_backup_id` | STRING (FK → EMP) | N | Backup PIC |
| `sla_hours` | INT | Y | SLA giờ |
| `sla_days_suffix` | STRING | N | Hiển thị: T+3, T+5~14 |
| `example_tasks` | STRING | N | Ví dụ task |
| `is_active` | BOOLEAN | Y | Active |

**Sample Data (từ sheet Phân công tự động):**

| arl_code | arl_group | country_scope | default_pic | backup | sla | keyword_match |
|----------|-----------|---------------|-------------|--------|-----|---------------|
| R00 | OVERRIDE | FOUNDER | LyNT | TrangCTH | 24h | ["tên sáng lập","cổ phần cá nhân","NCA sáng lập"] |
| R01 | OVERRIDE | ANY | LyNT | TrangCTH | 24h | ["UT1+restructure","UT1+thuế","UT1+lần đầu"] |
| R10 | LF1xx | FOREIGN | LyNT | TrangCTH | 48h | ["thành lập","lần đầu","SGO","BGO"] |
| R21 | LF2xx | FOREIGN | TrangCTH | LyNT | T+5 | ["đăng ký trademark","USPTO","WIPO"] |
| R34 | LF3xx | FOUNDER | LyNT | TrangCTH | Theo MOM | ["EP anh Tiệp","WP sang Mỹ","H1B"] |
| R03 | OVERRIDE | ANY | LyNT | TrangCTH | 24h | [] (fallback) |

**ARL Governance (policy only - khong dung schema hien tai):**

| Muc | Gia tri | Ghi chu |
|------|---------|---------|
| **ARL Owner** | PO cua LF (anh Tiep) | Chiu trach nhiem maintain rule set, duyet thay doi rule |
| **Review cadence** | 2 tuan/lan (giai doan dau) | Sau 2-3 quy co the noi len 1 thang/lan neu rule on dinh |
| **Threshold alert** | R03 (fallback) > 20% tong task/tuan | He thong tu dem so TSI match `arl_code=R03` trong tuan; neu vuot 20% tong task tuan do -> Discord notify ARL Owner de review & bo sung rule moi |
| **Audit trail** | Moi thay doi ARL ghi vao `TSEV.event_data.arl_change` (event_type=UPDATE tren rule row) | Dung infra TSEV san co, khong can bang moi |

> Note: Threshold 20% = `COUNT(TSI WHERE ARL_matched=R03) / COUNT(TSI all) trong tuan`. Nguong co the dieu chinh sau 1 quy quan sat.

### 1.4.2 Entity: WRP (WeeklyReport) — MỚI

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `wrp_id` | STRING (PK) | Y | - |
| `wrp_code` | STRING | Y | Mã tuần: WRP-2026W15-EMP002 |
| `emp_id` | STRING (FK → EMP) | Y | Người nộp |
| `week_start` | DATE | Y | Thứ 2 của tuần |
| `week_end` | DATE | Y | Chủ nhật |
| `section_a_data` | STRING (JSON) | Y | Tổng quan số lượng |
| `section_b_data` | STRING (JSON) | Y | Task UT1 đang xử lý |
| `section_c_data` | STRING (JSON) | Y | Deadline ≤ 7 ngày |
| `section_d_data` | STRING (JSON) | Y | Hoàn thành trong tuần |
| `section_e_data` | STRING (JSON) | Y | Vấn đề cần sếp quyết định |
| `status` | ENUM(DRAFT,SUBMITTED,REVIEWED) | Y | - |
| `submitted_at` | TIMESTAMP | N | Deadline 17h Thứ 3 |
| `reviewed_by` | STRING (FK → EMP) | N | Legal Manager đọc |
| `reviewed_at` | TIMESTAMP | N | - |

### 1.4.3 Entity: PLG (PriorityLevelGrid) & CLG (ComplexityLevelGrid) — MỚI

**PLG:**

| urgency_code | urgency_name | color | review_frequency |
|--------------|--------------|-------|------------------|
| UT1 | Khẩn – Chiến lược | RED | Hàng ngày (continuous) |
| UT2 | Quan trọng – Không cấp bách | YELLOW | 2 lần/tuần |
| UT3 | Vận hành thông thường | GREEN | Theo lịch định kỳ |

**CLG:**

| complexity_code | complexity_name | description |
|-----------------|-----------------|-------------|
| L1 | Chaotic | Phức tạp, chưa làm bao giờ |
| L2 | Complex | Phức tạp, đã có quy trình và làm 1-2 lần |
| L3 | Complicated | Đơn giản nhưng chưa có quy trình |
| L4 | Simple | Đơn giản, đã có template hoặc công cụ |

## 1.5 Relationship Map (LF410 additions)

```
TSI --(N:1)--> ARL (via AssignmentService)
TSI --(1:N)--> TSEV (STATUS_UPDATE)
EMP --(1:N)--> WRP
WRP --(1:N ref)--> TSI
TSI --(N:1)--> PLG (urgency)
TSI --(N:1)--> CLG (complexity)
```

---

# 2. ProcessDescription

## 2.1 TST Tree cho LF410

```
LF410-Management (L1)
|-- LF411-Tiep nhan yeu cau
|-- LF412-Phan loai & Phan cong
|-- LF413-Thuc hien cong viec
|-- LF414-Cap nhat hien trang
|-- LF415-Sep review hang ngay
|-- LF416-Bao cao tuan
|-- LF417-Hoan thanh & Luu tru
`-- LF418-Review muc tieu
```

## 2.2 TNT (Transitions) - cac nhanh chinh

| From | To | Condition |
|------|-----|-----------|
| LF411.1 | LF411.2 | Co du nguoi yeu cau, noi dung, deadline |
| LF411.2 | LF412.1 | NOWA200 row created, status = NOT_START |
| LF412.1 | LF412.2 | Sep da doc Details + Muc tieu |
| LF412.2 | LF413.1 | Da set task_code + priority + PIC + deadline + todo-list |
| LF413.2 | LF414 | Task da co tien do moi |
| LF414.1 | LF414.2 | Blocker > 2 ngay OR UT1 nguy co lo deadline |
| LF415.2 | LF414 | Sau dieu phoi, PIC tiep tuc |
| LF417.1 | LF417.2 | Checklist 5 diem xanh het |
| LF417.2 | (END) | status = DONE |
| LF417.1 | LF411 | Phat sinh follow-up task -> quay lai |
| *       | LF416.1 | Dinh ky Thu 3 17h (cron) |
| *       | LF418.1 | Dinh ky cuoi thang (cron) |
| LF418.1 | LF418.2 | Cuoi quy (thang 3/6/9/12) |

## 2.3 TRT (Role Types) bo sung

| Role moi | Mo ta |
|----------|-------|
| REQUESTER | Ben yeu cau task |
| RECEIVER | Nguoi nhan yeu cau (Bot/Nhan vien) |
| MAIN_SUPPORTER | Ho tro PIC khi overload |
| LEGAL_MANAGER | Truong phong Legal (LyNT) |

---

# 3. UIWireFrame

## 3.1 Navigation

```
+---------------------+
|  LEGAL WORKFLOW     |
+---------------------+
| Dashboard           | (existing)
| My Tasks            | (existing)
| NOWA200 Queue       | NEW - LF411/LF412
| Daily Review        | NEW - LF415 (Manager only)
| Weekly Report       | NEW - LF416
| Voi Tong            | NEW - LF418 (Manager only)
| Assignment Rules    | NEW - ARL config
+---------------------+
```

## 3.2 NOWA200 Queue Page (LF411 + LF412)

```
+-------------------------------------------------------------------+
| NOWA200 -- QUEUE CHINH                      [+ Nhap task moi]     |
+-------------------------------------------------------------------+
| Ma   | Title              | Type | UT   | L  | PIC     | DDL     |
|------|--------------------|------|------|----|---------|---------|
|[A72] | Check app phap nhan| E    | UT1  | L2 | LyNT    | 30/4    |
|[A85] | Bank OCBC CGO      | E    | UT1  | L1 | TrangCTH| 30/4    |
|[NEW]*| Thanh lap SGO3     | E    |  --  | -- | [auto]  |  --     |
+-------------------------------------------------------------------+
```

Task Detail Drawer: hien form chon Urgency/Complexity/Deadline + Todo-list breakdown.

## 3.3 Daily Review Page (LF415 - Manager only)

- Section A: UT1 Tasks (count, PIC, DDL, Status OK/BLOCKER/OVERDUE)
- Section B: Deadline <= 7 ngay
- Section C: Workload Distribution (bar chart theo PIC)
- Bulk actions: Add Supporter, Extend DDL, Change PIC, Escalate BOD

## 3.4 Weekly Report Page (LF416)

- Section A: Tong quan (legal_type x urgency_level)
- Section B: UT1 dang xu ly
- Section C: Deadline <= 7 ngay
- Section D: Hoan thanh trong tuan
- Section E: Van de can sep quyet dinh
- Submit tu dong deadline 17h Thu 3

## 3.5 Assignment Rules Config (ARL CRUD)

Tabs theo arl_group: OVERRIDE, LF1xx, LF2xx, LF3xx
CRUD rule: code, scope, keywords, PIC, backup, SLA
[+ Import CSV] de load 38 rules tu sheet Phan cong tu dong

---

# 4. UserFlows

## 4.1 Flow: Nhan vien tiep nhan yeu cau (LF411)

```
Actor: Nhan vien nhan task / Bot
1. Yeu cau den qua kenh (Discord/Zalo/Email/Meeting)
2. Nhan vien mo NOWA200 Queue -> click [+ Nhap task moi]
3. Dien form: L1 LegalEntity, L2 LegalType, Title, Description, Goal,
   Requester, Request Channel. De trong: PIC, Priority, Deadline
4. Submit -> he thong:
   a. Tao TSI (status=NOT_START)
   b. Tao TSEV (event_type=REQUEST_RECEIVED)
   c. Tao TSEV (event_type=TASK_INGESTED)
   d. [Optional] chay ARL auto-suggest PIC -> preview
5. Notification den Legal Manager (Discord webhook)
```

## 4.2 Flow: Manager phan cong (LF412)

```
Actor: Legal Manager (LyNT)
Trigger: 10h va 15h hang ngay (co the manual)
1. Mo NOWA200 Queue -> filter status=NOT_START
2. Doc Details + Goal, tao TSEV MANAGER_REVIEWED
3. Accept auto-assigned (tu ARL) hoac override:
   - Chon PIC, Main Supporter
   - Set Urgency (UT1/UT2/UT3), Complexity (L1-L4), Deadline
   - Break down Todo-list (B1, B2, B3...)
4. Submit -> he thong:
   a. Update TSI (status=IN_PROGRESS, set fields)
   b. Tao TRI (assignment PIC)
   c. Tao TSEV (event_type=ASSIGNMENT_SET)
   d. Notify PIC (Discord tag)
```

## 4.3 Flow: PIC cap nhat hien trang (LF414)

```
Actor: PIC
Trigger: Thu 2 & Thu 4 hang tuan (he thong nhac 8h sang)
1. PIC mo My Tasks -> filter IN_PROGRESS
2. Click [Update Status] voi format bat buoc:
   - [Da lam]: mo ta cu the
   - [Next step]: buoc tiep theo cu the
   - [Blocker]: cho ai/cai gi (optional)
   Validation: khong chap nhan "Dang lam" / "In progress"
3. Submit -> tao TSEV (event_type=STATUS_UPDATE)
4. Neu blocker > 2 ngay -> he thong alert
   -> PIC click [Escalate] -> TSEV BLOCKER_REPORTED -> notify Manager
```

## 4.4 Flow: Dong task (LF417)

```
Actor: PIC
1. Hoan thanh Todo-list
2. Click [Mark Done] -> Checklist 5 diem:
   [ ] Output dat Goal?
   [ ] Requester da confirm?
   [ ] Files da luu Drive?
   [ ] Drive link da dien NOWA200?
   [ ] Follow-up tasks? (neu co -> tao TSI moi, loop LF411)
3. Tat ca xanh -> TSEV DONE_CHECKLIST_PASS
4. Upload file cuoi + dien Drive link
   (rename: [Ma]_[Ten]_[Ngay]_[vFinal])
5. Submit:
   a. Update TSI (status=DONE, actual_completion_date)
   b. Tao TDI
   c. Tao TSEV workflow completed
```

---

# 5. Complex Logic

## 5.1 Auto-Assignment Engine (ARL Matching)

**Input**: 1 TSI vua tao (status=NOT_START)
**Output**: Suggested PIC + Backup + SLA

Trinh tu matching (priority_order ASC):
1. **OVERRIDE rules** (R00-R03) - check truoc
2. **LF1xx / LF2xx / LF3xx rules** - theo tst_id
3. **Fallback R03** - gan LyNT

Pseudo-code:

```
auto_assign(tsi):
    for rule in ARL.OVERRIDE (priority_order ASC):
        if match_rule(tsi, rule): return Suggestion(rule)
    for rule in ARL[tsi.tst_group] (priority_order ASC):
        if match_rule(tsi, rule): return Suggestion(rule)
    return Suggestion(pic='LyNT', backup='TrangCTH', sla=24, matched='R03')

match_rule(tsi, rule):
    # AND giua cac field co gia tri:
    check tst_id_match, legal_type_match, country_scope,
          complexity_scope (CSV), keyword_match (fuzzy text match)
    return True neu tat ca pass
```

## 5.2 Status Update Validation (LF414)

```
FORBIDDEN = ['dang lam', 'doi ket qua', 'in progress', 'tbd', 'todo']

validate(update):
    for field in [done_description, next_step]:
        if len(val) < 10: raise ValidationError
        if val in FORBIDDEN: raise ValidationError

    if blocker and blocker_since > 2 days:
        create_tsev(BLOCKER_REPORTED)
        notify_manager_discord()
```

## 5.3 Weekly Report Auto-Population

```
build_weekly_report(emp_id, week_start, week_end):
    # Section A: Counts by (legal_type x urgency_level)
    counts = query_tsi_counts(status IN (IN_PROGRESS, NOT_START))

    # Section B: UT1 tasks of emp
    ut1 = TSI.filter(status=IN_PROGRESS, urgency=UT1, pic=emp_id)
    section_b = extract_next_step_from_latest_TSEV(ut1)

    # Section C: Deadline <= 7 days
    section_c = TSI.filter(due <= week_end + 7d, pic=emp_id)

    # Section D: Completed this week (from TSEV)
    section_d = TSEV.filter(event_type=UPDATE, contains='workflow completed',
                             created_at in [week_start, week_end])

    return WRP.create(sections a-e, status=DRAFT)
```

## 5.4 Monthly/Quarterly Alignment (LF418)

```
quarterly_alignment(quarter):
    for group in [LF1xx_PN, LF2xx_Asset, LF3xx_Labor, LF4xx_Mgmt]:
        done = count_tsi(group, status=DONE, quarter)
        goal = voi_tong.get_goal(group, quarter)
        variance = done - goal
        if variance < 0: flag_for_bod(group, shortage=|variance|)

    # Detect repeating blockers (systemic patterns)
    blockers = TSEV.filter(event_type=BLOCKER_REPORTED, quarter)
    patterns = cluster_blockers(blockers)
    for p in patterns if p.count >= 3:
        suggest_systemic_fix(p)  # VD: 3 task block vi OCBC -> can bank khac
```

---

# 6. Feature & Layer

## 6.1 Feature Map

| Feature ID | Ten | Priority | Maps to TST |
|-----------|------|----------|-------------|
| F-LF411 | Tiep nhan & Ingest task | P0 | LF411 |
| F-LF412A | Auto-Assignment Engine (ARL) | P0 | LF412 |
| F-LF412B | Manual Assignment Override | P0 | LF412 |
| F-LF413 | Task Execution tracking | P0 | LF413 |
| F-LF414A | Status Update (Thu 2 & 4) | P0 | LF414 |
| F-LF414B | Blocker Escalation | P1 | LF414 |
| F-LF415A | Daily Review Dashboard | P1 | LF415 |
| F-LF415B | Coordination Actions | P1 | LF415 |
| F-LF416 | Weekly Report | P0 | LF416 |
| F-LF417 | Done Checklist + Archive | P0 | LF417 |
| F-LF418A | Monthly Review | P2 | LF418 |
| F-LF418B | Quarterly Voi Tong Alignment | P2 | LF418 |
| F-ARL-CRUD | Assignment Rules Config | P1 | (config) |
| F-NOTIF | Discord Notification Webhook | P1 | cross-cutting |

## 6.2 Layer Mapping

| Layer | Components |
|-------|------------|
| **UI Layer (FE)** | NOWA200 Queue page, Task Detail Drawer, Daily Review, Weekly Report, ARL Config |
| **API Layer (BE)** | /api/legal/tsi/*, /api/legal/weekly/*, /api/legal/arl/*, /api/legal/review/* |
| **Service Layer** | AssignmentService (ARL matching), StatusUpdateService, WeeklyReportService, NotificationService |
| **Event Layer (TSEV)** | * LF410 DOC + VIET TSEV voi cac event_type moi (Section 1.3) |
| **Entity Layer** | TSI (extend), ARL (new), WRP (new), PLG (new), CLG (new) |
| **Integration Layer** | Discord Webhook (notif), Google Drive (links), future: Bot Legal |

## 6.3 API Endpoints moi

| Method | Path | Feature | Mo ta |
|--------|------|---------|-------|
| POST | /api/legal/tsi/ingest | F-LF411 | Nhap task moi (LF411.2) |
| POST | /api/legal/tsi/{id}/auto-assign | F-LF412A | Run ARL matching |
| PUT | /api/legal/tsi/{id}/assignment | F-LF412B | Manual assign/override |
| POST | /api/legal/tsi/{id}/status-update | F-LF414A | Cap nhat Hien trang |
| POST | /api/legal/tsi/{id}/escalate | F-LF414B | Bao blocker |
| GET | /api/legal/review/daily | F-LF415A | Dashboard UT1/Deadline/Workload |
| POST | /api/legal/review/coordinate | F-LF415B | Dieu phoi (doi PIC, supporter, DDL) |
| GET | /api/legal/weekly/draft?week={iso} | F-LF416 | Auto-populate WRP draft |
| POST | /api/legal/weekly/{id}/submit | F-LF416 | Submit WRP |
| POST | /api/legal/tsi/{id}/done | F-LF417 | Mark done + checklist |
| GET | /api/legal/review/monthly?month={m} | F-LF418A | Monthly KPI |
| GET | /api/legal/review/quarterly?q={q} | F-LF418B | Doi chieu Voi Tong |
| CRUD | /api/legal/arl/* | F-ARL-CRUD | ARL management |

---

# 7. Task Classification

## 7.1 Scope thay doi cua LF410

| Thay doi | Anh huong Entity Schema? | Doc/Viet Layer Event? | Sua CalculateKR/ExtractEvent? |
|----------|-------------------------|----------------------|-------------------------------|
| Them TST rows (LF411-LF418) | Khong (chi them data) | -- | -- |
| **Mo rong TSI schema** (+10 fields) | **CO** | -- | -- |
| **Mo rong TSEV event_type** (+14 event_type moi) | **CO** (mo rong enum) | **CO - ca doc va viet** | -- |
| **New entity ARL** | **CO** (tao bang moi) | -- | -- |
| **New entity WRP** | **CO** (tao bang moi) | **CO doc** TSEV de build WRP | -- |
| **New entity PLG/CLG** | **CO** (tao bang lookup) | -- | -- |
| UI Queue page + Detail Drawer | Khong | -- | -- |
| Discord Webhook | Khong | -- | -- |

## 7.2 Ket luan: **LOAI C**

**Ly do:**
1. **CO sua Entity Schema** (TSI + TSEV + 4 entity moi ARL/WRP/PLG/CLG) -> qua nguong Loai A
2. **CO doc va viet cac bang thuoc Layer Event** (TSEV):
   - LF411, LF412, LF413, LF414, LF417 **tao TSEV** (ghi) voi event_type moi
   - LF415, LF416, LF418 **doc TSEV** (aggregate daily/weekly/monthly)
3. Khong sua bang thuoc CalculateKR va ExtractEvent (cac engine cua module FPA - khong lien quan Legal)

**-> Theo luat: Loai C can bao cho POSUP va ARCH de duyet Architecture Pack truoc khi thuc thi.**

---

# 8. System Design Recommendations

## 8.1 Cai thien de xuat

1. **Them cron job cho scheduled triggers**:
   - 8h Thu 2 & Thu 4: nhac PIC cap nhat Hien trang (LF414.1)
   - 9h30 hang ngay: generate Daily Review data (LF415.1)
   - 10h & 15h hang ngay: nhac Manager review task NOT_START (LF412.1)
   - 17h Thu 3: deadline submit Weekly Report (LF416)
   - Ngay cuoi thang: trigger Monthly Review (LF418.1)

2. **Notification Hub** (new cross-cutting service):
   - Discord Webhook cho: task moi, assignment, blocker, escalation, deadline
   - Fallback: email neu Discord fail
   - Rate-limit: gom notification thanh digest neu > 10/gio cho 1 user

   **2a. SLA Breach Escalation Path (policy only - khong can API moi):**

   Khi task bi detect SLA breach (due_date < now AND status != DONE), he thong chay theo policy sau:

   | Moc thoi gian | Hanh dong | TSEV event_type |
   |----------------|-----------|-----------------|
   | **T+2h** (sau SLA breach) | Chuyen task sang MAIN_SUPPORTER (doi TRI, giu PIC chinh), Discord tag @main_supporter | `COORDINATION_ACTION` (sub=REASSIGN_TO_SUPPORTER) |
   | **T+4h** | Escalate len LyNT (Legal Manager). Notify kem snapshot task + lich su blocker | `ESCALATION_BOD` (target=LEGAL_MANAGER) |
   | **T+8h** (ap dung cho UT1) | Kich hoat ESCALATION_BOD: notify BOD, flag task len Daily Review Dashboard dac biet | `ESCALATION_BOD` (target=BOD) |

   **Backup matrix (tham chieu sheet Phan cong tu dong):**

   | PIC chinh | Backup mac dinh | Ghi chu |
   |-----------|-----------------|---------|
   | LyNT | (khong co fixed backup) | Manager - escalate len BOD truc tiep |
   | TrangCTH | LyNT | UT1 tasks co the cho LyNT review truoc |
   | LinhDK | TrangCTH | |
   | LinhNK | LinhDK | |
   | LinhLNP | LinhDK | |

   **Luu y ky thuat:**
   - `ESCALATION_BOD` da co san trong TSEV event_type (Section 1.3) -> khong can API moi
   - Tan dung `NotificationService` + `StatusUpdateService` hien co, chi bo sung scheduler rule (cron) check SLA breach moi 30 phut
   - UT2/UT3: chi chay toi moc T+4h (khong kich hoat BOD tu dong); BOD chi duoc trigger manual qua nut [Escalate BOD] trong Daily Review


3. **ARL Rules Versioning**:
   - ARL co `valid_from`/`valid_to` de track lich su thay doi rules
   - Log moi match: luu trong `TSEV.event_data.matched_rule` de audit

4. **TSI_Filter integration**:
   - Field `legal_type` moi nen day vao `TSI_Filter` (filter_type='LEGAL_TYPE') de reuse filter infra v7
   - Tuong tu `urgency_level` -> `TSI_Filter` (filter_type='UT')

5. **Voi Tong integration**:
   - Entity `VGT (VoiGoalTracker)` de luu muc tieu ngan han/dai han
   - LF418.2 query `VGT` vs `TSI Done` count de tinh variance

6. **Hien trang column anti-pattern**:
   - File Excel hien tai them cot moi moi tuan ("Hien trang 2026-04-13") -> khong scale
   - -> Chuyen sang **TSEV rows** voi event_type=STATUS_UPDATE (da thiet ke)
   - UI hien thi duoi dang timeline nguoc

7. **Auto-code generation [Axxx]**:
   - Dung sequence/counter trong bang `task_code_counter` (nhu `fps_id_counter`)
   - Format: [A{next_int:03d}] - [A500] neu da co 499 task
   - Luu vao `tsi.task_code_display`, tach biet voi `tsi_code` (internal UUID)

8. **Bot Legal integration placeholder**:
   - LF411 co "Nhan vien/Bot legal" -> thiet ke `REQUESTER` role co the la `BOT`
   - API /api/legal/tsi/ingest nen accept source: HUMAN | BOT_DISCORD | BOT_EMAIL
   - Plan cho MVP sau: Bot NLP parse Discord message -> auto-create TSI draft

## 8.2 Risks & Unknowns (can xac nhan)

| Risk | Can xac nhan |
|------|--------------|
| File `layerevent.md` khong co - classification dua tren suy luan tu v7 (TSEV = Layer Event) | User xac nhan dinh nghia Layer Event |
| "Phan cong tu dong" sheet co nhieu rule - can CSV import de khong enter thu cong 38 rules | Co nen build ARL import tool? |
| Integration voi "NOWA200" hien la Google Sheets - LF410 v2 co thay the hoan toan hay song song? | Migrate path? |
| `Voi Tong` chua co entity - LF418.2 de xuat VGT nhung chua scope | Build trong LF410 hay tach phase 2? |
| Do kho bang (L1 Chaotic/L2 Complex/L3 Complicated/L4 Simple) nguoc voi Cynefin goc | Xac nhan y nghia L1-L4? |

## 8.3 Dong bo voi Architecture v7

| Thanh phan v7 | Lien ket LF410 |
|---------------|----------------|
| TST Level 1: Copyright, Trademark, Policy, Contract | LF410 them Level 1 `Management` (meta workflow) |
| TSEV event_type hien co: CREATE, UPLOAD, VIEW, UPDATE, COMMENT, APPROVE, REJECT | LF410 them 14 event_type quan tri (Section 1.3) |
| Filter entities (KR, CDT, PT, LE, CTY, TLT, TUT, TST_Size, TMT) | LF410 reuse + them enum urgency_level, complexity_level, legal_type (co the convert thanh Filter tables) |
| Role: SUBMITTOR, TEAM_APPROVER, FINANCE_APPROVER, LEGAL_APPROVER | LF410 them REQUESTER, RECEIVER, MAIN_SUPPORTER, LEGAL_MANAGER |

---

# 9. Action Items -- Next Steps

> **LF410 la TASK LOAI C** -> Can bao **POSUP + ARCH** duyet Architecture Pack truoc khi thuc thi.

- [ ] **[POSUP]** Duyet Section 1 (Entity changes) + Section 2 (Process) + Section 7 (Classification)
- [ ] **[ARCH]** Duyet Section 1.3 (TSEV event_type mo rong) + Section 5 (Complex Logic) + Section 8 (Integration voi v7)
- [ ] Import 38 ARL rules tu sheet `Phan cong tu dong` -> seed ARL table (CSV import tool)
- [ ] Confirm ten TST Level-1: `Management` hay `TaskManagement` (tranh trung FPA)
- [ ] Confirm flag `BOT_DISCORD` source cho LF411 (MVP 1 co enable bot khong?)
- [ ] Thiet ke cron scheduler (Section 8.1) - chay bang Celery Beat hay GCP Cloud Scheduler?
- [ ] Thiet ke migration script cho TSI extended schema (backward-compatible)

---

**End of Architecture Pack -- LF410 v1.0 -- 2026-04-13**
