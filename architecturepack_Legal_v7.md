# Architecture Pack - Legal Workflow System v7

> Project: **Legal**
> Date: 2026-03-26
> Version: v7 - AI Review (GPT-4o-mini), file upload, SUBMITTED status, role-based UI

---

## Table of Contents

1. [EntityRelationshipDescription](#1-entityrelationshipdescription)
2. [ProcessDescription](#2-processdescription)
3. [UIWireFrame](#3-uiwireframe)
4. [UserFlows](#4-userflows)
5. [Complex Logic](#5-complex-logic)
6. [Feature & Layer](#6-feature--layer)
7. [System Design Recommendations](#7-system-design-recommendations)
8. [TDTP - TaskDocTypeTemplate](#8-tdtp---taskdoctypetemplate-bieu-mau-con-cua-quy-trinh)
9. [v6 Changes - SQLite, APPROVED, Inline Review, Role UI](#9-v6-changes)

---

# 1. EntityRelationshipDescription

## 1.1 Workflow Engine Entities (Core)

> **Nguyên tắc**: Chỉ sử dụng quan hệ Workflow Entity. KHÔNG dùng quan hệ Domain Entity.

### Entity: TST (TaskType)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tst_id | STRING (PK) | Y | ID duy nhat cua TaskType |
| tst_code | STRING | Y | Ma TaskType (vd: `LF210`, `LF220`, `LF230`, `LF240`) |
| tst_name | STRING | Y | Ten TaskType (vd: "Copyright Check", "Trademark Check") |
| tst_level | INT | Y | Level trong cay: 1=Loai Task, 2=Phase, 3=Step |
| myParentTask | STRING (FK -> TST) | N | Self-reference, FK tro ve TST cha (quan he cay) |
| description | STRING | N | Mo ta chi tiet |
| sla_days | INT | N | So ngay SLA mac dinh |
| is_active | BOOLEAN | Y | Trang thai active |
| created_at | TIMESTAMP | Y | Ngay tao |
| updated_at | TIMESTAMP | Y | Ngay cap nhat |

**Ghi chu**: TST co cau truc phan cap 3 level:
- **Level 1** (Loai Task): `LaborContract`, `VendorContract`, `Copyright`, `Trademark`, `Policy`, `Contract`
- **Level 2** (Phase): Con cua Level 1. VD: `LF211-Input`, `LF212-Ra soat`, `LF222-Tra cuu`
- **Level 3** (Step): Con cua Level 2. VD: `LF212.1-Doi chieu man hinh`, `LF222.1-Tra cuu WIPO`

### Entity: TNT (TaskNextType)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tnt_id | STRING (PK) | Y | ID duy nhat |
| from_tst_id | STRING (FK -> TST) | Y | TaskType nguon |
| to_tst_id | STRING (FK -> TST) | Y | TaskType dich (buoc tiep theo) |
| condition_expression | STRING | N | Bieu thuc dieu kien de chuyen buoc (JSON logic) |
| condition_description | STRING | N | Mo ta dieu kien bang van ban |
| priority | INT | N | Thu tu uu tien khi co nhieu nhanh |
| is_active | BOOLEAN | Y | Trang thai active |

**Ghi chu**: TNT dinh nghia luong chuyen tiep giua cac TST. Mot TST co the co nhieu TNT (nhieu nhanh re). Dieu kien (condition) xac dinh nhanh nao duoc chon.

### Entity: TDT (TaskDocType)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tdt_id | STRING (PK) | Y | ID duy nhat |
| tdt_code | STRING | Y | Ma loai tai lieu (vd: `CONTRACT`, `FORM`, `CERTIFICATE`, `REPORT`) |
| tdt_name | STRING | Y | Ten loai tai lieu |
| description | STRING | N | Mo ta |
| file_extensions | STRING | N | Dinh dang cho phep (vd: `.pdf,.docx,.xlsx`) |
| max_file_size_mb | INT | N | Kich thuoc toi da (MB) |
| is_required | BOOLEAN | N | Bat buoc hay khong |
| tdtp_id | STRING (FK -> TDTP) | N | 1:1 voi TDTP. Lien ket den template bieu mau tuong ung. Xem Section 8. |
| is_active | BOOLEAN | Y | Trang thai active |

### Entity: TDTP (TaskDocTypeTemplate)

> **Quan he 1:1 voi TDT**. Moi TDT co toi da 1 TDTP (template bieu mau).
> TDTP chua noi dung mau/cau truc cua tai lieu, giup nguoi dung biet can dien gi va format nhu the nao.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tdtp_id | STRING (PK) | Y | ID duy nhat, trung voi tdt_id (1:1) |
| tdt_id | STRING (FK -> TDT, UNIQUE) | Y | Lien ket 1:1 voi TDT |
| tdtp_code | STRING | Y | Ma template (vd: `LF211-Mau_so_sanh_UIU`) |
| tdtp_name | STRING | Y | Ten template |
| description | STRING | N | Mo ta noi dung va cach su dung template |
| template_file_ref | STRING | N | Duong dan file template mau (vd: `Legal_md/LF211-Copyright-Mau_so_sanh_UIU.md`) |
| template_structure | STRING (JSON) | N | Cau truc cac cot/muc cua template (JSON schema) |
| sample_data | STRING (JSON) | N | Du lieu mau (5 dong) de minh hoa |
| version | INT | Y | Phien ban template (default: 1) |
| is_active | BOOLEAN | Y | Template con su dung khong |
| created_at | TIMESTAMP | Y | Ngay tao |
| updated_at | TIMESTAMP | Y | Ngay cap nhat |

### Entity: TSI (TaskItem)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tsi_id | STRING (PK) | Y | ID duy nhat cua TaskItem |
| tsi_code | STRING | Y | Ma TaskItem (auto-gen, vd: `TSI-20260324-001`) |
| tst_id | STRING (FK -> TST) | Y | TaskType tuong ung (Level 1, lien ket de biet loai task) |
| myParentTask | STRING (FK -> TSI) | N | Self-reference, FK tro ve TSI cha (quan he cay task instance) |
| title | STRING | Y | Tieu de task |
| description | STRING | N | Mo ta chi tiet |
| status | STRING | Y | Trang thai: `DRAFT`, `IN_PROGRESS`, `PENDING_REVIEW`, `SUBMITTED`, `APPROVED`, `REJECTED`, `COMPLETED`, `CANCELLED` |
| priority | STRING | N | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |
| requested_by | STRING (FK -> EMP) | N | Nguoi yeu cau |
| assigned_to | STRING (FK -> EMP) | N | Nguoi duoc gan |
| due_date | DATE | N | Han chot |
| actual_completion_date | DATE | N | Ngay hoan thanh thuc te |
| current_tst_level | INT | N | Level TST hien tai dang xu ly (1/2/3) |
| current_tst_id | STRING (FK -> TST) | N | TST hien tai dang thuc hien |
| created_at | TIMESTAMP | Y | Ngay tao |
| updated_at | TIMESTAMP | Y | Ngay cap nhat |

**Ghi chu**: TSI la instance thuc te cua 1 task. Khi tao hop dong moi, tao TSI L1, sau do TSI L2, TSI L3 la con cua nhau qua `myParentTask`.

### Entity: TDI (TaskDocItem)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tdi_id | STRING (PK) | Y | ID duy nhat |
| tdt_id | STRING (FK -> TDT) | Y | Loai tai lieu |
| tsi_id | STRING (FK -> TSI) | N | TaskItem lien quan |
| file_name | STRING | Y | Ten file |
| file_url | STRING | Y | URL luu tru (server local `/api/legal/task/{tsi_id}/file/{name}` hoac Google Drive URL) |
| file_size_bytes | INT | N | Kich thuoc file |
| version | INT | Y | Phien ban (version control) |
| uploaded_by | STRING (FK -> EMP) | Y | Nguoi upload |
| uploaded_at | TIMESTAMP | Y | Ngay upload |
| status | STRING | Y | `ACTIVE`, `ARCHIVED`, `DELETED` |
| notes | STRING | N | Ghi chu |

### Entity: TRT (TaskRoleType)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| trt_id | STRING (PK) | Y | ID duy nhat |
| trt_code | STRING | Y | Ma role: `SUBMITTOR`, `TEAM_APPROVER`, `FINANCE_APPROVER`, `LEGAL_APPROVER` |
| trt_name | STRING | Y | Ten role |
| description | STRING | N | Mo ta |
| is_active | BOOLEAN | Y | Trang thai active |

### Entity: TRI (TaskRoleItem)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tri_id | STRING (PK) | Y | ID duy nhat |
| trt_id | STRING (FK -> TRT) | Y | Role type |
| tsi_id | STRING (FK -> TSI) | N | TaskItem cu the (neu assign cho task cu the) |
| emp_id | STRING (FK -> EMP) | Y | Nhan su duoc phan cong |
| assigned_at | TIMESTAMP | Y | Ngay phan cong |
| is_active | BOOLEAN | Y | Con hieu luc khong |

**Ghi chu**: TRI la ban phan cong nhan su vao Role cho tung task cu the (TSI). Mot EMP co the co nhieu TRI (nhieu role tren nhieu task).

### Entity: TSEV (TaskEvent)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| tsev_id | STRING (PK) | Y | ID duy nhat |
| tsi_id | STRING (FK -> TSI) | Y | TaskItem lien quan |
| event_type | STRING | Y | Loai su kien: `CREATE`, `UPLOAD`, `VIEW`, `UPDATE`, `COMMENT`, `APPROVE`, `REJECT`. emp_id=`AI_REVIEWER` cho AI auto-review |
| emp_id | STRING (FK -> EMP) | Y | Nguoi thuc hien |
| event_data | STRING (JSON) | N | Du lieu su kien (noi dung comment, ly do reject, ...) |
| tdi_id | STRING (FK -> TDI) | N | Tai lieu lien quan (neu la UPLOAD event) |
| created_at | TIMESTAMP | Y | Thoi diem su kien |

### Entity: EMP (Employee) — ref: `fps_emp`

> **Dung chung** voi FPA module. emp_code theo chuan HR: `{TenVietTat}{HoVietTat}` (vd: TiepTA, TrungNV, HuongLT).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| emp_id | STRING (PK) | Y | ID duy nhat (auto-gen) |
| emp_code | STRING (UNIQUE) | Y | Ma nhan vien theo HR: `{Ten}{Ho viet tat}` (vd: `TiepTA`, `TrungNV`) |
| emp_name | STRING | Y | Ho ten day du |
| email | STRING | Y | Email cong ty (vd: `tiepta@apero.vn`) |
| department | STRING (FK -> CDT) | N | Phong ban (CDT code, vd: `CDT-LEGAL`) |
| position | STRING | N | Chuc vu |
| grade_code | STRING (FK -> EGR) | N | Cap bac nhan vien (tu fps_egr) |
| is_active | BOOLEAN | Y | Con lam viec khong |

**Du lieu mau (format HR):**

| emp_id | emp_code | emp_name | email | department | position |
|--------|----------|----------|-------|------------|----------|
| EMP-001 | TiepTA | Tran Anh Tiep | tiepta@apero.vn | CDT-LEGAL | Legal Manager |
| EMP-002 | TrungNV | Nguyen Van Trung | trungnv@apero.vn | CDT-LEGAL | Legal Specialist |
| EMP-003 | HuongLT | Le Thi Huong | huonglt@apero.vn | CDT-LEGAL | Legal Intern |
| EMP-004 | MinhPT | Pham Thanh Minh | minhpt@apero.vn | CDT-PRODUCT | Product Manager |
| EMP-005 | LanNTH | Nguyen Thi Hong Lan | lannth@apero.vn | CDT-ASO | ASO Specialist |
| EMP-006 | DucNH | Nguyen Hoang Duc | ducnh@apero.vn | CDT-FINANCE | Accountant |

---

## 1.2 Filter Entities (Domain - Dung cho bo loc)

> Cac entity nay la **bang bo loc** (lookup), **dung chung voi FPA module**.
> **KHONG tao entity moi** - reference truc tiep tu `fps_data` dataset (BigQuery).
> Filter code **lay tu `fp-a-project.allocation_config.AllocationToItem_NativeTable`** (742 rows, 6 cols).

### Nguon du lieu Filter: AllocationToItem_NativeTable

> Query: `SELECT * FROM fp-a-project.allocation_config.AllocationToItem_NativeTable`
> Schema: `FROM_Y_BLOCK_FromType | YNumber | FROM_Y_BLOCK_FromItem | TO_Y_BLOCK_ToType | TO_Y_BLOCK_ToItem | Config_Upload_at`

**Mapping FromType -> ToType (10 combos, 742 rows):**

| FromType (Filter goc) | ToType (Filter dich) | Rows | Items | Y nghia trong Legal |
|----------------------|---------------------|------|-------|---------------------|
| **CDT1** | CDT-S1 | 7 | 7 | Budget Owner / Phong ban so huu chi phi |
| **CTY-S2** | CTY0 | 17 | 17 | Quoc gia (Store, bao ho TM, luat ap dung HD) |
| **PT0** | PT-S2 | 40 | 39 | Product/App code |
| **NP** | NP-D365 | 548 | 546 | Ky ke hoach (period D365) |
| **NP** | PX-DP15 | 16 | 16 | Period X - Day Period 15 |
| **NP** | PX-MP1 | 2 | 2 | Period X - Month Period 1 |
| **NP** | PX-MP12 | 13 | 13 | Period X - Month Period 12 |
| **NP** | PX-MP36 | 37 | 37 | Period X - Month Period 36 |
| **NP** | PX-MP60 | 61 | 61 | Period X - Month Period 60 |
| **NHRC** | NHRC | 1 | 1 | Nhan luc (HR cost) |

### Entity: CDT (BudgetOwner) — FromType: `CDT1` -> ToType: `CDT-S1`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| cdt_code | STRING (PK) | Y | Ma CDT (= TO_Y_BLOCK_ToItem) |
| cdt_name | STRING | Y | Ten CDT |
| cdt_level | INT | N | Cap trong cay CDT |
| parent_cdt_code | STRING (FK -> CDT) | N | CDT cha |
| team_head | STRING | N | Truong nhom |

**Du lieu thuc te (tu AllocationToItem, CDT1 -> CDT-S1, 7 items):**

| cdt_code | Mo ta |
|----------|-------|
| SAP | SAP / ERP |
| AST | Asset Management |
| HQ1 | Head Quarter 1 |
| HQ2 | Head Quarter 2 |
| TER | Territory / Regional |
| SMI | SMI |
| VIS | VIS |

### Entity: CTY (Country) — FromType: `CTY-S2` -> ToType: `CTY0`

> **Quan trong cho Legal**: CopyrightReview (quoc gia Store publish), TrademarkCheck (quoc gia bao ho WIPO/USPTO), Contract (luat ap dung).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| country_code | STRING (PK) | Y | Ma quoc gia ISO 3166 (= TO_Y_BLOCK_ToItem) |
| country_name | STRING | Y | Ten quoc gia |

**Du lieu thuc te (tu AllocationToItem, CTY-S2 -> CTY0, 17 items):**

| country_code | country_name |
|-------------|--------------|
| AE | United Arab Emirates |
| BD | Bangladesh |
| BR | Brazil |
| DE | Germany |
| ES | Spain |
| FR | France |
| GB | United Kingdom |
| ID | Indonesia |
| IN | India |
| IT | Italy |
| MX | Mexico |
| MY | Malaysia |
| PH | Philippines |
| PK | Pakistan |
| SA | Saudi Arabia |
| US | United States |
| ZA | South Africa |

### Entity: PT (ProductType) — FromType: `PT0` -> ToType: `PT-S2`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| pt_code | STRING (PK) | Y | Ma product (= TO_Y_BLOCK_ToItem, vd: APB648) |
| pt_name | STRING | Y | Ten product |

**Du lieu thuc te (tu AllocationToItem, PT0 -> PT-S2, 39 items, 10 mau):**

| pt_code | Mo ta |
|---------|-------|
| AGS139 | App AGS139 |
| AGS151 | App AGS151 |
| AIP009 | App AIP009 |
| AIP016 | App AIP016 |
| APB648 | App APB648 |
| APB666 | App APB666 |
| APL169 | App APL169 |
| APL789 | App APL789 |
| ASI004 | App ASI004 |
| ... | (39 products tong cong) |

### Entity: TLT (TransLegalType) — ref: `fps_tlt`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | STRING (PK) | Y | Ma loai giao dich phap ly |
| name | STRING | Y | Ten loai |

**Du lieu (tu fps_tlt, 3 rows):**

| code | name |
|------|------|
| DOMESTIC | Giao dich noi dia |
| CROSS_BORDER | Giao dich xuyen bien gioi |
| INTERCOMPANY | Giao dich noi bo group |

### Entity: TUT (TransUrgencyType) — ref: `fps_tut`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | STRING (PK) | Y | Ma do khan cap |
| name | STRING | Y | Ten do khan cap |

**Du lieu (tu fps_tut, 2 rows):**

| code | name |
|------|------|
| NORMAL | Binh thuong |
| URGENT | Khan cap |

### Entity: TST_Size (TransSizeType) — ref: `fps_tst`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | STRING (PK) | Y | Ma quy mo (gia tri hop dong) |
| name | STRING | Y | Ten quy mo |

**Du lieu (tu fps_tst, 3 rows):**

| code | name |
|------|------|
| SMALL | Nho (< 50M VND) |
| MEDIUM | Trung binh (50M - 500M) |
| LARGE | Lon (> 500M) |

### Entity: TMT (TransMarketingType) — ref: `fps_tmt`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | STRING (PK) | Y | Ma loai marketing |
| name | STRING | Y | Ten loai |

**Du lieu (tu fps_tmt, 3 rows):**

| code | name |
|------|------|
| ORGANIC | Organic |
| PAID | Paid (quang cao tra phi) |
| PARTNERSHIP | Hop tac doi tac |

### Entity: KR (KeyResult) — ref: `fps_kr`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| kr_code | STRING (PK) | Y | Ma KR |
| kr_name | STRING | Y | Ten KR |

**Du lieu (tu fps_kr, 5 rows):**

| kr_code | kr_name |
|---------|---------|
| KR01 | Revenue Growth |
| KR02 | User Acquisition |
| KR03 | Product Quality |
| KR04 | Operational Efficiency |
| KR05 | Market Expansion |

### Entity: LE (LegalEntity) — ref: `fps_le`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| le_code | STRING (PK) | Y | Ma phap nhan |
| le_name | STRING | Y | Ten phap nhan |
| country | STRING | N | Quoc gia (FK -> CTY) |
| representative | STRING | N | Nguoi dai dien |

**Du lieu (tu fps_le, 9 rows, 4 mau):**

| le_code | le_name | country |
|---------|---------|---------|
| APERO-VN | Apero Tech JSC | VN |
| APERO-SG | Apero Tech Pte. Ltd. | SG |
| APERO-HK | Apero Tech HK Ltd. | HK |
| APERO-BVI | Apero Holdings BVI | BVI |

### Mapping Filter -> Quy trinh Legal

| Filter | CopyrightReview (LF210) | TrademarkCheck (LF220) | Policy (LF230) | Contract (LF240) |
|--------|------------------------|----------------------|----------------|-------------------|
| **CDT** (CDT1->CDT-S1) | - | - | - | Y (phong ban de xuat) |
| **CTY** (CTY-S2->CTY0) | **Y** (quoc gia Store publish) | **Y** (quoc gia bao ho TM) | Y (luat GDPR/CCPA) | **Y** (luat ap dung HD) |
| **PT** (PT0->PT-S2) | **Y** (app code can check) | **Y** (app code can check TM) | **Y** (app can soan PP/TOS) | Y (san pham lien quan) |
| **LE** (fps_le) | Y (publisher phap nhan) | Y (phap nhan dang ky TM) | **Y** (publisher trong PP) | **Y** (phap nhan ky HD) |
| **KR** (fps_kr) | - | - | - | Y (KR lien quan) |
| **TLT** (fps_tlt) | - | - | - | **Y** (loai giao dich HD) |
| **TUT** (fps_tut) | Y (do khan cap) | Y (do khan cap) | Y (do khan cap) | **Y** (do khan cap) |
| **TST_Size** (fps_tst) | - | - | - | **Y** (quy mo gia tri HD) |
| **TMT** (fps_tmt) | - | - | - | Y (loai marketing) |

---

## 1.3 Relationship Map (Workflow Entity ONLY)

```
TST ──(1:N myParentTask)──> TST          # Cay phan cap: L1 > L2 > L3
TST ──(1:N)──> TNT (from_tst_id)         # Mot TST co nhieu buoc tiep theo
TST <──(N:1)── TNT (to_tst_id)           # Mot TST co the la dich cua nhieu TNT
TST ──(N:N)──> TRT                        # Moi TST co nhieu role type, gan qua bang trung gian TST_TRT
TST ──(N:N)──> TDT                        # Moi TST can nhieu loai doc, gan qua bang trung gian TST_TDT
TST ──(1:N)──> TSI                        # Mot TST co nhieu TSI instances (1 type -> N instances)

TSI ──(1:N myParentTask)──> TSI           # Cay instance: TSI L1 > TSI L2 > TSI L3
TSI ──(N:N)──> TDI                        # Mot task co nhieu tai lieu
TSI ──(N:N)──> TRI                        # Mot task co nhieu nguoi duoc phan role
TSI ──(1:N)──> TSEV                       # Mot task co nhieu su kien
TSI ──(N:1)──> Each Filter                # Moi TSI mang GIA TRI FILTER cu the (LE, KR, CDT, PT, TLT, TUT, TMT, TST_Filter)

TDT ──(1:N)──> TDI                        # Mot loai doc co nhieu file instance
TDT ──(1:1)──> TDTP                       # Mot loai doc co toi da 1 template bieu mau (1:1)

TRT ──(N:N)──> EMP                        # Mot role co nhieu nguoi, 1 nguoi co nhieu role (qua TRI)
TRT ──(1:N)──> TRI                        # Mot role type co nhieu assignment

TSEV ──(N:1)──> EMP                       # Moi event do 1 nguoi thuc hien
TSEV ──(N:1)──> EMP                       # 2 FK: nguoi thuc hien + nguoi duoc assign
```

### Bang trung gian (Junction Tables)

#### TST_TRT (TaskType - RoleType mapping)

| Field | Type | Description |
|-------|------|-------------|
| tst_id | STRING (FK -> TST) | TaskType |
| trt_id | STRING (FK -> TRT) | RoleType |
| is_required | BOOLEAN | Role bat buoc cho TaskType nay? |

#### TST_TDT (TaskType - DocType mapping)

| Field | Type | Description |
|-------|------|-------------|
| tst_id | STRING (FK -> TST) | TaskType |
| tdt_id | STRING (FK -> TDT) | DocType |
| is_required | BOOLEAN | Doc bat buoc cho TaskType nay? |

#### TST_Filter (TaskType - Filter mapping) — Config layer

| Field | Type | Description |
|-------|------|-------------|
| tst_id | STRING (FK -> TST) | TaskType |
| filter_type | STRING | Loai filter: `TLT`, `TUT`, `TST_FILTER`, `TMT`, `KR`, `CDT`, `PT`, `LE`, `CTY` |
| filter_code | STRING | Ma gia tri filter |

> **Ghi chu**: TST_Filter dinh nghia **filter NAO ap dung** cho tung TaskType (Config). VD: `LF240-Hop dong` co bo loc `Payment` (TMT, TLT, TUT, TST_Filter) va `Budget` (KR, CDT, PT, LE).

#### TSI_Filter (TaskItem - Filter value) — Instance layer

| Field | Type | Description |
|-------|------|-------------|
| tsi_id | STRING (FK -> TSI) | TaskItem instance |
| filter_type | STRING | Loai filter: `TLT`, `TUT`, `TST_FILTER`, `TMT`, `KR`, `CDT`, `PT`, `LE`, `CTY` |
| filter_code | STRING | **Gia tri cu the** cua filter cho task nay |

> **Ghi chu quan trong**: TSI_Filter luu **GIA TRI THUC TE** cua filter cho tung task instance.
> - TST_Filter (Config): "Task LF240 **co the loc** theo KR, CDT, PT, LE" (kha nang)
> - TSI_Filter (Instance): "Task TSI-001 **thuc te** thuoc KR=KR01, LE=Apero-SG" (thuc te)
>
> Khi tao TSI moi, user chon gia tri filter -> luu vao TSI_Filter.
> Khi tim nguoi xu ly (TRI matching), dung TSI_Filter values de match voi TRT filter scope.

---

## 1.4 Entity Relationship Diagram (Text-based)

```
                        ┌──────────────┐
                        │   FILTERS    │
                        │ TLT,TUT,TST  │
                        │ TMT,KR,CDT   │
                        │ PT,LE,CTY    │
                        └──────┬───────┘
                               │
                  ┌────────────┼────────────┐
                  │            │            │
            (TST_Filter)  (TRT_Filter) (TSI_Filter)
            Config: filter  Config: filter Instance: filter
            NAO ap dung     scope role     GIA TRI cu the
                  │            │            │
    ┌───────┐  myParentTask   ┌▼──────┐    │  myParentTask  ┌───────┐
    │TST L1 │◄────────────────│TST L2 │    │ ◄──────────────│TST L3 │
    └───┬───┘                 └───┬───┘    │                └───────┘
        │                         │        │
        │(N:N)  ┌─────┐          │(1:N)  ┌─────┐
        ├──────►│ TRT │          ├──────►│ TNT │
        │       └──┬──┘          │       └─────┘
        │          │(N:N qua TRI)│
        │          ▼             │(N:N)  ┌─────┐
        │       ┌─────┐         └──────►│ TDT │
        │       │ EMP │                  └──┬──┘
        │       └──┬──┘                     │(1:N)
        │          │                        ▼
        │          │                  ┌─────────┐
        ▼(1:N)     │                  │  TDI    │
    ┌───────┐      │(N:1)            └─────────┘
    │  TSI  │◄─────┤
    │(Item) │      │(N:1)
    └───┬───┘──────┼──────── (N:1 qua TSI_Filter) ──> FILTERS
        │          │
        │(1:N)     │
        ▼          │
    ┌───────┐      │
    │ TSEV  │──────┘
    │(Event)│
    └───────┘
```

> **Phan biet 3 loai Filter relationship:**
> | Layer | Junction Table | Y nghia | Vi du |
> |-------|---------------|---------|-------|
> | Config | TST_Filter | TaskType **co the loc** theo filter nao | LF240 co the loc theo KR, CDT, PT, LE |
> | Config | TRT_Filter (trong TST_TRT) | Role **ap dung** cho pham vi filter nao | LEGAL_APPROVER ap dung cho LE=VN |
> | Instance | **TSI_Filter** | Task instance **thuc te** co gia tri filter nao | TSI-001 thuoc KR=KR01, LE=Apero-SG |

---

# 2. ProcessDescription

## 2.1 Tong quan cac quy trinh Legal

| Process ID | Ten quy trinh | TST Level 1 | So Steps | SLA |
|------------|---------------|-------------|----------|-----|
| LF210 | Copyright Check (Ra soat ban quyen UI/UX) | Copyright | 5 sub-steps | T+2 |
| LF220 | Trademark Check (Ra soat nhan hieu) | Trademark | 7 sub-steps | T+1 |
| LF230 | Policy (Soan PP & TOS) | Policy | 5 sub-steps | T+2 |
| LF240 | Contract Review (Soat xet hop dong) | Contract | 7 steps | T+2 per round |

---

## 2.2 Process: LF210 - Copyright Check

### TST Tree (Cay phan cap TaskType)

```
LF210-Copyright (L1)
├── LF211-Input tai lieu UI/UX (L2, PIC: Product/ASO)
│   └── Chuan bi ban so sanh UI/UX (L3)
├── LF212-Ra soat UI/UX (L2, PIC: Legal, SLA: T+2)
│   ├── LF212.1-Doi chieu man hinh (L3)
│   ├── LF212.2-Kiem tra Asset (L3)
│   ├── LF212.3-Kiem tra anh AI (L3)
│   ├── LF212.4-Doi chieu chinh sach Store (L3)
│   └── LF212.5-Tong hop & phan hoi (L3)
```

### TNT (Task Next Type) - Luong chuyen tiep

| From TST | To TST | Condition |
|----------|--------|-----------|
| LF211 | LF212 | Khi Product/ASO da gui du file so sanh |
| LF212.1 | LF212.2 | Auto (song song voi LF212.1) |
| LF212.2 | LF212.3 | Auto |
| LF212.3 | LF212.4 | Auto |
| LF212.4 | LF212.5 | Auto |
| LF212.5 | (END) | Ket qua: PASS / CAN SUA / FAIL |

### TRT (Roles)

| Role | TST ap dung | PIC |
|------|-------------|-----|
| SUBMITTOR | LF211 | Product/ASO |
| LEGAL_APPROVER | LF212, LF212.1-5 | Legal Team |

### TDT (Document Types)

| Doc Type | TST ap dung | Bat buoc | TDTP | Mo ta bieu mau |
|----------|-------------|----------|-------------|----------------|
| UI_COMPARISON_FILE | LF211 | Y | **LF211-Copyright-Mau_so_sanh_UIU.md** | Bang so sanh tung man hinh app Apero vs doi thu (screenshot + mo ta giong/khac). Product/ASO tao. |
| ASSET_LIST | LF212.2 | Y | *(trong LF211)* | Danh sach asset (hinh anh, am thanh, nhac nen) + nguon goc (tu SX / Free / Paid / Khong ro). |
| AI_IMAGE_FILE | LF212.3 | N | - | File anh AI-generated can kiem tra (Google Reverse Image, TinEye). |
| COPYRIGHT_REPORT | LF212.5 | Y | **LF213-Copyright-Bao_cao_ket_qua.md** | Bao cao tong hop: Muc danh gia (Pass/Can sua/Fail) + ly do phap ly + de xuat thay the. Legal tao. |

---

## 2.3 Process: LF220 - Trademark Check

### TST Tree

```
LF220-Trademark (L1)
├── LF221-Input Trademark details (L2, PIC: Product/ASO)
│   └── Gui ten app, icon, store graphic, description, keywords (L3)
├── LF222-Ra soat Trademark (L2, PIC: Legal, SLA: T+1)
│   ├── LF222.1-Tra cuu WIPO (L3)
│   ├── LF222.2-Tra cuu USPTO (L3)
│   ├── LF222.3-Tra cuu Cuc SHTT Viet Nam (L3)
│   ├── LF222.4-Tra cuu Google Search (L3)
│   ├── LF222.5-Tra cuu WIPO Image (icon) (L3)
│   ├── LF222.6-Tra cuu Google Reverse Image (icon) (L3)
│   └── LF222.7-Tong hop & phan hoi Product (L3)
```

### TNT (Task Next Type)

| From TST | To TST | Condition |
|----------|--------|-----------|
| LF221 | LF222 | Khi du thong tin tu Product/ASO |
| LF222.1 | LF222.2 | Parallel: LF222.1-6 chay song song |
| LF222.2 | LF222.3 | Parallel |
| LF222.3 | LF222.4 | Parallel |
| LF222.4 | LF222.5 | Parallel |
| LF222.5 | LF222.6 | Parallel |
| LF222.1-6 (all) | LF222.7 | Khi tat ca sub-steps hoan thanh (JOIN) |
| LF222.7 | (END) | Ket qua: PASS / CAN SUA / FAIL |

### TRT (Roles)

| Role | TST ap dung | PIC |
|------|-------------|-----|
| SUBMITTOR | LF221 | Product/ASO |
| LEGAL_APPROVER | LF222, LF222.1-7 | Legal Team |

### TDT (Document Types)

| Doc Type | TST ap dung | Bat buoc | TDTP | Mo ta bieu mau |
|----------|-------------|----------|-------------|----------------|
| APP_INFO | LF221 | Y | - | Ten app, icon, store graphic, description, keywords. Product/ASO gui. |
| TRADEMARK_SEARCH_RESULT | LF222.1-6 | Y | - | Ket qua tra cuu tu WIPO, USPTO, Cuc SHTT VN, Google Search, WIPO Image, Google Reverse Image. |
| TRADEMARK_REPORT | LF222.7 | Y | **LF222-Bao_cao_gui_Product.md** | Bao cao tong hop TM: App Name check (Pass/Fail + uu tien) + App Icon check. Legal tao, gui Product. |

---

## 2.4 Process: LF230 - Policy (PP & TOS)

### TST Tree

```
LF230-Policy (L1)
├── LF231-Input Forms (L2, PIC: Product & Dev)
│   └── Dien form data & permission (L3)
├── LF232-Soan PP & TOS (L2, PIC: Legal, SLA: T+2)
│   ├── LF232.1-Ra soat Form (L3)
│   ├── LF232.2-Doi chieu phap ly (L3)
│   ├── LF232.3-Soan Privacy Policy (L3)
│   ├── LF232.4-Soan Term of Service (L3)
│   └── LF232.5-Gui draft Product (L3)
├── LF233-Nghiem thu PP & TOS (L2, PIC: Product, SLA: T+3)
├── LF234-Dang len Store (L2, PIC: ASO, SLA: T+3)
```

### TNT (Task Next Type)

| From TST | To TST | Condition |
|----------|--------|-----------|
| LF231 | LF232 | Khi form du thong tin |
| LF232.1 | LF232.2 | Form hop le |
| LF232.1 | LF231 | Form thieu thong tin -> quay lai bo sung |
| LF232.2 | LF232.3 | Auto |
| LF232.3 | LF232.4 | Parallel (song song) |
| LF232.3+4 | LF232.5 | Khi ca PP va TOS hoan thanh |
| LF232.5 | LF233 | Auto |
| LF233 | LF234 | Product duyet OK |
| LF233 | LF232 | Product yeu cau chinh sua -> quay lai |
| LF234 | (END) | PP & TOS da live tren store |

### Template phan loai

| Template | Ap dung cho | TDTP |
|----------|-------------|-------------|
| PP suc khoe | App suc khoe (disclaimer, bao mat du lieu nhan cam) | **LF233-Template_PP_&TOS.md** (PP Suc khoe) |
| PP dating | App dating (user content, disclaimer, gioi han do tuoi) | **LF233-Template_PP_&TOS.md** (PP Dating) |
| PP chung | Cac san pham con lai | **LF233-Template_PP_&TOS.md** (PP Chung) |
| TOS suc khoe | App suc khoe | **LF233-Template_PP_&TOS.md** (TOS Suc khoe) |
| TOS chung | Cac san pham con lai | **LF233-Template_PP_&TOS.md** (TOS Chung) |

### TDT (Document Types)

| Doc Type | TST ap dung | Bat buoc | TDTP | Mo ta bieu mau |
|----------|-------------|----------|-------------|----------------|
| PERMISSION_FORM | LF231.1 | Y | **LF231-Policy-Form_Data_&Permis.md** | Form liet ke toan bo permission (quyen) va data (du lieu) app thu thap. Product+Dev dien. |
| PP_DRAFT | LF232.3 | Y | **LF233-Template_PP_&TOS.md** | Privacy Policy draft soan theo template. Legal tao. |
| TOS_DRAFT | LF232.4 | Y | **LF233-Template_PP_&TOS.md** | Term of Service draft. Legal tao. |
| PP_TOS_FINAL | LF233.1 | Y | - | PP & TOS ban cuoi da duoc Product nghiem thu. |

### Tai lieu tham khao

| Tai lieu | Mo ta | TDTP File |
|----------|-------|---------|
| Training PP & TOS | Slide dao tao 34 trang: dinh nghia PP/TOS, loi pho bien, quy trinh 5 buoc Apero | **LF230_B7_Privacy_Policy_&_Terms_of_Service.md** |

---

## 2.5 Process: LF240 - Contract Review (Hop dong doi tac)

### TST Tree

```
LF240-Hop dong (L1)
├── LF241-Gui yeu cau soat xet HD (L2, PIC: Bo phan de xuat)
├── LF242-Xac nhan dau vao (L2, PIC: Legal)
├── LF243-Ra soat chi tiet hop dong (L2, PIC: Legal, SLA: T+2)
│   ├── LF243.1-Ra soat hop le (L3)
│   │   └── LF243.1.1-Xac minh phap nhan/ca nhan (L3)
│   ├── LF243.2-Ke toan ra soat thanh toan (L3, PIC: Ke toan)
│   ├── LF243.3-Gui feedback tong hop (L3)
│   └── LF243.4-Hieu chinh HD (L3, SLA: max 3 ngay/vong)
├── LF244-Final Check (L2, PIC: Legal)
├── LF245-Trinh ky phe duyet (L2)
│   └── Day chuyen: Bo phan de xuat -> Legal -> Ke toan -> Tro ly GD -> BOD -> CEO -> Hanh chinh
├── LF246-Luu tru & ma hoa HD (L2, PIC: Legal + Hanh chinh)
├── LF247-Theo doi & nhac gia han (L2, PIC: Legal, Dinh ky hang thang)
```

### TNT (Task Next Type)

| From TST | To TST | Condition |
|----------|--------|-----------|
| LF241 | LF242 | Khi form duoc gui |
| LF242 | LF243 | Du thong tin |
| LF242 | LF241 | Thieu thong tin -> yeu cau bo sung |
| LF243.1 | LF243.2 | Song song: Legal + Ke toan ra soat cung luc |
| LF243.1+2 | LF243.3 | Khi ca 2 hoan thanh |
| LF243.3 | LF243.4 | Co diem can chinh sua |
| LF243.3 | LF244 | Khong can chinh sua |
| LF243.4 | LF243.3 | Vong dam phan tiep theo (max 3 vong) |
| LF243.4 | LF244 | Thong nhat xong |
| LF243.4 | ESCALATE_BOD | Qua 3 vong -> escalate len BOD |
| LF244 | LF245 | Final check OK |
| LF245 | LF246 | Ky xong |
| LF246 | LF247 | HD dang hieu luc |
| LF247 | (END) hoac | HD het han / cham dut |
| LF247 | LF240 (new) | Gia han -> tao task moi |

### TRT (Roles) - Day chuyen phe duyet LF245

| Role | Order | PIC |
|------|-------|-----|
| SUBMITTOR | 1 | Bo phan de xuat (khoi tao) |
| LEGAL_APPROVER | 2 | Legal Review (xac nhan phap ly) |
| FINANCE_APPROVER | 3 | Ke toan Duyet (xac nhan tai chinh) |
| TEAM_APPROVER | 4 | Tro ly Giam doc (dieu phoi) |
| TEAM_APPROVER | 5 | BOD Group (phe duyet chu truong) |
| TEAM_APPROVER | 6 | CEO Venture (ky duyet) |
| TEAM_APPROVER | 7 | Hanh chinh (chu ky + dong dau) |

### TDT (Document Types)

| Doc Type | TST ap dung | Bat buoc |
|----------|-------------|----------|
| CONTRACT_REVIEW_FORM | LF241 | Y |
| CONTRACT_DRAFT | LF241, LF243 | Y |
| LEGAL_FEEDBACK | LF243.3 | Y |
| FINANCE_FEEDBACK | LF243.2 | Y |
| CONTRACT_FINAL | LF244 | Y |
| SIGNED_CONTRACT | LF245 | Y |

### Ma hoa hop dong (LF246)

Format: `ddmmyy/Ten viet tat - Cty - Doi tac`
VD: `230326/OMC-Apero-TikTok`

---

# 3. UIWireFrame

## 3.1 Tong quan Layout

```
┌──────────────────────────────────────────────────────────┐
│  HEADER: Logo | Legal Workflow | User Info | Notification│
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  SIDEBAR │              MAIN CONTENT AREA                │
│          │                                               │
│ Dashboard│  ┌──────────────────────────────────────────┐ │
│ Tasks    │  │                                          │ │
│ Config   │  │                                          │ │
│ Reports  │  │                                          │ │
│          │  │                                          │ │
│          │  └──────────────────────────────────────────┘ │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
│  FOOTER: Version | Help | Contact                        │
└──────────────────────────────────────────────────────────┘
```

## 3.2 Sidebar Navigation

```
┌─────────────────┐
│  LEGAL WORKFLOW  │
├─────────────────┤
│ > Dashboard      │
│ > My Tasks       │
│   - Pending      │
│   - In Progress  │
│   - Completed    │
│ > Create Task    │
│   - Copyright    │
│   - Trademark    │
│   - Policy       │
│   - Contract     │
│ > Config         │
│   - Task Types   │
│   - Roles        │
│   - Doc Types    │
│   - Filters      │
│   - Next Steps   │
│ > Reports        │
│   - Task Summary │
│   - SLA Report   │
│   - Workload     │
└─────────────────┘
```

## 3.3 WF01 - Dashboard (Trang chu)

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard                                                │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Pending  │ │In Progr.│ │Completed│ │ Overdue │       │
│  │   12     │ │    8    │ │   45    │ │    3    │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐      │
│  │  My Tasks (EMP->TRI) │  │  Notifications       │      │
│  │ ┌──────────────────┐ │  │ ┌──────────────────┐ │      │
│  │ │ TSI-001 Copyright │ │  │ │ Task X overdue   │ │      │
│  │ │ Status: Review    │ │  │ │ Task Y approved  │ │      │
│  │ │ Due: 2026-03-25   │ │  │ │ New task assign  │ │      │
│  │ └──────────────────┘ │  │ └──────────────────┘ │      │
│  │ ┌──────────────────┐ │  │                      │      │
│  │ │ TSI-002 Trademark│ │  └──────────────────────┘      │
│  │ │ Status: InProg   │ │                                 │
│  │ │ Due: 2026-03-26  │ │                                 │
│  │ └──────────────────┘ │                                 │
│  └──────────────────────┘                                 │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │ SLA Performance Chart (Bar chart by task type)    │    │
│  │ [Copyright] ████████░░ 80%                        │    │
│  │ [Trademark] ██████████ 100%                       │    │
│  │ [Policy]    ███████░░░ 70%                        │    │
│  │ [Contract]  █████████░ 90%                        │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

## 3.4 WF02 - Task List (Pending Tasks cua toi)

```
┌──────────────────────────────────────────────────────────┐
│  Pending Tasks                        [+ Create Task]     │
├──────────────────────────────────────────────────────────┤
│  Filters: [TST L1 v] [Status v] [Priority v] [Date ▼]   │
│  Sort: [FirstTaskCreatedAt v] [StepCreatedAt v]          │
│                                                           │
│  ┌────┬───────────┬──────────┬────────┬───────┬────────┐│
│  │ #  │ Task Code │ Submitted│ Type   │ Status│ Due  │Act ││
│  ├────┼───────────┼──────────┼────────┼───────┼────────┤│
│  │ 1  │ TSI-001   │Copyright │Review  │03/25  │ [View] ││
│  │ 2  │ TSI-002   │Trademark │InProg  │03/26  │ [View] ││
│  │ 3  │ TSI-003   │Contract  │Pending │03/28  │ [View] ││
│  │ 4  │ TSI-004   │Policy    │Draft   │03/30  │ [Edit] ││
│  └────┴───────────┴──────────┴────────┴───────┴────────┘│
│                                                           │
│  Pagination: [< 1 2 3 ... 10 >]                          │
└──────────────────────────────────────────────────────────┘
```

**Logic hien thi Pending Tasks** (theo diagram section 3.1):
- Tim EMP -> TRI (N) de lay tat ca role cua user hien tai
- Tim TRI -> TSI -> TST L3 de lay step hien tai
- Nho TST L3 -> TST L2 -> TST L1 de lay thong tin loai task
- Sort theo: TST L1, L2, Filters, FirstTaskCreatedAt, StepCreatedAt

## 3.5 WF03 - Task Detail View (v6 - Inline Review)

```
┌──────────────────────────────────────────────────────────┐
│  [<- Back to Tasks]                                       │
│  Task: aaaaaa                              [IN_PROGRESS]  │
│  TSI-20260325-001                                         │
│  Priority: MEDIUM | Due: - | Assigned: - | Created: ...   │
│  Tags: [PT: aaaa] [TUT: aa]                               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─ Progress Tree (v6: inline review table) ───────────┐│
│  │ ✅ Copyright Check              [COMPLETED]           ││
│  │ │                                                     ││
│  │ │ ✅ Input tai lieu UI/UX       [COMPLETED]           ││
│  │ │   ┌────┬───────────────────┬──────────┬─────────┐  ││
│  │ │   │ #  │ Step              │ Status   │ Comment │  ││
│  │ │   ├────┼───────────────────┼──────────┼─────────┤  ││
│  │ │   │ 1  │ ✅ Chuan bi ban.. │ APPROVED │ -       │  ││
│  │ │   └────┴───────────────────┴──────────┴─────────┘  ││
│  │ │                                                     ││
│  │ │ 🔵 Ra soat UI/UX            [IN_PROGRESS]          ││
│  │ │   ┌────┬───────────────────┬──────────┬─────┬────┐ ││
│  │ │   │ #  │ Step              │ Status   │Cmnt │Act │ ││
│  │ │   ├────┼───────────────────┼──────────┼─────┼────┤ ││
│  │ │   │ 1  │ ✅ Doi chieu..    │ APPROVED │ -   │ -  │ ││
│  │ │   │ 2  │ ✅ Kiem tra Asset │ APPROVED │ -   │ -  │ ││
│  │ │   │ 3  │ ⚪ Kiem tra AI    │ [v Sel]  │[___]│Save│ ││
│  │ │   │ 4  │ ⚪ Doi chieu..    │ PENDING  │ -   │ -  │ ││
│  │ │   │ 5  │ ⚪ Tong hop       │ PENDING  │ -   │ -  │ ││
│  │ │   └────┴───────────────────┴──────────┴─────┴────┘ ││
│  │                                                       ││
│  │ Admin: Status dropdown (Approved/Reject) + Comment    ││
│  │ User:  Read-only status badges                        ││
│  └──────────────────────────────────────────────────────┘│
│                                                           │
│  ┌─ Documents (TDI - aggregated from L1+L2+L3) ───────┐│
│  │ ┌────────────────┬────┬──────────┬──────────┬──────┐ ││
│  │ │ File Name      │Ver │Upload By │Upload At │Action│ ││
│  │ ├────────────────┼────┼──────────┼──────────┼──────┤ ││
│  │ │ copyright.pptx │ 1  │ MinhPT   │ 03/25..  │ View │ ││
│  │ └────────────────┴────┴──────────┴──────────┴──────┘ ││
│  └──────────────────────────────────────────────────────┘│
│                                                           │
│  ┌─ Event Log (TSEV - aggregated from L1+L2+L3) ──────┐│
│  │ 2026-03-25 12:19  CREATE   MinhPT                    ││
│  │ 2026-03-25 12:19  UPLOAD   MinhPT                    ││
│  │ 2026-03-25 12:20  APPROVE  EMP-004                   ││
│  │ 2026-03-25 12:21  REJECT   EMP-001 (reason: ...)     ││
│  └──────────────────────────────────────────────────────┘│
│                                                           │
│  ┌─ Actions (role-based) ─────────────────────────────┐ │
│  │ Admin: inline approve/reject trong Progress Tree     │ │
│  │ User:  [Upload Document] [AI Check] [Submit to Review] │ │
│  │        + [Upload Document]                           │ │
│  │        AI Check: GPT-4o-mini doc noi dung file thuc  │ │
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

**v6 thay doi so voi v5:**
- Progress Tree hien L3 steps dang **bang (table)** voi cot Status (dropdown) + Comment (input) + Action (Save)
- Admin inline approve/reject tung buoc ngay trong bang, khong can chuyen trang
- Documents va Events **gom tu toan bo cay TSI** (L1+L2+L3)
- Documents co link **View** (mo URL tren tab moi)
- User chi co 2 nut: Upload Document + Submit
- My Tasks **gom theo L1 root**, hien thi trang thai L3 cuoi cung

## 3.6 WF04 - Config TaskType (Giao dien TaskConfig)

> Giao dien giong TaskConfig (p10) nhu mo ta trong diagram

```
┌──────────────────────────────────────────────────────────┐
│  Config: Task Types                    [+ Add TaskType]   │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─ TST Tree (Left Panel) ─┐  ┌─ Detail (Right Panel) ─┐│
│  │                          │  │                         ││
│  │ v LF210-Copyright        │  │ Selected: LF212.1      ││
│  │   v LF211-Input          │  │                         ││
│  │   v LF212-Ra soat        │  │ Code: LF212.1          ││
│  │     > LF212.1-Doi chieu  │  │ Name: Doi chieu screen ││
│  │     > LF212.2-Asset      │  │ Level: 3               ││
│  │     > LF212.3-AI         │  │ Parent: LF212          ││
│  │     > LF212.4-Store      │  │ SLA: 1 day             ││
│  │     > LF212.5-Tong hop   │  │                         ││
│  │ v LF220-Trademark        │  │ Roles: [Edit]          ││
│  │   > LF221-Input          │  │ - LEGAL_APPROVER       ││
│  │   > LF222-Ra soat        │  │                         ││
│  │ v LF230-Policy           │  │ Docs: [Edit]           ││
│  │   > ...                   │  │ - UI_COMPARISON (Req)  ││
│  │ v LF240-Contract          │  │                         ││
│  │   > ...                   │  │ Filters: [Edit]        ││
│  │                          │  │ - Payment: [v]          ││
│  │                          │  │ - Budget: [ ]           ││
│  └──────────────────────────┘  │ - Legal 1: [ ]          ││
│                                │ - Legal 2: [ ]          ││
│                                │                         ││
│                                │ Next Steps: [Edit]      ││
│                                │ - -> LF212.2 (auto)     ││
│                                └─────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

## 3.7 WF05 - Config Next Steps (TNT voi dieu kien)

```
┌──────────────────────────────────────────────────────────┐
│  Config: Task Next Steps for [LF243.4-Hieu chinh HD]     │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  From: LF243.4-Hieu chinh HD                              │
│                                                           │
│  ┌─────┬──────────────┬─────────────────────┬──────────┐│
│  │ #   │ To TST       │ Condition           │ Priority ││
│  ├─────┼──────────────┼─────────────────────┼──────────┤│
│  │ 1   │ LF243.3      │ round_count < 3     │ 1        ││
│  │ 2   │ LF244        │ all_agreed = true    │ 2        ││
│  │ 3   │ ESCALATE_BOD │ round_count >= 3     │ 3        ││
│  └─────┴──────────────┴─────────────────────┴──────────┘│
│                                                           │
│  [+ Add Next Step]                                        │
│                                                           │
│  ┌─ Visual Flow ────────────────────────────────────────┐│
│  │                                                       ││
│  │  [LF243.4] ──(round<3)──> [LF243.3]                  ││
│  │      │                                                ││
│  │      ├──(agreed)──> [LF244-Final Check]               ││
│  │      │                                                ││
│  │      └──(round>=3)──> [ESCALATE BOD]                  ││
│  │                                                       ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

# 4. UserFlows

## 4.1 UserFlow 1: Config Workflow Tasks

### 1.1 Loai Task: Tao cac TST level 1

```
Actor: Admin/Legal Manager
Precondition: Dang nhap thanh cong

1. Vao Config > Task Types
2. Click [+ Add TaskType]
3. Nhap: Code (vd: LF210), Name, Description
4. Chon Level = 1
5. Chon Filters ap dung (Payment, Budget, Legal 1, Legal 2)
6. Save -> TST moi duoc tao
```

### 1.2 Phase: Tao cac TST level 2

```
1. Chon TST Level 1 (vd: LF210-Copyright)
2. Click [+ Add Child]
3. Nhap: Code (vd: LF211), Name, SLA
4. Level = 2 (tu dong, la con cua L1)
5. myParentTask = L1 TST ID (tu dong)
6. Save
```

### 1.3 Step: Tao cac TST level 3

```
1. Chon TST Level 2 (vd: LF212)
2. Click [+ Add Child]
3. Nhap: Code (vd: LF212.1), Name
4. Level = 3 (tu dong)
5. myParentTask = L2 TST ID (tu dong)
6. Save
```

### 1.4 Task Next Steps: Tao TNT

```
1. Chon TST bat ky
2. Tab "Next Steps"
3. Click [+ Add Next Step]
4. Chon To TST (buoc tiep theo)
5. Nhap Condition (neu co): JSON logic hoac dropdown
6. Nhap Priority
7. Save -> TNT moi duoc tao
```

### 1.5 Roles of a Task

#### 1.5.1 Tao TRT

```
1. Vao Config > Roles
2. Click [+ Add Role]
3. Nhap: Code (SUBMITTOR/TEAM_APPROVER/FINANCE_APPROVER/LEGAL_APPROVER)
4. Nhap: Name, Description
5. Save
```

#### 1.5.2 Gan Filter cho TRT

```
1. Chon TRT
2. Tab "Filters"
3. Chon bo loc (vd: KR, CDT, LE)
4. Save -> TRT co pham vi ap dung
```

#### 1.5.3 Phan cong nhan su: EMP-TRT

```
1. Chon TRT
2. Tab "Members"
3. Click [+ Add Member]
4. Chon Employee (EMP)
5. Save -> TRI moi duoc tao
```

### 1.6 Docs of a Task

#### 1.6.1 Tao TDT

```
1. Vao Config > Doc Types
2. Click [+ Add Doc Type]
3. Nhap: Code, Name, File extensions, Max size
4. Save
```

#### 1.6.2 Gan nhanh TDT cho TST

```
1. Chon TST
2. Tab "Documents"
3. Click [+ Add Doc Type]
4. Chon TDT, danh dau Required
5. Save -> TST_TDT mapping duoc tao
```

---

## 4.2 UserFlow 2: Workflow Van Hanh

> **Nguyen tac**: Moi luot thuc hien 1 quy trinh = **1 dong TSI L1**.
> VD: CopyrightReview cho App A = TSI L1 #001, CopyrightReview cho App B = TSI L1 #002.
> TSI L2, TSI L3 duoc **he thong tu dong tao** khi workflow chay, user KHONG tao truc tiep.

### Vi du cu the: CopyrightReview cho "Caller ID App"

```
TSI L1 #001: "CopyrightReview - Caller ID App"         (tst_id -> LF210-Copyright)
│
├── TSI L2 #001-01: "Input tai lieu UI/UX"              (tst_id -> LF211, myParentTask -> #001)
│   └── TSI L3 #001-01-01: "Chuan bi ban so sanh"      (tst_id -> LF211.step, myParentTask -> #001-01)
│
├── TSI L2 #001-02: "Ra soat UI/UX"                     (tst_id -> LF212, myParentTask -> #001)
│   ├── TSI L3 #001-02-01: "Doi chieu man hinh"        (tst_id -> LF212.1, myParentTask -> #001-02)
│   ├── TSI L3 #001-02-02: "Kiem tra Asset"             (tst_id -> LF212.2, myParentTask -> #001-02)
│   ├── TSI L3 #001-02-03: "Kiem tra anh AI"            (tst_id -> LF212.3, myParentTask -> #001-02)
│   ├── TSI L3 #001-02-04: "Doi chieu chinh sach Store" (tst_id -> LF212.4, myParentTask -> #001-02)
│   └── TSI L3 #001-02-05: "Tong hop & phan hoi"        (tst_id -> LF212.5, myParentTask -> #001-02)
```

> **Luu y**: TSI L2, L3 KHONG tao het cung luc. He thong chi tao TSI tiep theo khi buoc truoc hoan thanh (hoac theo parallel logic).

---

### 2.1 Tao task moi: tao TSI L1, chon TST L1

> Diagram ref: *"2.1 Tao hop dong moi: tao TSI L1, chon TST L1"*

```
Actor: Submittor (Product/ASO, Bo phan de xuat, ...)
Precondition: TST da duoc config day du

1. Click [+ Create Task]
2. Chon TST L1 (vd: LF210-Copyright, LF220-Trademark, LF240-Contract...)
3. Nhap: Title (vd: "CopyrightReview - Caller ID App")
4. Nhap: Priority, Due Date
5. Chon Filter values (TSI_Filter):
   - vd: PT = "Mobile App", LE = "Apero-SG", KR = "KR01"
6. Submit
7. He thong:
   a. Tao 1 dong TSI L1 (status: IN_PROGRESS)
   b. Luu filter values vao TSI_Filter
   c. Tao TSEV (event_type: CREATE, emp_id: requester)
   d. Tu dong chay buoc 2.2 (tim task dau tien)
```

### 2.2 Tim task dau tien cua TSI L1: TSI L1 -> TST L1 -> TST L2 dau tien -> TST L3 dau tien -> tao TSI L3, L2

> Diagram ref: *"2.2 Tim task dau tien cua TSI L1: TSI L1 -> TST L1 -> TST L2 dau tien -> TST L3 dau tien -> tao TSI L3, L2"*

```
He thong tu dong (ngay sau khi TSI L1 duoc tao):

         TSI L1 (#001)
            │
            ▼ (lay type)
         TST L1 (LF210-Copyright)
            │
            ▼ (tim con dau tien qua myParentTask, sort priority)
         TST L2 dau tien (LF211-Input tai lieu)
            │
            ▼ (tim con dau tien)
         TST L3 dau tien (LF211.step)
            │
            ▼ (tao instance)
         Tao TSI L3 (#001-01-01) va TSI L2 (#001-01)
              myParentTask: TSI L3 -> TSI L2 -> TSI L1

Chi tiet:
1. Tu TSI L1, lay TST L1 (LF210)
2. Tim TST L2 dau tien: TST.filter(myParentTask = TST_L1, level=2).orderBy(priority).first()
   -> Ket qua: LF211
3. Tim TST L3 dau tien: TST.filter(myParentTask = TST_L2, level=3).orderBy(priority).first()
   -> Ket qua: LF211.step
4. Tao TSI L2 (myParentTask = TSI_L1.id, tst_id = LF211, status = IN_PROGRESS)
5. Tao TSI L3 (myParentTask = TSI_L2.id, tst_id = LF211.step, status = PENDING)
6. Copy TSI_Filter tu TSI L1 xuong TSI L3 (ke thua filter values)
7. Chuyen sang buoc 2.3 (tim nguoi xu ly cho TSI L3)
```

### 2.3 Tim nguoi tiep theo xu ly TSI L3: TSI L3 -> TST L3 -> TRT (N); TSI L3 -> myFilters; TRT (N) & myFilters -> TRT -> EMP

> Diagram ref: *"2.3 Tim nguoi tiep theo xu ly TSI L3: TSI L3 -> TST L3 -> TRT (N); TSI L3 -> myFilters; TRT (N) & myFilters -> TRT -> EMP"*

```
He thong (khi TSI L3 duoc tao):

   Nhanh 1:                         Nhanh 2:
   TSI L3 (#001-01-01)              TSI L3 (#001-01-01)
      │                                │
      ▼ (lay type)                     ▼ (lay filter values)
   TST L3 (LF211.step)              TSI_Filter:
      │                              - PT = "Mobile App"
      ▼ (lay roles)                  - LE = "Apero-SG"
   TRT (N):                          - KR = "KR01"
   - SUBMITTOR
   - LEGAL_APPROVER
      │                                │
      └────────── MATCH ───────────────┘
                    │
                    ▼ (tim TRT co filter scope phu hop)
                 TRT: SUBMITTOR (scope: LE=Apero-SG)
                    │
                    ▼ (tim EMP trong role nay)
                 TRI -> EMP: "MinhPT - Pham Thanh Minh" (Product)
                    │
                    ▼
                 Assign vao TSI L3, gui notification

Chi tiet:
1. Tu TSI L3 -> lay TST L3 -> lay tat ca TRT (N) qua TST_TRT
2. Tu TSI L3 -> lay myFilters (TSI_Filter: PT, LE, KR, CDT...)
3. Voi moi TRT:
   a. Lay filter scope cua TRT (vd: LEGAL_APPROVER chi cho LE=VN)
   b. So sanh voi TSI_Filter values
   c. Neu match -> tim EMP qua TRI
4. Assign EMP vao TSI L3 (assigned_to = emp_id)
5. Gui notification cho EMP
```

### 2.4 Nguoi xu ly upload cac Doc: TSI -> TST -> TDT (N) -> TDI (N)

> Diagram ref: *"2.4 Nguoi xu ly upload cac Doc: TSI -> TST -> TDT (N) -> TDI (N)"*

```
Actor: EMP (nguoi xu ly da duoc assign)

1. Mo Task Detail (TSI L3 hien tai)
2. He thong hien thi danh sach TDT can thiet:
   TSI L3 -> TST L3 -> TST_TDT -> TDT (N)
   vd: [UI_COMPARISON_FILE (Required), ASSET_LIST (Required)]
3. Click [+ Upload Document]
4. Chon loai doc (TDT)
5. Upload file
6. He thong:
   a. Tao TDI moi (tdt_id, tsi_id, file_url, version=1)
   b. Luu file len storage (Google Drive / Cloud Storage)
   c. Tao TSEV (event_type: UPLOAD, emp_id, tdi_id)
```

### 2.5 Nguoi xu ly thuc hien thao tac xu ly: EMP, TSI -> tao TSEV (Create, View, Update, Comment, Approve, Reject...)

> Diagram ref: *"2.5 Nguoi xu ly thuc hien thao tac xu ly: EMP, TSI -> tao TSEV"*

```
Actor: EMP (nguoi xu ly)

1. Mo Task Detail (TSI L3 hien tai)
2. Chon action:
   - [View]    -> TSEV.event_type = VIEW
   - [Update]  -> TSEV.event_type = UPDATE (cap nhat noi dung task)
   - [Comment] -> TSEV.event_type = COMMENT (them ghi chu)
   - [Approve] -> TSEV.event_type = APPROVE (duyet buoc nay)
   - [Reject]  -> TSEV.event_type = REJECT (tu choi, ghi ly do)
3. Nhap noi dung (event_data JSON: comment text, ly do reject, ...)
4. Submit
5. He thong:
   a. Tao TSEV moi (tsi_id, event_type, emp_id, event_data, created_at)
   b. Neu APPROVE:
      - Cap nhat TSI L3 status = COMPLETED
      - Tu dong chay buoc 2.6 (tim task tiep theo)
   c. Neu REJECT:
      - Cap nhat TSI L3 status = REJECTED
      - Gui notification cho Submittor
      - (Tuy config) quay lai buoc truoc hoac ket thuc
```

### 2.6 Tim task tiep theo: TSI -> TST -> TNT (N) -> (xu ly dieu kien) -> TNT -> TST -> tao TSI

> Diagram ref: *"2.6 Tim task tiep theo: TSI -> TST -> TNT (N) -> (xu ly dieu kien) -> TNT -> TST -> tao TSI"*

```
He thong (khi TSI L3 hien tai COMPLETED):

   TSI L3 hien tai (#001-02-01, COMPLETED)
      │
      ▼ (lay type)
   TST L3 (LF212.1-Doi chieu man hinh)
      │
      ▼ (lay tat ca next steps)
   TNT (N):
   - TNT #1: -> LF212.2 (condition: null = auto)
   - TNT #2: -> LF212.5 (condition: skip_remaining = true)
      │
      ▼ (xu ly dieu kien)
   Evaluate conditions voi context cua TSI:
   - TNT #1: condition = null -> MATCH (auto transition)
      │
      ▼ (lay TST dich)
   TNT #1.to_tst_id -> TST L3 (LF212.2-Kiem tra Asset)
      │
      ▼ (tao TSI moi)
   Tao TSI L3 moi (#001-02-02)
   myParentTask = TSI L2 (#001-02)
   tst_id = LF212.2
      │
      ▼ (quay lai buoc 2.3)
   Tim nguoi xu ly cho TSI L3 moi

Chi tiet:
1. Tu TSI hien tai -> lay TST hien tai
2. Tim TNT: TNT.filter(from_tst_id = TST_hien_tai).orderBy(priority)
3. Voi moi TNT, danh gia condition_expression:
   - null/empty -> luon match (auto transition)
   - co expression -> evaluate voi context
4. Chon TNT dau tien match -> lay to_tst_id (TST dich)
5. Tao TSI moi (tst_id = TST dich, myParentTask = cung TSI L2 cha)
6. Copy TSI_Filter tu TSI cha
7. Quay lai buoc 2.3 (assign nguoi xu ly)
8. Neu khong co TNT nao match -> buoc nay ket thuc
   -> Kiem tra TSI L2 cha co hoan thanh chua
   -> Neu TSI L2 hoan thanh -> quay len 2.6 cho TSI L2 (tim TST L2 tiep theo)
```

### 2.7 Ket thuc workflow

```
Khi khong con TNT nao cho TSI L2 cuoi cung:
1. Cap nhat TSI L2 status = COMPLETED
2. Cap nhat TSI L1 status = COMPLETED
3. Tao TSEV (event_type: UPDATE, data: "Workflow completed")
4. Gui notification cho Submittor: "Task da hoan thanh"
```

---

## 4.3 UserFlow 3: Reports

### 3.1 Pending Tasks cua toi: EMP -> TRI (N), sort theo TST L1, L2, Filters, FirstTaskCreatedAt, StepCreatedAt

> Diagram ref: *"3.1 Pending tasks cua toi: EMP -> TRI (N), sort theo TST L1, L2, Filters, FirstTaskCreatedAt, StepCreatedAt etc."*

```
Actor: EMP bat ky (vd: TiepTA - Tran Anh Tiep (Legal))

Query logic:

   EMP (TiepTA - Tran Anh Tiep)
      │
      ▼ (lay tat ca role assignments)
   TRI (N):
   - TRI #1: role=LEGAL_APPROVER, tsi=TSI L3 #001-02-02
   - TRI #2: role=LEGAL_APPROVER, tsi=TSI L3 #003-01-01
   - TRI #3: role=LEGAL_APPROVER, tsi=TSI L3 #005-02-03
      │
      ▼ (lay TSI va navigate nguoc len)
   Voi moi TRI -> TSI L3 -> TST L3 -> TST L2 -> TST L1:
   - TSI #001-02-02 -> LF212.2 -> LF212 -> LF210 (Copyright)
   - TSI #003-01-01 -> LF222.1 -> LF222 -> LF220 (Trademark)
   - TSI #005-02-03 -> LF243.1 -> LF243 -> LF240 (Contract)
      │
      ▼ (lay Filters tu TSI_Filter)
   - TSI #001: {PT: "Mobile App", LE: "Apero-SG"}
   - TSI #003: {PT: "Game", LE: "Apero-VN"}
   - TSI #005: {LE: "Apero-VN", KR: "KR02"}
      │
      ▼ (Sort)
   Sort by: TST L1 (Copyright < Contract < Trademark)
          , TST L2 (LF211 < LF212 < ...)
          , Filters (LE, PT, KR...)
          , FirstTaskCreatedAt (TSI L1.created_at)
          , StepCreatedAt (TSI L3.created_at)
      │
      ▼ (Filter)
   Filter: status IN (PENDING, IN_PROGRESS)
```

### 3.2 Tim Task cu the: TST L1 -> TST L2 -> TST L3 -> TSI

> Diagram ref: *"3.2 Tim Task: TST L1 -> TST L2 -> TST L3 -> TSI"*

```
1. Chon TST L1 (vd: LF210-Copyright)
2. He thong hien thi cay TST L2 con
3. Chon TST L2 (vd: LF212-Ra soat)
4. He thong hien thi cay TST L3 con
5. Chon TST L3 (vd: LF212.1-Doi chieu)
6. He thong list tat ca TSI instances cua TST L3 nay
7. Click vao TSI cu the de xem chi tiet
```

### 3.3 Bao cao SLA

```
1. Thong ke so task dat/tre SLA theo tung TST L1
2. Thong ke theo thoi gian (thang/quy)
3. Thong ke theo nguoi xu ly (EMP)
```

### 3.4 Bao cao khoi luong cong viec

```
1. Dem so task/role theo tung EMP
2. Thong ke trang thai task theo tung phong ban
3. Workload heatmap theo tuan/thang
```

---

# 5. Complex Logic

## 5.1 TST Hierarchy Navigation

### Tim TST L1 -> L2 -> L3

```python
# Pseudocode
def get_tst_tree(tst_l1_id):
    """Lay toan bo cay TST tu L1"""
    l1 = TST.get(tst_l1_id)  # Level 1
    l2_list = TST.filter(myParentTask=l1.tst_id, tst_level=2)
    tree = {"l1": l1, "children": []}
    for l2 in l2_list:
        l3_list = TST.filter(myParentTask=l2.tst_id, tst_level=3)
        tree["children"].append({"l2": l2, "children": l3_list})
    return tree
```

### Tim TST L1 tu TSI bat ky

```python
def find_tst_l1_from_tsi(tsi):
    """Tu mot TSI bat ky, tim nguoc len TST L1"""
    tst = TST.get(tsi.tst_id)
    while tst.myParentTask is not None:
        tst = TST.get(tst.myParentTask)
    return tst  # TST Level 1
```

## 5.2 Task Instance Auto-Creation

> **Ref diagram**: "2.2 TSI L1 -> TST L1 -> TST L2 dau tien -> TST L3 dau tien -> tao TSI L3, L2"
> Moi luot CopyrightReview cho 1 app = 1 dong TSI L1.
> He thong tu dong navigate xuong TST L2 -> TST L3, roi tao TSI L2 + TSI L3.

### Buoc 2.1: User tao TSI L1

```python
def create_task_item(tst_l1_id, title, requester_emp_id, filter_values):
    """
    User tao 1 dong TSI L1.
    VD: tst_l1_id = "LF210", title = "CopyrightReview - Caller ID App"
        filter_values = {PT: "Mobile App", LE: "Apero-SG", KR: "KR01"}
    """

    # 1. Tao TSI L1 (1 dong duy nhat cho ca quy trinh)
    tsi_l1 = TSI.create(
        tst_id=tst_l1_id,
        title=title,
        status="IN_PROGRESS",
        requested_by=requester_emp_id
    )

    # 2. Luu filter values vao TSI_Filter (instance layer)
    for filter_type, filter_code in filter_values.items():
        TSI_Filter.create(
            tsi_id=tsi_l1.tsi_id,
            filter_type=filter_type,   # vd: "PT", "LE", "KR"
            filter_code=filter_code     # vd: "Mobile App", "Apero-SG", "KR01"
        )

    # 3. Tao TSEV CREATE
    create_event(tsi_l1, "CREATE", requester_emp_id)

    # 4. Tu dong chay buoc 2.2: tim task dau tien
    navigate_and_create_first_step(tsi_l1)

    return tsi_l1
```

### Buoc 2.2: He thong navigate TST L1 -> L2 -> L3, tao TSI L2 + L3

```python
def navigate_and_create_first_step(tsi_l1):
    """
    Diagram: TSI L1 -> TST L1 -> TST L2 dau tien -> TST L3 dau tien -> tao TSI L3, L2

    VD: TSI L1 (#001) -> LF210 -> LF211 (dau tien) -> LF211.step (dau tien)
        -> Tao TSI L2 (#001-01) + TSI L3 (#001-01-01)
    """

    # 1. TSI L1 -> TST L1
    tst_l1 = TST.get(tsi_l1.tst_id)

    # 2. TST L1 -> TST L2 dau tien (con dau tien theo priority)
    tst_l2 = TST.filter(
        myParentTask=tst_l1.tst_id, tst_level=2
    ).order_by("priority").first()

    if not tst_l2:
        return  # Khong co phase nao -> ket thuc

    # 3. TST L2 -> TST L3 dau tien
    tst_l3 = TST.filter(
        myParentTask=tst_l2.tst_id, tst_level=3
    ).order_by("priority").first()

    # 4. Tao TSI L2 (con cua TSI L1)
    tsi_l2 = TSI.create(
        tst_id=tst_l2.tst_id,
        myParentTask=tsi_l1.tsi_id,     # TSI L2 -> TSI L1
        title=f"{tsi_l1.title} - {tst_l2.tst_name}",
        status="IN_PROGRESS"
    )
    # Copy filter values tu TSI L1 xuong TSI L2
    copy_tsi_filters(from_tsi=tsi_l1, to_tsi=tsi_l2)

    if tst_l3:
        # 5. Tao TSI L3 (con cua TSI L2)
        tsi_l3 = TSI.create(
            tst_id=tst_l3.tst_id,
            myParentTask=tsi_l2.tsi_id,  # TSI L3 -> TSI L2
            title=f"{tsi_l1.title} - {tst_l3.tst_name}",
            status="PENDING"
        )
        # Copy filter values tu TSI L1 xuong TSI L3
        copy_tsi_filters(from_tsi=tsi_l1, to_tsi=tsi_l3)

        # 6. Chuyen sang buoc 2.3: tim nguoi xu ly cho TSI L3
        assign_handler(tsi_l3)
    else:
        # Khong co step L3 -> assign truc tiep cho TSI L2
        assign_handler(tsi_l2)
```

### Buoc 2.6: Tim task tiep theo (TNT navigation)

```python
def find_and_create_next_step(tsi_completed):
    """
    Diagram: TSI -> TST -> TNT (N) -> (xu ly dieu kien) -> TNT -> TST -> tao TSI

    Khi TSI L3 hien tai COMPLETED, tim buoc tiep theo.
    VD: TSI L3 #001-02-01 (LF212.1) COMPLETED
        -> TNT: LF212.1 -> LF212.2
        -> Tao TSI L3 #001-02-02 (LF212.2)
    """

    # 1. TSI -> TST
    tst_current = TST.get(tsi_completed.tst_id)

    # 2. TST -> TNT (N)
    tnt_list = TNT.filter(
        from_tst_id=tst_current.tst_id, is_active=True
    ).order_by("priority")

    # 3. Xu ly dieu kien -> chon TNT
    context = build_context(tsi_completed)
    selected_tnt = None
    for tnt in tnt_list:
        if tnt.condition_expression is None or \
           evaluate_condition(tnt.condition_expression, context):
            selected_tnt = tnt
            break

    if selected_tnt:
        # 4. TNT -> TST (dich)
        tst_next = TST.get(selected_tnt.to_tst_id)

        # 5. Tao TSI moi (cung cap TSI L2 cha)
        tsi_parent_l2 = TSI.get(tsi_completed.myParentTask)
        tsi_next = TSI.create(
            tst_id=tst_next.tst_id,
            myParentTask=tsi_parent_l2.tsi_id,  # cung TSI L2 cha
            title=f"{tsi_parent_l2.title} - {tst_next.tst_name}",
            status="PENDING"
        )
        copy_tsi_filters(from_tsi=tsi_completed, to_tsi=tsi_next)

        # 6. Assign nguoi xu ly (buoc 2.3)
        assign_handler(tsi_next)

    else:
        # Khong con TNT -> TSI L3 cuoi cung trong TSI L2 nay
        # Kiem tra: TSI L2 cha hoan thanh chua?
        handle_phase_completion(tsi_completed)


def handle_phase_completion(tsi_last_step):
    """Khi TSI L3 cuoi cung hoan thanh, kiem tra TSI L2 va tim phase tiep theo"""

    tsi_l2 = TSI.get(tsi_last_step.myParentTask)

    # Kiem tra tat ca TSI L3 con cua TSI L2 da COMPLETED chua
    children = TSI.filter(myParentTask=tsi_l2.tsi_id)
    if all(c.status == "COMPLETED" for c in children):
        tsi_l2.status = "COMPLETED"
        tsi_l2.save()

        # Tim TST L2 tiep theo (cung cap TSI L1)
        tsi_l1 = TSI.get(tsi_l2.myParentTask)
        tst_l2_current = TST.get(tsi_l2.tst_id)

        # Tim TNT tu TST L2 hien tai -> TST L2 tiep theo
        tnt_next_phase = TNT.filter(
            from_tst_id=tst_l2_current.tst_id, is_active=True
        ).order_by("priority")

        context = build_context(tsi_l2)
        for tnt in tnt_next_phase:
            if tnt.condition_expression is None or \
               evaluate_condition(tnt.condition_expression, context):

                tst_l2_next = TST.get(tnt.to_tst_id)

                # Tao TSI L2 moi
                tsi_l2_next = TSI.create(
                    tst_id=tst_l2_next.tst_id,
                    myParentTask=tsi_l1.tsi_id,
                    title=f"{tsi_l1.title} - {tst_l2_next.tst_name}",
                    status="IN_PROGRESS"
                )
                copy_tsi_filters(from_tsi=tsi_l1, to_tsi=tsi_l2_next)

                # Tim TST L3 dau tien cua phase moi
                tst_l3_first = TST.filter(
                    myParentTask=tst_l2_next.tst_id, tst_level=3
                ).order_by("priority").first()

                if tst_l3_first:
                    tsi_l3_first = TSI.create(
                        tst_id=tst_l3_first.tst_id,
                        myParentTask=tsi_l2_next.tsi_id,
                        status="PENDING"
                    )
                    copy_tsi_filters(from_tsi=tsi_l1, to_tsi=tsi_l3_first)
                    assign_handler(tsi_l3_first)
                return

        # Khong con phase nao -> Workflow hoan thanh
        tsi_l1.status = "COMPLETED"
        tsi_l1.save()
        create_event(tsi_l1, "UPDATE", system_user,
                    data={"note": "Workflow completed"})
```

## 5.3 TNT Condition Evaluation (Branching Logic)

### Logic xu ly nhieu nhanh (co dieu kien)

```python
def evaluate_next_step(tsi_current):
    """Tim buoc tiep theo dua tren dieu kien"""

    tst_current = TST.get(tsi_current.tst_id)
    tnt_list = TNT.filter(from_tst_id=tst_current.tst_id, is_active=True)
    tnt_list = tnt_list.order_by("priority")

    context = build_context(tsi_current)
    # context = {
    #   "status": "APPROVED",
    #   "round_count": 2,
    #   "all_agreed": True,
    #   "has_changes": False,
    #   ...
    # }

    for tnt in tnt_list:
        if tnt.condition_expression is None:
            # Khong co dieu kien -> luon thoa man
            return tnt.to_tst_id

        if evaluate_condition(tnt.condition_expression, context):
            return tnt.to_tst_id

    return None  # Khong co buoc tiep theo -> ket thuc


def evaluate_condition(expression, context):
    """Danh gia bieu thuc dieu kien JSON Logic"""
    # VD expression: {"<": [{"var": "round_count"}, 3]}
    # VD expression: {"==": [{"var": "all_agreed"}, true]}
    # VD expression: {"and": [
    #     {">=": [{"var": "round_count"}, 3]},
    #     {"==": [{"var": "all_agreed"}, false]}
    # ]}
    return json_logic.evaluate(expression, context)
```

## 5.4 Parallel Steps (Fork & Join)

### Logic xu ly cac buoc song song (VD: LF222.1-6)

```python
def handle_parallel_steps(tsi_parent, parallel_tst_ids):
    """Tao nhieu TSI song song va cho tat ca hoan thanh"""

    # FORK: Tao tat ca TSI song song
    parallel_tsis = []
    for tst_id in parallel_tst_ids:
        tsi = TSI.create(
            tst_id=tst_id,
            myParentTask=tsi_parent.tsi_id,
            status="PENDING"
        )
        assign_handler(tsi)
        parallel_tsis.append(tsi)

    return parallel_tsis


def check_join_condition(tsi_parent):
    """Kiem tra tat ca buoc song song da hoan thanh chua"""
    children = TSI.filter(myParentTask=tsi_parent.tsi_id)
    all_completed = all(c.status == "COMPLETED" for c in children)

    if all_completed:
        # JOIN: Chuyen sang buoc tong hop (VD: LF222.7)
        next_tst = evaluate_next_step(tsi_parent)
        if next_tst:
            create_next_tsi(tsi_parent, next_tst)
```

## 5.5 Approval Chain (Day chuyen phe duyet LF245)

```python
def process_approval_chain(tsi_contract, approval_steps):
    """Xu ly day chuyen phe duyet tuan tu"""
    # approval_steps (tu TRT, sap xep theo order):
    # [
    #   {order: 1, role: "SUBMITTOR",         emp: ...},
    #   {order: 2, role: "LEGAL_APPROVER",    emp: ...},
    #   {order: 3, role: "FINANCE_APPROVER",  emp: ...},
    #   {order: 4, role: "TEAM_APPROVER",     emp: ...(Tro ly GD)},
    #   {order: 5, role: "TEAM_APPROVER",     emp: ...(BOD)},
    #   {order: 6, role: "TEAM_APPROVER",     emp: ...(CEO)},
    #   {order: 7, role: "TEAM_APPROVER",     emp: ...(Hanh chinh)},
    # ]

    current_step = get_current_approval_step(tsi_contract)

    # Khi step hien tai APPROVE
    if current_step.order < len(approval_steps):
        next_step = approval_steps[current_step.order]  # +1 (0-indexed)
        assign_approver(tsi_contract, next_step.emp)
        create_event(tsi_contract, "APPROVE", current_step.emp)
    else:
        # Buoc cuoi cung -> HD da ky day du
        tsi_contract.status = "COMPLETED"
        create_event(tsi_contract, "APPROVE", current_step.emp)
```

## 5.6 Filter Matching Logic

> **Ref diagram**: "2.3 TSI L3 -> TST L3 -> TRT (N); TSI L3 -> myFilters; TRT (N) & myFilters -> TRT -> EMP"
> 2 nhanh song song: (1) lay roles tu TST, (2) lay filter values tu TSI
> Sau do match 2 nhanh de tim EMP phu hop.

### Tim nguoi xu ly dua tren TSI_Filter

```python
def assign_handler(tsi):
    """
    Diagram: TSI L3 -> TST L3 -> TRT (N); TSI L3 -> myFilters; TRT (N) & myFilters -> TRT -> EMP

    VD: TSI L3 #001-01-01 (CopyrightReview - Caller ID App)
        Nhanh 1: TST L3 (LF211.step) -> TRT: [SUBMITTOR, LEGAL_APPROVER]
        Nhanh 2: TSI_Filter: {PT: "Mobile App", LE: "Apero-SG", KR: "KR01"}
        Match: SUBMITTOR co scope LE="Apero-SG" -> TRI -> EMP: "MinhPT"
    """

    tst = TST.get(tsi.tst_id)

    # === NHANH 1: TSI L3 -> TST L3 -> TRT (N) ===
    required_roles = TST_TRT.filter(tst_id=tst.tst_id)
    # VD: [SUBMITTOR, LEGAL_APPROVER]

    # === NHANH 2: TSI L3 -> myFilters (TSI_Filter) ===
    tsi_filters = TSI_Filter.filter(tsi_id=tsi.tsi_id)
    task_filter_map = {f.filter_type: f.filter_code for f in tsi_filters}
    # VD: {PT: "Mobile App", LE: "Apero-SG", KR: "KR01"}

    # === MATCH: TRT (N) & myFilters -> TRT -> EMP ===
    for role_mapping in required_roles:
        trt = TRT.get(role_mapping.trt_id)

        # Lay filter scope cua TRT (config layer)
        trt_filter_scope = TRT_Filter.filter(trt_id=trt.trt_id)
        # VD: LEGAL_APPROVER scope = {LE: "Apero-VN"}

        # Check: TRT filter scope co match voi TSI filter values?
        if matches_scope(trt_filter_scope, task_filter_map):
            # Tim EMP trong TRT nay
            tri_list = TRI.filter(trt_id=trt.trt_id, is_active=True)
            if tri_list:
                selected_tri = tri_list.first()  # hoac round-robin/workload-based
                tsi.assigned_to = selected_tri.emp_id
                tsi.save()
                notify(selected_tri.emp_id, tsi)
                return

    # Khong tim thay -> thong bao Admin
    notify_admin("No handler found for TSI", tsi)


def matches_scope(trt_filter_scope, task_filter_map):
    """
    Kiem tra TRT filter scope co phu hop voi TSI filter values khong.
    Rule: Moi filter trong TRT scope phai match voi TSI filter.
          Neu TRT khong co scope (empty) -> match tat ca.
    """
    if not trt_filter_scope:
        return True  # Khong co scope -> match tat ca

    for scope in trt_filter_scope:
        if scope.filter_type in task_filter_map:
            if scope.filter_code != task_filter_map[scope.filter_type]:
                return False  # Khong match
    return True


def copy_tsi_filters(from_tsi, to_tsi):
    """Copy filter values tu TSI cha xuong TSI con (ke thua)"""
    filters = TSI_Filter.filter(tsi_id=from_tsi.tsi_id)
    for f in filters:
        TSI_Filter.create(
            tsi_id=to_tsi.tsi_id,
            filter_type=f.filter_type,
            filter_code=f.filter_code
        )
```

## 5.7 Contract Expiry Monitoring (LF247)

```python
def check_contract_expiry():
    """Chay dinh ky hang thang - Kiem tra HD sap het han"""

    # Tim tat ca TSI loai Contract dang COMPLETED
    active_contracts = TSI.filter(
        tst_id__in=get_contract_tst_ids(),
        status="COMPLETED"
    )

    for contract in active_contracts:
        expiry_date = get_expiry_date(contract)
        days_until_expiry = (expiry_date - today()).days

        if days_until_expiry <= 30:
            # Gui thong bao gia han
            notify_renewal(contract)

        if days_until_expiry <= 0:
            # HD da het han
            contract.status = "EXPIRED"
            create_event(contract, "UPDATE", system_user,
                        data={"note": "HD het han tu dong"})
```

---


## 5.8 AI Review Logic (GPT-4o-mini)

```python
# Trigger: User nhan "AI Check" hoac tu dong sau "Submit to Review"
async def run_ai_review(step_name, doc_names, file_contents=""):
    # 1. Lay checklist theo step_name (4 muc/step)
    checklist = get_checklist_for_step(step_name)

    # 2. Doc noi dung file thuc tu server
    #    Supported: .pdf (PyPDF2), .docx (python-docx),
    #               .pptx (python-pptx), .xlsx (openpyxl), .txt/.csv

    # 3. Gui prompt + noi dung file len GPT-4o-mini
    prompt = f"Ban la AI Legal Reviewer..."
    #    Bao gom: step_name, focus, file_contents (max 3000 chars), checklist

    # 4. Parse JSON response
    result = {
        "verdict": "PASS" | "PASS_WITH_NOTES" | "FAIL",
        "score": 0-100,
        "summary": "...",
        "checklist": [{"item": "...", "status": "PASS|FAIL", "note": "..."}],
        "model": "gpt-4o-mini-2024-07-18"
    }

    # 5. Luu ket qua vao TSEV (emp_id="AI_REVIEWER")
    # 6. Hien thi trong Progress Tree: cot Comment + expandable panel
```

**Chi phi**: ~$0.003/review (GPT-4o-mini). ~$7/thang cho 100 tasks.

**File upload flow**:
```
User chon file -> POST /upload-file (multipart) -> Luu uploads/{tsi_id}/{uuid}.ext
                                                 -> TDI record (file_url = /api/.../file/{name})
                                                 -> TSEV UPLOAD event
```

# 6. Feature & Layer

## 6.1 Feature Map

| Feature ID | Feature Name | Layer | TST Type | Priority |
|------------|-------------|-------|----------|----------|
| F01 | Config TaskType (CRUD TST tree) | Config | All | P0 |
| F02 | Config TaskNextType (CRUD TNT + conditions) | Config | All | P0 |
| F03 | Config TaskDocType (CRUD TDT) | Config | All | P0 |
| F04 | Config TaskRoleType (CRUD TRT + EMP mapping) | Config | All | P0 |
| F05 | Config Filters (TST_Filter mapping) | Config | All | P0 |
| F06 | Create Task (TSI) | Operation | All | P0 |
| F07 | Task Auto-routing (TNT evaluation) | Operation | All | P0 |
| F08 | Task Assignment (TRI + Filter matching) | Operation | All | P0 |
| F09 | Document Upload/View (TDI) | Operation | All | P0 |
| F10 | Task Events (TSEV - Comment/Approve/Reject) | Operation | All | P0 |
| F11 | Parallel Steps (Fork & Join) | Operation | LF220, LF230, LF240 | P1 |
| F12 | Approval Chain (Multi-level) | Operation | LF240 | P1 |
| F13 | Dashboard (My Tasks, Summary) | Report | All | P0 |
| F14 | Pending Task List (with sort/filter) | Report | All | P0 |
| F15 | Task Detail View | Report | All | P0 |
| F16 | SLA Report | Report | All | P1 |
| F17 | Workload Report | Report | All | P2 |
| F18 | Contract Expiry Monitoring | Automation | LF240 | P1 |
| F19 | Notification System | Cross-cutting | All | P1 |
| F20 | Copyright Check Workflow | Domain | LF210 | P0 |
| F21 | Trademark Check Workflow | Domain | LF220 | P0 |
| F22 | Policy (PP & TOS) Workflow | Domain | LF230 | P0 |
| F23 | Contract Review Workflow | Domain | LF240 | P0 |
| F24 | AI Document Review (GPT-4o-mini) | AI | All | P1 |
| F25 | Real File Upload & Storage | Operation | All | P0 |

## 6.2 Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                     │
│  React + Tailwind + Shadcn UI                            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │Dashboard│ │Task List│ │Task Det.│ │ Config  │      │
│  │  Page   │ │  Page   │ │  Page   │ │  Pages  │      │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘      │
├─────────────────────────────────────────────────────────┤
│                      API LAYER                           │
│  FastAPI (REST)                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ task_    │ │ config_  │ │ event_   │ │ report_  │  │
│  │ routes   │ │ routes   │ │ routes   │ │ routes   │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
├─────────────────────────────────────────────────────────┤
│                    SERVICE LAYER                          │
│  Business Logic                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ workflow │ │ config   │ │ document │ │ report   │  │
│  │ _engine  │ │ _service │ │ _service │ │ _service │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ assign   │ │ notif    │ │ auth     │ │ai_review │ │
│  │ _service │ │ _service │ │ _service │ │ _service │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────┤
│                    DATA ACCESS LAYER                     │
│  BigQuery Client / ORM                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ tst_repo │ │ tsi_repo │ │ tsev_repo│               │
│  │ tnt_repo │ │ tdi_repo │ │ emp_repo │               │
│  │ tdt_repo │ │ tri_repo │ │ filter   │               │
│  │ trt_repo │ │          │ │ _repo    │               │
│  └──────────┘ └──────────┘ └──────────┘               │
├─────────────────────────────────────────────────────────┤
│                    DATABASE LAYER                         │
│  SQLite (dev) / BigQuery (prod)                          │
│  File: legal.db (auto-created, 14 tables)               │
│  Tables: tst, tnt, tdt, tdtp, tsi, tdi, trt, tri, tsev │
│          emp, tst_trt, tst_tdt, tst_filter, tsi_filter  │
│  Schema: src/config/database.py                          │
└─────────────────────────────────────────────────────────┘
```

## 6.3 API Endpoint Design

### Config APIs

| Method | Endpoint | Feature | Description |
|--------|----------|---------|-------------|
| GET | `/api/legal/config/tst` | F01 | List all TST (tree) |
| GET | `/api/legal/config/tst/{id}` | F01 | Get TST detail |
| POST | `/api/legal/config/tst` | F01 | Create TST |
| PUT | `/api/legal/config/tst/{id}` | F01 | Update TST |
| DELETE | `/api/legal/config/tst/{id}` | F01 | Delete TST (soft) |
| GET | `/api/legal/config/tnt?from_tst_id=X` | F02 | List TNT for a TST |
| POST | `/api/legal/config/tnt` | F02 | Create TNT |
| PUT | `/api/legal/config/tnt/{id}` | F02 | Update TNT |
| DELETE | `/api/legal/config/tnt/{id}` | F02 | Delete TNT |
| GET | `/api/legal/config/tdt` | F03 | List all TDT |
| POST | `/api/legal/config/tdt` | F03 | Create TDT |
| GET | `/api/legal/config/trt` | F04 | List all TRT |
| POST | `/api/legal/config/trt` | F04 | Create TRT |
| POST | `/api/legal/config/tst-trt` | F04 | Map TST-TRT |
| POST | `/api/legal/config/tst-tdt` | F03 | Map TST-TDT |
| POST | `/api/legal/config/tst-filter` | F05 | Map TST-Filter |

### Operation APIs

| Method | Endpoint | Feature | Description |
|--------|----------|---------|-------------|
| POST | `/api/legal/task` | F06 | Create new task (TSI L1) |
| GET | `/api/legal/task/{id}` | F15 | Get task detail (TSI + tree) |
| PUT | `/api/legal/task/{id}` | F10 | Update task |
| POST | `/api/legal/task/{id}/event` | F10 | Create event (TSEV) |
| POST | `/api/legal/task/{id}/document` | F09 | Upload document (TDI) |
| GET | `/api/legal/task/{id}/documents` | F09 | List documents |
| POST | `/api/legal/task/{id}/approve` | F10 | Approve task |
| POST | `/api/legal/task/{id}/reject` | F10 | Reject task |
| POST | `/api/legal/task/{id}/next` | F07 | Trigger next step (TNT eval) |

### Report APIs

| Method | Endpoint | Feature | Description |
|--------|----------|---------|-------------|
| GET | `/api/legal/dashboard` | F13 | Dashboard summary |
| GET | `/api/legal/my-tasks` | F14 | My pending tasks |
| GET | `/api/legal/reports/sla` | F16 | SLA report |
| GET | `/api/legal/reports/workload` | F17 | Workload report |

### Employee & Auth APIs

| Method | Endpoint | Feature | Description |
|--------|----------|---------|-------------|
| GET | `/api/legal/emp` | - | List employees |
| POST | `/api/legal/tri` | F08 | Assign role to emp for task |
| GET | `/api/legal/tri?emp_id=X` | F14 | Get all role assignments for emp |


### AI Review APIs (v7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/legal/task/{tsi_id}/ai-review` | Trigger AI review (doc file thuc, goi GPT-4o-mini) |
| GET | `/api/legal/task/{tsi_id}/ai-review` | Lay ket qua AI review moi nhat |

### File Upload APIs (v7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/legal/task/{tsi_id}/upload-file` | Upload file thuc (multipart form-data) |
| GET | `/api/legal/task/{tsi_id}/file/{filename}` | Serve/download file da upload |
| DELETE | `/api/legal/task/{tsi_id}/document/{tdi_id}` | Soft-delete document |

## 6.4 Frontend Page Map

| Page | Route | Features | Role Access |
|------|-------|----------|-------------|
| Dashboard | `/legal` | F13 | All roles |
| My Tasks | `/legal/tasks` | F14, F15 | All roles |
| Task Detail | `/legal/tasks/:id` | F09, F10, F15 | Assigned roles |
| Create Task | `/legal/tasks/new` | F06 | Submittor |
| Config TST | `/legal/config/tst` | F01, F02 | Admin |
| Config TRT | `/legal/config/trt` | F04 | Admin |
| Config TDT | `/legal/config/tdt` | F03 | Admin |
| Config Filters | `/legal/config/filters` | F05 | Admin |
| SLA Report | `/legal/reports/sla` | F16 | Manager+ |
| Workload Report | `/legal/reports/workload` | F17 | Manager+ |

## 6.5 Database Tables (BigQuery Dataset: `legal_workflow`)

| # | Table | Type | Approx Rows | Description |
|---|-------|------|-------------|-------------|
| 1 | `tst` | Config | ~50 | TaskType (3 levels) |
| 2 | `tnt` | Config | ~80 | TaskNextType (branching rules) |
| 3 | `tdt` | Config | ~15 | TaskDocType |
| 4 | `trt` | Config | ~4 | TaskRoleType |
| 5 | `tst_trt` | Config (Junction) | ~30 | TST-TRT mapping |
| 6 | `tst_tdt` | Config (Junction) | ~40 | TST-TDT mapping |
| 7 | `tst_filter` | Config (Junction) | ~100 | TST-Filter mapping (filter NAO ap dung) |
| 8 | `tsi_filter` | Transaction (Junction) | Growing | **TSI-Filter mapping (GIA TRI filter cu the)** |
| 9 | `tsi` | Transaction | Growing | TaskItem instances |
| 10 | `tdi` | Transaction | Growing | TaskDocItem (uploaded files) |
| 11 | `tri` | Transaction | Growing | TaskRoleItem (assignments) |
| 12 | `tsev` | Transaction (Append-only) | Growing | TaskEvent log |
| 13 | `emp` | Master | ~50 | Employee |
| 14 | `tlt` | Lookup | ~5 | TransLegalType |
| 15 | `tut` | Lookup | ~3 | TransUrgencyType |
| 16 | `tst_size` | Lookup | ~3 | TransSizeType |
| 17 | `tmt` | Lookup | ~5 | TransMarketingType |
| 18 | `kr` | Lookup (shared) | ~5 | KeyResult |
| 19 | `cdt` | Lookup (shared) | ~12 | BudgetOwner |
| 20 | `pt` | Lookup (shared) | ~4 | ProductType |
| 21 | `le` | Lookup (shared) | ~9 | LegalEntity |

> **Tong: 21 tables** (them `tsi_filter` so voi ban truoc)
> **Ghi chu**: Cac bang Lookup (kr, cdt, pt, le) co the dung chung voi module FPS da co trong `fps_data` dataset. Khong can tao moi - chi can reference.

---

# 7. System Design Recommendations

## 7.1 Goi y hoan thien Entity

### 7.1.1 Them truong cho TST (TaskType)

| Field moi | Type | Ly do |
|-----------|------|-------|
| `is_parallel` | BOOLEAN | Danh dau step nay co chay song song khong (VD: LF222.1-6) |
| `join_type` | STRING | `ALL` (tat ca phai xong) hoac `ANY` (1 xong la du) |
| `template_id` | STRING | Lien ket toi mau tai lieu template (cho LF232 - PP/TOS) |
| `auto_assign_rule` | STRING(JSON) | Quy tac tu dong phan cong (round-robin, workload-based, ...) |
| `notification_config` | STRING(JSON) | Cau hinh gui thong bao (email, discord, ...) |

### 7.1.2 Them truong cho TSI (TaskItem)

| Field moi | Type | Ly do |
|-----------|------|-------|
| `metadata` | STRING(JSON) | Du lieu bo sung: ten app, link store, gia tri HD, ... |
| `round_count` | INT | Dem so vong dam phan (dung cho LF243.4) |
| `escalated` | BOOLEAN | Da escalate chua (LF243.4 > 3 vong) |
| `expiry_date` | DATE | Ngay het han (cho HD - dung cho LF247) |
| `contract_code` | STRING | Ma hop dong (cho LF246: ddmmyy/Ten-Cty-DoiTac) |

### 7.1.3 Them truong cho TSEV (TaskEvent)

| Field moi | Type | Ly do |
|-----------|------|-------|
| `old_status` | STRING | Trang thai truoc khi event xay ra |
| `new_status` | STRING | Trang thai sau khi event xay ra |
| `ip_address` | STRING | Audit trail |

## 7.2 De xuat tinh nang bo sung

### 7.2.1 Notification System (P1)

- **Kenh**: Email (legal@apero.vn), Discord, In-app notification
- **Trigger events**: Task created, Task assigned, Task overdue, Approval required, Task completed
- **Config**: Moi EMP co the bat/tat notification theo loai
- **Cai dat**: Them bang `notification_config` va `notification_log`

### 7.2.2 Template Management (P1)

- Quan ly mau tai lieu (PP template, TOS template, HD template)
- Lien ket TST -> Template
- Auto-fill thong tin tu TSI metadata vao template
- Version control cho template
- **Cai dat**: Them truong `template_id` vao TST, tao bang `document_template`

### 7.2.3 SLA Alert System (P1)

- Canh bao truoc 1 ngay khi task sap het han SLA
- Canh bao ngay khi task vuot SLA
- Escalate tu dong khi vuot SLA (optional)
- **Cai dat**: Scheduled job chay hang ngay, check `tsi.due_date` vs `today()`

### 7.2.4 AI Integration (P2) - Theo dinh huong trong tai lieu

- **AI Copyright Check**: Tu dong so sanh UI/UX voi co so du lieu (LF212)
- **AI Trademark Search**: Tu dong tra cuu WIPO/USPTO/Google va tong hop ket qua (LF222)
- **AI Contract Review**: Tu dong ra soat dieu khoan hop dong, phat hien rui ro (LF243)
- **AI PP/TOS Generation**: Tu dong soan PP/TOS dua tren template + form data (LF232)
- **Cai dat**: Tao service `ai_agent_service` voi interface toi LLM APIs

### 7.2.5 Integration voi he thong hien tai

- **Google Drive**: Luu tru tai lieu (TDI -> Google Drive link)
- **Google Form**: Tiep nhan yeu cau (LF241 -> Google Form webhook)
- **Discord**: Thong bao va nhan yeu cau
- **Store Manager**: Dong bo trang thai voi Store Manager link

## 7.3 Luu y ve dong bo (Synchronization)

### 7.3.1 Dong bo giua Workflow Entity va Domain Entity

| Workflow Entity | Domain Data | Dong bo nhu the nao |
|-----------------|-------------|---------------------|
| TSI.metadata | App info (ten app, icon...) | TSI metadata chua thong tin domain, khong tao entity moi |
| TSI.metadata | Contract info (gia tri, thoi han...) | Tuong tu - luu trong metadata JSON |
| TRI (role assignment) | EMP (employee) | EMP la shared entity, TRI reference toi emp_id |
| Filter values | KR, CDT, PT, LE | Dung chung bang lookup voi FPS module |

### 7.3.2 Nguyen tac dong bo

1. **KHONG tao entity moi** cho domain data (app, contract detail...) - dung `TSI.metadata` (JSON)
2. **DUNG CHUNG** cac bang lookup (KR, CDT, PT, LE, EMP) voi FPS module
3. **Chi tao bang moi** khi that can thiet va co ly do ro rang
4. **Workflow Entity chi quan tam** luong cong viec (ai lam gi, bao gio, tai lieu nao) - KHONG luu business data

### 7.3.3 Kiem tra dong bo giua cac section

| Section | Check | Status | Ghi chu |
|---------|-------|--------|---------|
| EntityRelationship vs ProcessDescription | TST tree trong Process khop voi Entity definition | OK | TST 3 level, TSI 3 level tuong ung |
| EntityRelationship vs UserFlows | TSI_Filter duoc su dung dung trong UserFlow 2.1 (tao) va 2.3 (match) | OK | Da cap nhat |
| ProcessDescription vs UserFlows | Cac buoc trong Process co UserFlow tuong ung | OK | 2.1-2.7 cover LF210-LF240 |
| UserFlows vs UIWireFrame | Moi UserFlow co man hinh tuong ung | OK | WF01-WF05 |
| Complex Logic vs EntityRelationship | Logic su dung dung cac entity va relationship | OK | 5.2 dung TSI_Filter, 5.6 dung TSI_Filter |
| Complex Logic vs Diagram notation | Code match chinh xac diagram flow 2.1-2.6 | OK | Da cap nhat |
| Feature & Layer vs tat ca section | Features cover het cac tinh nang mo ta | OK | 21 tables, 23 features |
| **TSI L1 = 1 dong per review** | Moi luot CopyrightReview/Trademark/Contract = 1 TSI L1 | OK | Confirmed voi diagram |
| **TSI L2, L3 tu dong tao** | He thong tao, user khong tao truc tiep | OK | Logic trong 5.2 |
| **TSI_Filter ke thua** | Filter values copy tu TSI L1 -> L2 -> L3 | OK | copy_tsi_filters() trong 5.2, 5.6 |

## 7.4 Migration Plan (Tu he thong hien tai)

| Giai doan | Noi dung | Timeline |
|-----------|----------|----------|
| Phase 1 | Setup DB tables, Config APIs, Config UI | 2 weeks |
| Phase 2 | Task CRUD, Event Log, Document Upload | 2 weeks |
| Phase 3 | Workflow Engine (TNT eval, auto-routing) | 2 weeks |
| Phase 4 | Dashboard, Reports, Notification | 2 weeks |
| Phase 5 | AI Integration, Template Management | 4 weeks |

## 7.5 Cau hoi can lam ro (Open Questions)

1. **Parallel steps**: LF222.1-6 co that su chay song song hay tuan tu? Neu song song, can co co che "Join" (cho tat ca xong moi chuyen buoc).

2. **Filter grouping**: Trong diagram co 4 nhom Filter (Payment, Budget, Legal 1, Legal 2). Cac nhom nay ap dung cho TST Level nao? Chi L1 hay ca L2/L3?

3. **EMP scope**: Bang EMP chi chua nhan su Legal hay bao gom ca Product/ASO/Ke toan (nhung nguoi tham gia workflow)?

4. **Escalation rule**: Khi task vuot SLA, co tu dong escalate khong hay chi gui thong bao? Escalate toi ai?

5. **Contract tracking (LF247)**: Viec theo doi gia han HD co can tich hop lich (Calendar) khong? Hay chi gui email nhac?

---

# APPENDIX A: Vi du tong the Full 1 luong Workflow Entity

> Vi du: **CopyrightReview cho app "Caller ID"** - tu luc tao den luc ket thuc.
> Hien thi toan bo du lieu sinh ra trong moi bang: TST, TSI, TNT, TRT, TRI, TDT, TDI, TSEV, TSI_Filter.

---

## A.1 Du lieu Config (da setup truoc)

### Bang TST (TaskType) - Config cay LF210-Copyright

| tst_id | tst_code | tst_name | tst_level | myParentTask | sla_days | is_active |
|--------|----------|----------|-----------|--------------|----------|-----------|
| TST-001 | LF210 | Copyright Check | 1 | NULL | 5 | true |
| TST-002 | LF211 | Input tai lieu UI/UX | 2 | TST-001 | 1 | true |
| TST-003 | LF211.1 | Chuan bi ban so sanh UI/UX | 3 | TST-002 | 1 | true |
| TST-004 | LF212 | Ra soat UI/UX | 2 | TST-001 | 2 | true |
| TST-005 | LF212.1 | Doi chieu man hinh | 3 | TST-004 | 1 | true |
| TST-006 | LF212.2 | Kiem tra Asset | 3 | TST-004 | 1 | true |
| TST-007 | LF212.3 | Kiem tra anh AI | 3 | TST-004 | 1 | true |
| TST-008 | LF212.4 | Doi chieu chinh sach Store | 3 | TST-004 | 1 | true |
| TST-009 | LF212.5 | Tong hop & phan hoi | 3 | TST-004 | 1 | true |

### Bang TNT (TaskNextType) - Luong chuyen tiep

| tnt_id | from_tst_id | to_tst_id | condition_expression | priority |
|--------|-------------|-----------|---------------------|----------|
| TNT-001 | TST-001 (LF210) | TST-002 (LF211) | NULL (auto) | 1 |
| TNT-002 | TST-002 (LF211) | TST-003 (LF211.1) | NULL (auto) | 1 |
| TNT-003 | TST-003 (LF211.1) | TST-004 (LF212) | NULL (khi hoan thanh) | 1 |
| TNT-004 | TST-004 (LF212) | TST-005 (LF212.1) | NULL (auto) | 1 |
| TNT-005 | TST-005 (LF212.1) | TST-006 (LF212.2) | NULL (auto) | 1 |
| TNT-006 | TST-006 (LF212.2) | TST-007 (LF212.3) | NULL (auto) | 1 |
| TNT-007 | TST-007 (LF212.3) | TST-008 (LF212.4) | NULL (auto) | 1 |
| TNT-008 | TST-008 (LF212.4) | TST-009 (LF212.5) | NULL (auto) | 1 |

### Bang TRT (TaskRoleType)

| trt_id | trt_code | trt_name |
|--------|----------|----------|
| TRT-001 | SUBMITTOR | Nguoi gui yeu cau |
| TRT-002 | LEGAL_APPROVER | Nguoi ra soat phap ly |

### Bang TST_TRT (Mapping TST <-> TRT)

| tst_id | trt_id | is_required |
|--------|--------|-------------|
| TST-003 (LF211.1) | TRT-001 (SUBMITTOR) | true |
| TST-005 (LF212.1) | TRT-002 (LEGAL_APPROVER) | true |
| TST-006 (LF212.2) | TRT-002 (LEGAL_APPROVER) | true |
| TST-007 (LF212.3) | TRT-002 (LEGAL_APPROVER) | true |
| TST-008 (LF212.4) | TRT-002 (LEGAL_APPROVER) | true |
| TST-009 (LF212.5) | TRT-002 (LEGAL_APPROVER) | true |

### Bang TDT (TaskDocType)

| tdt_id | tdt_code | tdt_name | file_extensions |
|--------|----------|----------|-----------------|
| TDT-001 | UI_COMPARISON | Ban so sanh UI/UX | .pdf,.pptx,.xlsx |
| TDT-002 | ASSET_LIST | Danh sach asset | .xlsx,.csv |
| TDT-003 | AI_IMAGE | File anh AI-gen | .png,.jpg |
| TDT-004 | COPYRIGHT_REPORT | Bao cao ket qua ra soat | .pdf,.docx |

### Bang TST_TDT (Mapping TST <-> TDT)

| tst_id | tdt_id | is_required |
|--------|--------|-------------|
| TST-003 (LF211.1) | TDT-001 (UI_COMPARISON) | true |
| TST-006 (LF212.2) | TDT-002 (ASSET_LIST) | true |
| TST-007 (LF212.3) | TDT-003 (AI_IMAGE) | false |
| TST-009 (LF212.5) | TDT-004 (COPYRIGHT_REPORT) | true |

### Bang EMP (Employee) - Nhung nguoi tham gia

| emp_id | emp_code | emp_name | department | position |
|--------|----------|----------|------------|----------|
| EMP-004 | MinhPT | Pham Thanh Minh | Product | Product Manager |
| EMP-001 | TiepTA | Tran Anh Tiep | Legal | Legal Manager |

### Bang TRI (TaskRoleItem) - Phan cong san

| tri_id | trt_id | emp_id | is_active |
|--------|--------|--------|-----------|
| TRI-001 | TRT-001 (SUBMITTOR) | EMP-004 (MinhPT) | true |
| TRI-002 | TRT-002 (LEGAL_APPROVER) | EMP-001 (TiepTA) | true |

---

## A.2 Workflow chay tu dau den cuoi (Du lieu thuc)

> **Du lieu thuc tu cac file Legal_md:**
> - App Apero: **"Caller ID Spam Call & Message"** (release 19/09/2023, pt_code: APB648)
> - Doi thu 1: **Truecaller** (release 31/05/2012, 4.7 star, 22M reviews)
> - Doi thu 2: **Showcaller** (release 23/09/2015, 4.4 star, 174K reviews)
> - Top markets: India, Egypt, Iraq (Caller ID) / India, Saudi Arabia, UAE (Showcaller)
> - Publisher: **APERO-SG** (Apero Tech Pte. Ltd., Singapore)
> - So sanh: **17 man hinh** thuc te (tu LF213-Copyright-Bao_cao_ket_qua.md)
> - Nguoi gui: **MinhPT** (Product Manager) | Nguoi review: **TiepTA** (Legal Manager)

---

### Buoc 2.1: MinhPT tao TSI L1 — CopyrightReview cho "Caller ID"

> MinhPT (Product) tao yeu cau review truoc khi app "Caller ID Spam Call & Message" publish len Store tai IN, US, SA.

**TSI duoc tao:**

| tsi_id | tsi_code | tst_id | myParentTask | title | status | requested_by | assigned_to | created_at |
|--------|----------|--------|--------------|-------|--------|-------------|-------------|------------|
| **TSI-001** | TSI-20260324-001 | TST-001 (LF210) | NULL | CopyrightReview - Caller ID Spam Call & Message | IN_PROGRESS | EMP-004 (MinhPT) | NULL | 2026-03-24 09:00 |

**TSI_Filter — gia tri thuc tu AllocationToItem:**

| tsi_id | filter_type | filter_code | Nguon du lieu |
|--------|-------------|-------------|---------------|
| TSI-001 | PT (PT0->PT-S2) | **APB648** | AllocationToItem: PT0, 39 products |
| TSI-001 | LE (fps_le) | **APERO-SG** | fps_le: Apero Tech Pte. Ltd. |
| TSI-001 | CTY (CTY-S2->CTY0) | **IN** | AllocationToItem: top market India |
| TSI-001 | TUT (fps_tut) | **NORMAL** | fps_tut: binh thuong |

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-001 | TSI-001 | CREATE | EMP-004 | {"app":"Caller ID Spam Call & Message","pt":"APB648","le":"APERO-SG","cty":"IN"} | 2026-03-24 09:00 |

---

### Buoc 2.2: He thong navigate TST tree -> tao TSI L2 (LF211) + TSI L3 (LF211.1)

**TSI duoc tao them:**

| tsi_id | tst_id | myParentTask | title | status | created_at |
|--------|--------|--------------|-------|--------|------------|
| **TSI-002** | TST-002 (LF211) | TSI-001 | > Input tai lieu UI/UX | IN_PROGRESS | 2026-03-24 09:00 |
| **TSI-003** | TST-003 (LF211.1) | TSI-002 | > Chuan bi ban so sanh UI/UX | PENDING | 2026-03-24 09:00 |

TSI_Filter ke thua tu TSI-001: {PT: APB648, LE: APERO-SG, CTY: IN, TUT: NORMAL} x 2 TSI = 8 dong.

---

### Buoc 2.3: Assign MinhPT (SUBMITTOR) vao TSI-003

> TSI-003 -> TST-003 (LF211.1) -> TST_TRT -> TRT-001 (SUBMITTOR)
> TSI-003 -> TSI_Filter: {PT: APB648, LE: APERO-SG} -> match TRI-001 -> EMP-004 (MinhPT)

| tsi_id | assigned_to | status |
|--------|-------------|--------|
| TSI-003 | **EMP-004** (MinhPT) | **IN_PROGRESS** |

---

### Buoc 2.4: MinhPT upload ban so sanh UI/UX (du lieu thuc tu LF211)

> MinhPT upload file so sanh **17 man hinh** giua Caller ID vs Truecaller vs Showcaller.
> Noi dung thuc te (trich tu LF211-Copyright-Mau_so_sanh_UIU.md):

**TDI duoc tao:**

| tdi_id | tdt_id | tsi_id | file_name | version | uploaded_by | uploaded_at |
|--------|--------|--------|-----------|---------|-------------|------------|
| TDI-001 | TDT-001 (UI_COMPARISON) | TSI-003 | CallerID_vs_Truecaller_vs_Showcaller_UIX_v1.pdf | 1 | EMP-004 | 2026-03-24 10:30 |

> **Noi dung file** (17 man hinh thuc te tu LF213):

| # | Man hinh | Caller ID (Apero) | Truecaller | Showcaller | Ket qua check |
|---|---------|-------------------|------------|------------|---------------|
| 1 | App Icon & Splash | Nen trang, dien thoai xanh, don gian | Nen xanh gradient, phuc tap | Nen xanh, dien thoai trang | Khac biet |
| 2 | Language First Open | Man rieng chon ngon ngu | More action phu trong man gioi thieu | Man rieng chon ngon ngu | Khac biet |
| 3 | Tutorial | 3 man huong dan, anh tinh | Anh dong, nut "Get Started" skip | Anh tinh, 3 man | Tuong tu UX |
| 4 | Sign-in flow | SDT + email, khong can verify SDT | SDT + email, verify qua cuoc goi/OTP | Khong can dang nhap | Khac biet |
| 5 | Grant Permission | Man rieng giai thich quyen | Popup ngay tren tutorial thu 3 | 2 man rieng giai thich | Khac biet |
| 6 | Home | Lich su goi theo device type + nut goi nhanh | Call frequency list + search tren home | Lich su theo ngay, khong co favourite | Khac biet |
| 7 | Search | Chi tim theo SDT | Tim theo ten va SDT | Chi tim theo SDT + filter quoc gia | Khac biet |
| 8 | List Message | Loc Spam + Block | Loc Spam + quang cao | Khong co | Khac biet |
| 9 | Detail Message | Danh dau Spam, hien ten + SDT | Block, chi hien ten hoac SDT | Khong co | Khac biet |
| 10 | Contact | Ten + SDT + nut goi nhanh + favourite | Chi ten, click vao detail de goi | Favourite + contacts cung 1 man | Khac biet |
| 11 | Contact Detail | Bieu do lich su cuoc goi + audio/file | Chi list cuoc goi | Call statistics khac hoan toan | Khac biet |
| 12 | Block | 1 cap do bao ve, nhap nhanh tu lich su | Nhieu cap do bao ve | Khong co cap do, co Busy Mode | Khac biet |
| 13 | Incoming Call Noti | UI khac hoan toan | UI khac hoan toan | UI khac hoan toan | Khac biet |
| 14 | Full Call Screen | UI khac hoan toan | UI khac hoan toan | UI khac hoan toan | Khac biet |
| 15 | In-call Fullscreen | UI khac | UI khac | UI khac | Khac biet |
| 16 | Message Noti | Khong cho delete tu noti | Cho delete tu noti | Khong co | Khac biet |
| 17 | Setting | DND, Caller ID, Sound & notification | Chi tinh nang co ban | WhatsApp CallerID, theme, language | Khac biet |

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-002 | TSI-003 | UPLOAD | EMP-004 | {"file":"CallerID_vs_Truecaller_vs_Showcaller_UIX_v1.pdf","screens":17} | 2026-03-24 10:30 |
| TSEV-003 | TSI-003 | APPROVE | EMP-004 | {"note":"Da upload du 17 man hinh so sanh voi 2 doi thu"} | 2026-03-24 11:00 |

| TSI-003 status -> **COMPLETED** |

---

### Buoc 2.6 (lan 1): Chuyen Phase LF211 -> LF212 (Ra soat UI/UX)

> TSI-002 (LF211) = COMPLETED. Tao TSI-004 (LF212) + TSI-005 (LF212.1).
> Assign TiepTA (LEGAL_APPROVER).

**TSI tao moi:**

| tsi_id | tst_id | myParentTask | title | status | assigned_to | created_at |
|--------|--------|--------------|-------|--------|-------------|------------|
| **TSI-004** | TST-004 (LF212) | TSI-001 | > Ra soat UI/UX | IN_PROGRESS | NULL | 2026-03-24 11:00 |
| **TSI-005** | TST-005 (LF212.1) | TSI-004 | > Doi chieu man hinh | IN_PROGRESS | **EMP-001 (TiepTA)** | 2026-03-24 11:00 |

---

### Buoc: TiepTA xu ly LF212.1 — Doi chieu man hinh (du lieu thuc)

> TiepTA mo ban so sanh 17 man hinh, doi chieu tung man hinh.
> **Ket luan thuc te tu LF213**: Ca 17 man hinh deu co UI khac biet hoan toan giua 3 app.
> Tuy nhien, **Splash screen** va **Language First Open** co UX flow tuong tu -> can luu y.

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-004 | TSI-005 | COMMENT | EMP-001 | {"note":"17/17 man hinh: UI layout, icon, color deu khac biet. Splash co animation khac. Tutorial flow tuong tu (3 man) nhung content/image khac."} | 2026-03-24 14:00 |
| TSEV-005 | TSI-005 | APPROVE | EMP-001 | {"result":"PASS","screens_checked":17,"pass":15,"warning":2,"fail":0,"warnings":["Splash: animation flow tuong tu Showcaller","Tutorial: 3 man flow tuong tu nhung image khac"]} | 2026-03-24 15:00 |

| TSI-005 status -> **COMPLETED** |

---

### Buoc: TiepTA xu ly LF212.2 — Kiem tra Asset

> TSI-006 tao tu TNT-005 (LF212.1 -> LF212.2). Assign TiepTA.

**TDI:**

| tdi_id | tdt_id | tsi_id | file_name | uploaded_by | uploaded_at |
|--------|--------|--------|-----------|-------------|------------|
| TDI-002 | TDT-002 (ASSET_LIST) | TSI-006 | CallerID_AssetList_v1.xlsx | EMP-001 | 2026-03-24 16:00 |

> Ket qua: Tat ca asset (icon, hinh nen, am thanh) deu tu san xuat hoac free license. Khong co asset "khong ro nguon".

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-006 | TSI-006 | UPLOAD | EMP-001 | {"file":"CallerID_AssetList_v1.xlsx"} | 2026-03-24 16:00 |
| TSEV-007 | TSI-006 | APPROVE | EMP-001 | {"result":"PASS","note":"100% asset: Tu SX hoac Free license. 0 asset khong ro nguon."} | 2026-03-24 17:00 |

| TSI-006 status -> **COMPLETED** |

---

### Buoc: TiepTA xu ly LF212.3 — Kiem tra anh AI

> TSI-007 tao tu TNT-006. Assign TiepTA.
> Ket qua: App khong su dung anh AI-generated. Khong co rui ro.

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-008 | TSI-007 | APPROVE | EMP-001 | {"result":"PASS","note":"App khong dung anh AI-gen. Khong can kiem tra Google Reverse Image."} | 2026-03-25 09:30 |

| TSI-007 status -> **COMPLETED** |

---

### Buoc: TiepTA xu ly LF212.4 — Doi chieu chinh sach Store

> TSI-008 tao tu TNT-007. Assign TiepTA.
> Doi chieu voi: Google Play IP Policy + Apple App Store Guidelines 5.2.

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-009 | TSI-008 | COMMENT | EMP-001 | {"note":"Google Play IP Policy: OK - ten/icon khong gay nham lan. Apple Guidelines 5.2: OK - khong yeu cau bang chung SHTT bo sung."} | 2026-03-25 10:00 |
| TSEV-010 | TSI-008 | APPROVE | EMP-001 | {"result":"PASS","google_play":"OK","apple_5.2":"OK"} | 2026-03-25 11:00 |

| TSI-008 status -> **COMPLETED** |

---

### Buoc: TiepTA xu ly LF212.5 — Tong hop & phan hoi (du lieu thuc tu LF213)

> TSI-009 tao tu TNT-008. Day la buoc cuoi cua Phase LF212.
> TiepTA tong hop ket qua 17 man hinh + asset + AI + Store policy.

**TDI — Bao cao ket qua (TDTP: LF213-Copyright-Bao_cao_ket_qua.md):**

| tdi_id | tdt_id | tsi_id | file_name | uploaded_by | uploaded_at |
|--------|--------|--------|-----------|-------------|------------|
| TDI-003 | TDT-004 (COPYRIGHT_REPORT) | TSI-009 | CallerID_Copyright_Report_FINAL.pdf | EMP-001 | 2026-03-25 14:30 |

> **Noi dung bao cao** (trich tu LF213 thuc te):

| Hang muc | Ket qua | Chi tiet |
|----------|---------|---------|
| App Icon | **PASS** | 3 app deu dung hinh dien thoai + mau xanh nhung phong cach thiet ke khac (Truecaller gradient, CallerID don gian trang, Showcaller don gian xanh) |
| UI/UX 17 man hinh | **PASS (15)** + WARNING (2) | 15/17 man hinh khac biet hoan toan. 2 warning: Splash animation tuong tu Showcaller, Tutorial 3-man flow tuong tu |
| Asset | **PASS** | 100% tu SX hoac free license |
| AI Image | **PASS** | Khong su dung anh AI-generated |
| Google Play Policy | **PASS** | Khong vi pham IP Policy |
| Apple Guidelines 5.2 | **PASS** | Khong can bang chung SHTT bo sung |
| **TONG KET** | **PASS** | App co the publish. Luu y: dieu chinh Splash animation de giam tuong dong voi Showcaller |

> **Du lieu thi truong** (tu LF213 thuc te):

| Metric | Truecaller | Caller ID (Apero) | Showcaller |
|--------|-----------|-------------------|------------|
| Release date | 31/05/2012 | 19/09/2023 | 23/09/2015 |
| Rating | 4.7 star | Open testing | 4.4 star |
| Reviews | 22M | Open testing | 174,000 |
| Top market | Unknown | India, Egypt, Iraq | India, Saudi Arabia, UAE |
| Countries | Unknown | 231 | 220 |
| All users | Unknown | 32,224,338 | 6,072,666 |

**TSEV:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-011 | TSI-009 | UPLOAD | EMP-001 | {"file":"CallerID_Copyright_Report_FINAL.pdf"} | 2026-03-25 14:30 |
| TSEV-012 | TSI-009 | APPROVE | EMP-001 | {"result":"PASS","summary":"15 PASS, 2 WARNING, 0 FAIL. App co the publish."} | 2026-03-25 15:00 |

| TSI-009 status -> **COMPLETED** |

---

### Buoc 2.7: Workflow ket thuc

> TSI-009 (LF212.5) COMPLETED -> khong con TNT nao
> -> TSI-004 (LF212) = COMPLETED (tat ca 5 TSI L3 con da COMPLETED)
> -> TSI-001 (LF210) = COMPLETED (khong con Phase nao sau LF212)

**TSEV cuoi:**

| tsev_id | tsi_id | event_type | emp_id | event_data | created_at |
|---------|--------|------------|--------|------------|------------|
| TSEV-013 | TSI-001 | UPDATE | SYSTEM | {"note":"Workflow completed. Result: PASS. App Caller ID (APB648) approved for publishing."} | 2026-03-25 15:00 |

---

## A.3 Tong hop toan bo du lieu sau khi workflow ket thuc

### Bang TSI - Tong 9 dong cho 1 luot CopyrightReview

| tsi_id | Level | tst_code | myParentTask | status | assigned_to |
|--------|-------|----------|--------------|--------|-------------|
| TSI-001 | L1 | LF210 | NULL | COMPLETED | - |
| TSI-002 | L2 | LF211 | TSI-001 | COMPLETED | - |
| TSI-003 | L3 | LF211.1 | TSI-002 | COMPLETED | EMP-004 (MinhPT) |
| TSI-004 | L2 | LF212 | TSI-001 | COMPLETED | - |
| TSI-005 | L3 | LF212.1 | TSI-004 | COMPLETED | EMP-001 (TiepTA) |
| TSI-006 | L3 | LF212.2 | TSI-004 | COMPLETED | EMP-001 (TiepTA) |
| TSI-007 | L3 | LF212.3 | TSI-004 | COMPLETED | EMP-001 (TiepTA) |
| TSI-008 | L3 | LF212.4 | TSI-004 | COMPLETED | EMP-001 (TiepTA) |
| TSI-009 | L3 | LF212.5 | TSI-004 | COMPLETED | EMP-001 (TiepTA) |

**Cay quan he myParentTask:**
```
TSI-001 (L1: LF210 Copyright) ── COMPLETED
├── TSI-002 (L2: LF211 Input) ── COMPLETED
│   └── TSI-003 (L3: LF211.1 Chuan bi) ── COMPLETED ── PIC: MinhPT
│
└── TSI-004 (L2: LF212 Ra soat) ── COMPLETED
    ├── TSI-005 (L3: LF212.1 Doi chieu) ── COMPLETED ── PIC: TiepTA
    ├── TSI-006 (L3: LF212.2 Asset) ── COMPLETED ── PIC: TiepTA
    ├── TSI-007 (L3: LF212.3 AI) ── COMPLETED ── PIC: TiepTA
    ├── TSI-008 (L3: LF212.4 Store) ── COMPLETED ── PIC: TiepTA
    └── TSI-009 (L3: LF212.5 Tong hop) ── COMPLETED ── PIC: TiepTA
```

### Bang TSEV - Tong **13** dong event log

| tsev_id | tsi_id | event_type | emp_id | Noi dung chinh | created_at |
|---------|--------|------------|--------|---------------|------------|
| TSEV-001 | TSI-001 | CREATE | EMP-004 (MinhPT) | Tao task CopyrightReview - Caller ID (APB648) | 2026-03-24 09:00 |
| TSEV-002 | TSI-003 | UPLOAD | EMP-004 (MinhPT) | Upload file so sanh 17 man hinh (vs Truecaller + Showcaller) | 2026-03-24 10:30 |
| TSEV-003 | TSI-003 | APPROVE | EMP-004 (MinhPT) | Da upload du tai lieu | 2026-03-24 11:00 |
| TSEV-004 | TSI-005 | COMMENT | EMP-001 (TiepTA) | 17/17 man hinh khac biet, 2 warning (Splash, Tutorial flow) | 2026-03-24 14:00 |
| TSEV-005 | TSI-005 | APPROVE | EMP-001 (TiepTA) | PASS: 15 pass, 2 warning, 0 fail | 2026-03-24 15:00 |
| TSEV-006 | TSI-006 | UPLOAD | EMP-001 (TiepTA) | Upload CallerID_AssetList_v1.xlsx | 2026-03-24 16:00 |
| TSEV-007 | TSI-006 | APPROVE | EMP-001 (TiepTA) | PASS: 100% asset tu SX hoac free license | 2026-03-24 17:00 |
| TSEV-008 | TSI-007 | APPROVE | EMP-001 (TiepTA) | PASS: Khong dung anh AI-gen | 2026-03-25 09:30 |
| TSEV-009 | TSI-008 | COMMENT | EMP-001 (TiepTA) | Google Play IP: OK. Apple 5.2: OK | 2026-03-25 10:00 |
| TSEV-010 | TSI-008 | APPROVE | EMP-001 (TiepTA) | PASS: Tuan thu ca 2 nen tang | 2026-03-25 11:00 |
| TSEV-011 | TSI-009 | UPLOAD | EMP-001 (TiepTA) | Upload CallerID_Copyright_Report_FINAL.pdf | 2026-03-25 14:30 |
| TSEV-012 | TSI-009 | APPROVE | EMP-001 (TiepTA) | PASS: 15 PASS, 2 WARNING, 0 FAIL. App co the publish | 2026-03-25 15:00 |
| TSEV-013 | TSI-001 | UPDATE | SYSTEM | Workflow completed. App Caller ID (APB648) approved | 2026-03-25 15:00 |

### Bang TDI - Tong **3** tai lieu

| tdi_id | tdt_code | TDTP ref | tsi_id | file_name | uploaded_by |
|--------|----------|----------|--------|-----------|-------------|
| TDI-001 | UI_COMPARISON | LF211-Mau_so_sanh_UIU | TSI-003 | CallerID_vs_Truecaller_vs_Showcaller_UIX_v1.pdf | EMP-004 (MinhPT) |
| TDI-002 | ASSET_LIST | (trong LF211) | TSI-006 | CallerID_AssetList_v1.xlsx | EMP-001 (TiepTA) |
| TDI-003 | COPYRIGHT_REPORT | LF213-Bao_cao_ket_qua | TSI-009 | CallerID_Copyright_Report_FINAL.pdf | EMP-001 (TiepTA) |

### Bang TSI_Filter - 9 TSI x 4 filters = **36** dong

| tsi_id | PT (AllocationToItem) | LE (fps_le) | CTY (AllocationToItem) | TUT (fps_tut) |
|--------|----------------------|-------------|----------------------|---------------|
| TSI-001 | APB648 | APERO-SG | IN | NORMAL |
| TSI-002 | APB648 | APERO-SG | IN | NORMAL |
| TSI-003 | APB648 | APERO-SG | IN | NORMAL |
| TSI-004 | APB648 | APERO-SG | IN | NORMAL |
| TSI-005 | APB648 | APERO-SG | IN | NORMAL |
| TSI-006 | APB648 | APERO-SG | IN | NORMAL |
| TSI-007 | APB648 | APERO-SG | IN | NORMAL |
| TSI-008 | APB648 | APERO-SG | IN | NORMAL |
| TSI-009 | APB648 | APERO-SG | IN | NORMAL |

---

## A.4 Thong ke

| Metric | Gia tri | Nguon du lieu thuc |
|--------|---------|-------------------|
| App | **Caller ID Spam Call & Message** | LF213-Copyright-Bao_cao_ket_qua.md |
| Product code | **APB648** | AllocationToItem_NativeTable (PT0->PT-S2) |
| Publisher | **APERO-SG** (Apero Tech Pte. Ltd.) | fps_le |
| Top market | **India** (IN) | AllocationToItem (CTY-S2->CTY0) + LF213 |
| Doi thu so sanh | **Truecaller** (4.7 star, 22M reviews) + **Showcaller** (4.4 star, 174K reviews) | LF213 |
| Man hinh so sanh | **17** man hinh | LF211 + LF213 |
| Ket qua | **PASS** (15 pass, 2 warning, 0 fail) | LF213 |
| Tong TSI | **9 dong** (1 L1 + 2 L2 + 6 L3) | - |
| Tong TSEV | **13 dong** | - |
| Tong TDI | **3 dong** (UI_Comparison + AssetList + Copyright_Report) | - |
| Tong TSI_Filter | **36 dong** (9 TSI x 4 filters: PT, LE, CTY, TUT) | - |
| Tong TRI su dung | **2 dong** (MinhPT=SUBMITTOR + TiepTA=LEGAL_APPROVER) | - |
| Thoi gian workflow | **2 ngay** (24/03 09:00 -> 25/03 15:00) | - |

---

# APPENDIX B: Bang tong hop Config cac quy trinh Legal

## B.1 Tong hop TST (TaskType) - Tat ca cac quy trinh

### LF210 - Copyright Check

| tst_id | Code | Name | Level | Parent | SLA |
|--------|------|------|-------|--------|-----|
| TST-001 | LF210 | Copyright Check | 1 | - | 5 days |
| TST-002 | LF211 | Input tai lieu UI/UX | 2 | LF210 | 1 day |
| TST-003 | LF211.1 | Chuan bi ban so sanh UI/UX | 3 | LF211 | 1 day |
| TST-004 | LF212 | Ra soat UI/UX | 2 | LF210 | 2 days |
| TST-005 | LF212.1 | Doi chieu man hinh | 3 | LF212 | 1 day |
| TST-006 | LF212.2 | Kiem tra Asset | 3 | LF212 | 1 day |
| TST-007 | LF212.3 | Kiem tra anh AI | 3 | LF212 | 1 day |
| TST-008 | LF212.4 | Doi chieu chinh sach Store | 3 | LF212 | 1 day |
| TST-009 | LF212.5 | Tong hop & phan hoi | 3 | LF212 | 1 day |

### LF220 - Trademark Check

| tst_id | Code | Name | Level | Parent | SLA |
|--------|------|------|-------|--------|-----|
| TST-010 | LF220 | Trademark Check | 1 | - | 3 days |
| TST-011 | LF221 | Input Trademark details | 2 | LF220 | 1 day |
| TST-012 | LF221.1 | Gui ten app, icon, keywords | 3 | LF221 | 1 day |
| TST-013 | LF222 | Ra soat Trademark | 2 | LF220 | 1 day |
| TST-014 | LF222.1 | Tra cuu WIPO | 3 | LF222 | 1 day |
| TST-015 | LF222.2 | Tra cuu USPTO | 3 | LF222 | 1 day |
| TST-016 | LF222.3 | Tra cuu Cuc SHTT VN | 3 | LF222 | 1 day |
| TST-017 | LF222.4 | Tra cuu Google Search | 3 | LF222 | 1 day |
| TST-018 | LF222.5 | Tra cuu WIPO Image (icon) | 3 | LF222 | 1 day |
| TST-019 | LF222.6 | Tra cuu Google Reverse Image | 3 | LF222 | 1 day |
| TST-020 | LF222.7 | Tong hop & phan hoi Product | 3 | LF222 | 1 day |

### LF230 - Policy (PP & TOS)

| tst_id | Code | Name | Level | Parent | SLA |
|--------|------|------|-------|--------|-----|
| TST-021 | LF230 | Policy (PP & TOS) | 1 | - | 8 days |
| TST-022 | LF231 | Input Forms | 2 | LF230 | 1 day |
| TST-023 | LF231.1 | Dien form data & permission | 3 | LF231 | 1 day |
| TST-024 | LF232 | Soan PP & TOS | 2 | LF230 | 2 days |
| TST-025 | LF232.1 | Ra soat Form | 3 | LF232 | 1 day |
| TST-026 | LF232.2 | Doi chieu phap ly | 3 | LF232 | 1 day |
| TST-027 | LF232.3 | Soan Privacy Policy | 3 | LF232 | 1 day |
| TST-028 | LF232.4 | Soan Term of Service | 3 | LF232 | 1 day |
| TST-029 | LF232.5 | Gui draft Product | 3 | LF232 | 1 day |
| TST-030 | LF233 | Nghiem thu PP & TOS | 2 | LF230 | 3 days |
| TST-031 | LF233.1 | Product nghiem thu | 3 | LF233 | 3 days |
| TST-032 | LF234 | Dang len Store | 2 | LF230 | 3 days |
| TST-033 | LF234.1 | Dang PP & TOS len CH Play / App Store | 3 | LF234 | 1 day |

### LF240 - Contract Review (Hop dong doi tac)

| tst_id | Code | Name | Level | Parent | SLA |
|--------|------|------|-------|--------|-----|
| TST-034 | LF240 | Contract Review | 1 | - | 15 days |
| TST-035 | LF241 | Gui yeu cau soat xet HD | 2 | LF240 | 1 day |
| TST-036 | LF241.1 | Dien Google Form soat xet HD | 3 | LF241 | 1 day |
| TST-037 | LF242 | Xac nhan dau vao | 2 | LF240 | 1 day |
| TST-038 | LF242.1 | Kiem tra tinh day du form | 3 | LF242 | 1 day |
| TST-039 | LF243 | Ra soat chi tiet hop dong | 2 | LF240 | 2 days |
| TST-040 | LF243.1 | Ra soat hop le | 3 | LF243 | 1 day |
| TST-041 | LF243.1.1 | Xac minh phap nhan/ca nhan | 3 | LF243 | 1 day |
| TST-042 | LF243.2 | Ke toan ra soat thanh toan | 3 | LF243 | 2 days |
| TST-043 | LF243.3 | Gui feedback tong hop | 3 | LF243 | 1 day |
| TST-044 | LF243.4 | Hieu chinh HD | 3 | LF243 | 3 days |
| TST-045 | LF244 | Final Check | 2 | LF240 | 1 day |
| TST-046 | LF244.1 | Legal kiem tra ban cuoi | 3 | LF245 | 1 day |
| TST-047 | LF245 | Trinh ky phe duyet | 2 | LF240 | 3 days |
| TST-048 | LF245.1 | Day chuyen phe duyet (7 buoc) | 3 | LF245 | 3 days |
| TST-049 | LF246 | Luu tru & ma hoa HD | 2 | LF240 | 1 day |
| TST-050 | LF246.1 | Luu folder + cap nhat tracking | 3 | LF246 | 1 day |
| TST-051 | LF247 | Theo doi & nhac gia han | 2 | LF240 | ongoing |
| TST-052 | LF247.1 | Kiem tra HD sap het han | 3 | LF247 | monthly |

---

## B.2 Tong hop TNT (TaskNextType) - LF240 Contract (phuc tap nhat)

| tnt_id | From (TST) | To (TST) | Condition | Note |
|--------|-----------|----------|-----------|------|
| TNT-040-01 | LF240 | LF241 | NULL | Auto |
| TNT-040-02 | LF241 | LF241.1 | NULL | Auto |
| TNT-040-03 | LF241.1 | LF242 | NULL | Khi gui xong |
| TNT-040-04 | LF242 | LF242.1 | NULL | Auto |
| TNT-040-05 | LF242.1 | LF243 | `form_complete = true` | Du thong tin |
| TNT-040-06 | LF242.1 | LF241 | `form_complete = false` | **Quay lai** bo sung |
| TNT-040-07 | LF243 | LF243.1 | NULL | Auto |
| TNT-040-08 | LF243.1 | LF243.1.1 | NULL | Auto (song song voi LF243.2) |
| TNT-040-09 | LF243.1 | LF243.2 | NULL | **Song song** voi LF243.1.1 |
| TNT-040-10 | LF243.1.1 + LF243.2 | LF243.3 | `all_reviews_done = true` | **JOIN** khi ca 2 xong |
| TNT-040-11 | LF243.3 | LF243.4 | `has_changes = true` | Co diem can chinh |
| TNT-040-12 | LF243.3 | LF244 | `has_changes = false` | Khong can chinh -> Final |
| TNT-040-13 | LF243.4 | LF243.3 | `round_count < 3` | **Vong dam phan tiep** |
| TNT-040-14 | LF243.4 | LF244 | `all_agreed = true` | Thong nhat xong |
| TNT-040-15 | LF243.4 | ESCALATE_BOD | `round_count >= 3` | **Escalate** len BOD |
| TNT-040-16 | LF244 | LF244.1 | NULL | Auto |
| TNT-040-17 | LF244.1 | LF245 | NULL | Final check OK |
| TNT-040-18 | LF245 | LF245.1 | NULL | Auto |
| TNT-040-19 | LF245.1 | LF246 | NULL | Ky xong |
| TNT-040-20 | LF246 | LF246.1 | NULL | Auto |
| TNT-040-21 | LF246.1 | LF247 | NULL | HD dang hieu luc |
| TNT-040-22 | LF247 | LF247.1 | NULL | Dinh ky |
| TNT-040-23 | LF247.1 | END | `expired_or_terminated` | Ket thuc |
| TNT-040-24 | LF247.1 | LF240 (new TSI) | `needs_renewal` | **Tao task moi** gia han |

---

## B.3 Tong hop TRT (TaskRoleType)

| trt_id | trt_code | trt_name | Ap dung cho TST | Mo ta |
|--------|----------|----------|-----------------|-------|
| TRT-001 | SUBMITTOR | Nguoi gui yeu cau | LF211.1, LF221.1, LF231.1, LF241.1 | Product/ASO/Bo phan de xuat |
| TRT-002 | LEGAL_APPROVER | Nguoi ra soat phap ly | LF212.*, LF222.*, LF232.*, LF243.*, LF244.*, LF246.* | Legal Team |
| TRT-003 | FINANCE_APPROVER | Nguoi ra soat tai chinh | LF243.2, LF245.1 (step 3) | Ke toan |
| TRT-004 | TEAM_APPROVER | Nguoi phe duyet | LF233.1, LF245.1 (step 4-7) | Tro ly GD, BOD, CEO, Hanh chinh |

---

## B.4 Tong hop TDT (TaskDocType) + TDTP File Mapping

| tdt_id | tdt_code | tdt_name | Ap dung TST | Req | TDTP (tdtp_id) |
|--------|----------|----------|-------------|-----|-------------------------------|
| TDT-001 | UI_COMPARISON | Ban so sanh UI/UX | LF211.1 | Y | **LF211-Copyright-Mau_so_sanh_UIU.md** |
| TDT-002 | ASSET_LIST | Danh sach asset | LF212.2 | Y | *(trong LF211)* |
| TDT-003 | AI_IMAGE | File anh AI-gen | LF212.3 | N | - |
| TDT-004 | COPYRIGHT_REPORT | Bao cao ket qua ra soat CR | LF212.5 | Y | **LF213-Copyright-Bao_cao_ket_qua.md** |
| TDT-005 | APP_INFO | Thong tin app (ten, icon, keywords) | LF221.1 | Y | - |
| TDT-006 | TM_SEARCH_RESULT | Ket qua tra cuu Trademark | LF222.1-6 | Y | - |
| TDT-007 | TRADEMARK_REPORT | Bao cao ket qua ra soat TM | LF222.7 | Y | **LF222-Bao_cao_gui_Product.md** |
| TDT-008 | PERMISSION_FORM | Form permission & data | LF231.1 | Y | **LF231-Policy-Form_Data_&Permis.md** |
| TDT-009 | PP_DRAFT | Privacy Policy draft | LF232.3 | Y | **LF233-Template_PP_&TOS.md** |
| TDT-010 | TOS_DRAFT | Term of Service draft | LF232.4 | Y | **LF233-Template_PP_&TOS.md** |
| TDT-011 | PP_TOS_FINAL | PP & TOS da duyet | LF233.1 | Y | - |
| TDT-012 | CONTRACT_REVIEW_FORM | Form soat xet hop dong | LF241.1 | Y | *(LF241-Google Form)* |
| TDT-013 | CONTRACT_DRAFT | Hop dong draft (doi tac gui) | LF241.1, LF243 | Y | - |
| TDT-014 | LEGAL_FEEDBACK | Feedback phap ly (Google Doc) | LF243.3 | Y | - |
| TDT-015 | FINANCE_FEEDBACK | Feedback tai chinh | LF243.2 | Y | - |
| TDT-016 | CONTRACT_FINAL | Hop dong ban cuoi (Word + PDF) | LF244.1 | Y | - |
| TDT-017 | SIGNED_CONTRACT | Hop dong da ky (PDF + dau) | LF245.1 | Y | - |
| TDT-018 | CCCD_PHOTO | Anh CCCD 2 mat | LF243.1.1 | Y | - |

> **Ghi chu**: Cac TDTP file `.md` nam trong thu muc `Legal_md/`. Moi file da duoc bo sung metadata (thong tin chung, cau truc bang, 5 dong du lieu mau).

---

## B.5 Thong ke tong hop

| Entity | So luong | Ghi chu |
|--------|---------|---------|
| **TST** | 52 | 4 L1 + 16 L2 + 32 L3 |
| **TNT** | ~50 | LF210: 8, LF220: ~10, LF230: ~10, LF240: 24 |
| **TRT** | 4 | SUBMITTOR, LEGAL, FINANCE, TEAM |
| **TDT** | 18 | Across all 4 processes |
| **TDTP Files** | **6 da co** + 4 can tao | Bieu mau thuc te mapping vao TDT. Xem Section 8. |
| **EMP** | ~50 | Legal + Product + ASO + Ke toan + BOD |
| **TSI per workflow** | 7-15 dong | Tuy phuc tap cua quy trinh |
| **TSEV per workflow** | 10-30 dong | Tuy so buoc + comment |
| **TDI per workflow** | 2-10 dong | Tuy so tai lieu |

---

# 8. TDTP - TaskDocTypeTemplate (Bieu mau con cua quy trinh)

> **TDTP** la cac file bieu mau/template thuc te duoc su dung trong tung buoc cua workflow.
> Moi TDTP tuong ung voi 1 hoac nhieu TDT (TaskDocType) trong workflow engine.
> Cac file TDTP nam tai: `Legal_md/`

## 8.1 Tong hop TDTP Files

| # | TDTP File | Quy trinh | TDT tuong ung | Nguoi tao | Nguoi nhan | Muc dich |
|---|---------|-----------|---------------|-----------|------------|----------|
| 1 | **LF211-Copyright-Mau_so_sanh_UIU.md** | LF210 > LF211 | UI_COMPARISON (TDT-001) | Product/ASO | Legal | Bang so sanh UI/UX giua app Apero va doi thu. So sanh tung man hinh: layout, icon, mau sac, UX flow. |
| 2 | **LF213-Copyright-Bao_cao_ket_qua.md** | LF210 > LF212.5 | COPYRIGHT_REPORT (TDT-004) | Legal | Product/ASO | Bao cao ket qua ra soat copyright: danh gia Pass/Can sua/Fail cho tung man hinh + ly do phap ly. |
| 3 | **LF222-Bao_cao_gui_Product.md** | LF220 > LF222.7 | TRADEMARK_REPORT (TDT-007) | Legal | Product/ASO | Bao cao ket qua tra cuu trademark: App Name check + App Icon check, ket qua WIPO/USPTO/SHTT VN. |
| 4 | **LF231-Policy-Form_Data_&Permis.md** | LF230 > LF231 | PERMISSION_FORM (TDT-008) | Product+Dev | Legal | Form liet ke permission (quyen truy cap) va data (du lieu thu thap). Input bat buoc de soan PP/TOS. |
| 5 | **LF233-Template_PP_&TOS.md** | LF230 > LF232 | PP_DRAFT (TDT-009), TOS_DRAFT (TDT-010) | Legal | Product > ASO | Kho template PP & TOS chuan Apero: PP Chung, PP Suc khoe, PP Dating, TOS Chung, TOS Suc khoe. |
| 6 | **LF230_B7_Privacy_Policy_&_Terms_of_Service.md** | LF230 (tham khao) | *(Training material)* | Legal | Legal Intern | Slide dao tao 34 trang: dinh nghia PP/TOS, yeu cau Google/Apple, 7 loi pho bien, quy trinh 5 buoc. |

## 8.2 Mapping TDTP -> Workflow (TDT lien ket vao TST step nao)

```
LF210-Copyright
├── LF211-Input tai lieu
│   └── LF211.1: Product tao ban so sanh ──> TDTP: LF211-Mau_so_sanh_UIU.md (TDT-001)
├── LF212-Ra soat UI/UX
│   ├── LF212.2: Legal kiem tra asset ──> (asset list trong LF211)
│   ├── LF212.3: Legal kiem tra AI ──> (khong co TDTP rieng)
│   └── LF212.5: Legal tong hop ──> TDTP: LF213-Bao_cao_ket_qua.md (TDT-004)

LF220-Trademark
├── LF221-Input Trademark details ──> (Product gui truc tiep, khong co TDTP)
├── LF222-Ra soat Trademark
│   └── LF222.7: Legal tong hop ──> TDTP: LF222-Bao_cao_gui_Product.md (TDT-007)

LF230-Policy
├── LF231-Input Forms
│   └── LF231.1: Product+Dev dien form ──> TDTP: LF231-Form_Data_&Permis.md (TDT-008)
├── LF232-Soan PP & TOS
│   ├── LF232.3: Legal soan PP ──> TDTP: LF233-Template_PP_&TOS.md (TDT-009)
│   └── LF232.4: Legal soan TOS ──> TDTP: LF233-Template_PP_&TOS.md (TDT-010)
├── (Tham khao) ──> TDTP: LF230_B7-Training_PP_TOS.md

LF240-Contract
├── LF241-Gui yeu cau ──> (Google Form, chua co TDTP md)
├── LF243-Ra soat ──> (Google Doc feedback, chua co TDTP md)
```

## 8.3 Chi tiet tung TDTP File

### TDTP-01: LF211-Copyright-Mau_so_sanh_UIU.md

| Thuoc tinh | Gia tri |
|------------|---------|
| Quy trinh | LF210 > LF211 > LF211.1 |
| TDT | UI_COMPARISON (TDT-001) |
| Nguoi tao | Product/ASO |
| Input | Screenshot app Apero + screenshot doi thu |
| Output | Bang so sanh tung man hinh |

**Cau truc:**

| Cot | Mo ta |
|-----|-------|
| Man hinh / Tinh nang | Home, Search, Setting, Onboarding, Call screen... |
| Description | Mo ta giong/khac nhau (song ngu Viet-Anh) |
| App Apero | Screenshot |
| App doi thu 1 | Screenshot |
| App doi thu 2 | Screenshot (neu co) |

**5 dong mau:**

| Man hinh | Mo ta tom tat | Apero | Doi thu 1 | Doi thu 2 |
|----------|--------------|-------|-----------|-----------|
| App Icon | Icon hinh dien thoai, mau xanh. Apero: nen trang. Doi thu: gradient. | [img] | [img] | [img] |
| Language | Apero: man rieng. Doi thu: popup trong tutorial. | [img] | [img] | [img] |
| Home | Apero: lich su goi theo ngay. Doi thu: call frequency list. | [img] | [img] | - |
| Search | Apero: tim theo so + filter quoc gia. Doi thu: tim ca ten va so. | [img] | [img] | [img] |
| Block | Apero: 1 cap do bao ve. Doi thu: nhieu cap do. | [img] | [img] | [img] |

---

### TDTP-02: LF222-Bao_cao_gui_Product.md

| Thuoc tinh | Gia tri |
|------------|---------|
| Quy trinh | LF220 > LF222 > LF222.7 |
| TDT | TRADEMARK_REPORT (TDT-007) |
| Nguoi tao | Legal Team |
| Input | Ket qua tra cuu LF222.1-6 |
| Output | Bao cao PASS/FAIL gui Product |

**Cau truc 2 phan:**

**Phan 1 - App Name:**

| STT | Appname | Legal check | Ket qua | Uu tien | Doi chung |
|-----|---------|-------------|---------|---------|-----------|

**Phan 2 - App Icon:**

| STT | Logo | Legal check | Ket qua | Logo doi thu |
|-----|------|-------------|---------|--------------|

**5 dong mau (App Name):**

| STT | Appname | Legal check | Ket qua | Uu tien |
|-----|---------|-------------|---------|---------|
| 1 | ITry: TryOn Hair & Outfits with AI | Chua co TM nhom 9, 42 | Co the su dung | 1 |
| 2 | ITryAI: TryOn Hair & Outfits with AI | Chua co TM nhom 9 | Co the su dung | 2 |
| 3 | FaceSwap AI | Co TM "FaceSwap" tai My, nhom 9 - Active | Khong the su dung | - |
| 4 | PhotoMagic Editor | Chua co TM tai WIPO/USPTO/VN | Co the su dung | 1 |
| 5 | CallerID Pro | Co TM "CallerID" nhom 9 tai EU | Can xem xet | 3 |

---

### TDTP-03: LF231-Policy-Form_Data_&Permis.md

| Thuoc tinh | Gia tri |
|------------|---------|
| Quy trinh | LF230 > LF231 > LF231.1 |
| TDT | PERMISSION_FORM (TDT-008) |
| Nguoi tao | Product + Dev |
| Input | Thong tin tinh nang app + danh sach SDK |
| Output | Form day du de Legal soan PP/TOS |

**Cau truc:**

| STT | Permission | Sensitive | Description |
|-----|-----------|-----------|-------------|

**5 dong mau:**

| STT | Permission | Sensitive | Description |
|-----|-----------|-----------|-------------|
| 1 | android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS | True | App chay ngam khong bi gioi han boi che do tiet kiem pin |
| 2 | android.permission.CAMERA | True | Truy cap camera de chup anh (tinh nang try-on AI) |
| 3 | android.permission.READ_CONTACTS | True | Doc danh ba de nhan dien so goi den (Caller ID) |
| 4 | android.permission.INTERNET | False | Ket noi internet cho cac tinh nang online |
| 5 | android.permission.VIBRATE | False | Rung thiet bi khi co cuoc goi den / tin nhan |

---

### TDTP-04: LF233-Template_PP_&TOS.md

| Thuoc tinh | Gia tri |
|------------|---------|
| Quy trinh | LF230 > LF232.3, LF232.4 |
| TDT | PP_DRAFT (TDT-009), TOS_DRAFT (TDT-010) |
| Nguoi tao | Legal Team |
| Loai template | 3 PP (Chung, Suc khoe, Dating) + 2 TOS (Chung, Suc khoe) |

**Cau truc PP (10 muc chinh):**

| # | Muc | Noi dung |
|---|-----|---------|
| 1 | Thong tin cong ty | Ten, dia chi, email publisher |
| 2 | Du lieu thu thap & muc dich | Liet ke PII, device info, usage data |
| 3 | Quyen truy cap | Camera, Mic, Location, Contacts + ly do |
| 4 | Cach thu thap | Tu dong / nguoi dung / SDK |
| 5 | Chia se ben thu 3 | Firebase, AdMob, Facebook SDK |
| 6 | Bien phap bao mat | Ma hoa, thoi gian luu giu |
| 7 | Quyen nguoi dung | Xem, sua, xoa, rut dong y |
| 8 | Chinh sach tre em | COPPA, gioi han do tuoi |
| 9 | Thay doi chinh sach | Cach thong bao update |
| 10 | Lien he | Email ho tro |

**Cau truc TOS (11 muc chinh):**

| # | Muc | Noi dung |
|---|-----|---------|
| 1 | Thong tin cong ty | Ten, dia chi |
| 2 | Chap nhan dieu khoan | Do tuoi toi thieu |
| 3 | Mo ta dich vu | Chuc nang app |
| 4 | Tai khoan nguoi dung | Dang ky, bao mat, khoa/xoa |
| 5 | Quyen SHTT | Ban quyen, thuong hieu |
| 6 | Hanh vi bi cam | Spam, lua dao |
| 7 | Thanh toan & Subscription | Gia, gia han, hoan tien |
| 8 | Gioi han trach nhiem | Mien tru loi he thong |
| 9 | Disclaimer | AI/suc khoe: chi tham khao |
| 10 | Cham dut | Dieu kien, hau qua |
| 11 | Luat ap dung | Co quan giai quyet tranh chap |

---

### TDTP-05: LF230_B7-Training_PP_TOS.md

| Thuoc tinh | Gia tri |
|------------|---------|
| Quy trinh | LF230 (Tai lieu tham khao, dao tao) |
| Loai | Training Slide (34 slides) |
| Doi tuong | Legal Intern |

**Tom tat noi dung:**

| Nhom | Slides | Noi dung |
|------|--------|---------|
| Gioi thieu | 1-3 | Muc tieu, doi tuong |
| Tai sao PP & TOS | 4-6 | Duyet app nhanh, giam rui ro, tuan thu da nen tang |
| Dinh nghia | 8-13 | PP la gi, TOS la gi, so sanh PP vs TOS |
| Loi pho bien | 16-23 | 7 loi: thieu du lieu, khong cap nhat, sao chep, thieu bao ve, thieu disclaimer, do tuoi, phoi hop |
| Quy trinh Apero | 25-30 | 5 buoc: Chuan bi > Gui yeu cau > Soan thao > Nghiem thu > Dang tai |
| Thuc hanh | 31-33 | 3 tinh huong: AI Chatbot, Wellness, Dating |

---

## 8.4 TDTP con thieu (can bo sung)

| Quy trinh | Buoc | TDTP can tao | Mo ta |
|-----------|------|------------|-------|
| LF220 | LF222.1-6 | LF222-Checklist_tra_cuu_TM.md | Checklist cac nguon tra cuu (WIPO, USPTO, SHTT VN, Google) voi ket qua tung keyword |
| LF240 | LF241.1 | LF241-Form_soat_xet_HD.md | Google Form soat xet hop dong (ten HD, gia tri, thoi han, muc dich, file dinh kem) |
| LF240 | LF243.3 | LF243-Feedback_phap_ly_template.md | Template Google Doc feedback phap ly (dieu khoan rui ro, de xuat chinh sua) |
| LF240 | LF246.1 | LF246-Ma_hoa_HD_template.md | Quy tac ma hoa hop dong (ddmmyy/Ten-Cty-DoiTac) + tracking sheet |

---

# 9. v6 Changes - SQLite, APPROVED, Inline Review, Role UI

> Cap nhat ngay: 2026-03-26
> Tong hop tat ca thay doi tu phien lam viec 25-26/03/2026

## 9.1 Chuyen tu In-Memory sang SQLite

**Truoc (v5):** Tat ca repository dung `dict[str, Model]` hoac `list[Model]` trong RAM. Mat du lieu khi restart.

**Sau (v6):** Dung SQLite file (`legal.db`), data persist qua restart.

| Thanh phan | Chi tiet |
|-----------|---------|
| File DB | `legal-workflow-be/legal.db` (auto-created) |
| Module | `src/config/database.py` - shared connection, schema, `reset_db()` |
| So table | 14: tst, tnt, tdt, tdtp, trt, tst_trt, emp, tsi, tsi_counter, tdi, tsev, tri, tsi_filter, tst_filter, tst_tdt |
| Seed | Chi chay 1 lan (check `table_has_data()` truoc khi seed) |
| Test | Dung `reset_db(":memory:")` de isolate moi test |
| Repository | 12 file rewritten: tst, tnt, emp, tsi, tdi, tsev, tri, trt, tdt, tdtp, tsi_filter, filters |

## 9.2 APPROVED Status Flow

**Truoc (v5):** Approve L3 → status = COMPLETED (nhay thang).

**Sau (v6):** Approve L3 → status = **APPROVED** (workflow engine xem APPROVED nhu "done" de chuyen step tiep).

**Status Machine (v6):**

```
DRAFT       → IN_PROGRESS, CANCELLED
IN_PROGRESS → COMPLETED, APPROVED, REJECTED, CANCELLED, PENDING_REVIEW
PENDING     → IN_PROGRESS, APPROVED, REJECTED, CANCELLED
PENDING_REVIEW → APPROVED, REJECTED
APPROVED    → COMPLETED
REJECTED    → IN_PROGRESS, CANCELLED
COMPLETED   → (terminal)
CANCELLED   → (terminal)
```

**Luong approve:**
1. PENDING → (auto) IN_PROGRESS → APPROVED (khi admin nhan Approve)
2. Workflow engine check APPROVED || COMPLETED de chuyen buoc

**Luong reject:**
1. PENDING → (auto) IN_PROGRESS → REJECTED (khi admin nhan Reject)

## 9.3 Document + Event Aggregation tu Tree

**Truoc (v5):** GET task detail chi query documents/events cho 1 `tsi_id`.

**Sau (v6):** Gom tu **toan bo cay TSI** (L1 + tat ca L2 + tat ca L3).

```
GET /api/legal/task/{tsi_id}

1. _collect_tree_tsi_ids(tsi) → [L1_id, L2a_id, L2b_id, L3a_id, L3b_id, ...]
2. tdi_repository.get_by_tsi_ids(all_tree_ids) → documents tu toan bo tree
3. tsev_repository.get_by_tsi_ids(all_tree_ids) → events tu toan bo tree
4. tri_repository.get_by_tsi(tid) for tid in all_tree_ids → assignments gom
```

## 9.4 Progress Tree voi Inline Review (Admin)

**Truoc (v5):** Progress Tree hien tree text. Action buttons rieng (Approve/Reject/Comment/Upload).

**Sau (v6):** Progress Tree hien L3 steps dang **bang** voi inline review.

```
┌─ L2 Phase Header ──────────────────────────────────┐
│  ┌────┬──────────────────┬──────────┬────────┬────┐│
│  │ #  │ Step             │ Status   │Comment │Act ││
│  ├────┼──────────────────┼──────────┼────────┼────┤│
│  │ 1  │ ✅ Doi chieu..   │ APPROVED │ OK     │ -  ││
│  │ 2  │ ⚪ Kiem tra AI   │ [▼ Sel ] │ [____] │Save││
│  │ 3  │ ⚪ Tong hop      │ PENDING  │ -      │ -  ││
│  └────┴──────────────────┴──────────┴────────┴────┘│
└────────────────────────────────────────────────────┘
```

| Cot | Admin | User |
|-----|-------|------|
| Status | Dropdown: Approved / Reject (cho step chua xu ly) | Read-only badge |
| Comment | Input text (cho step chua xu ly) | Read-only "-" |
| Action | Nut "Save" (xanh=Approve, do=Reject) | Khong co |

## 9.5 Role-Based Actions

| Role | Actions | Giao dien |
|------|---------|-----------|
| **Legal Admin** (TiepTA) | Inline Approve/Reject/Comment trong Progress Tree + Upload Document | Dropdown + input trong bang L3 |
| **User** (MinhPT) | Upload Document + AI Check + Submit to Review | 3 nut: [Upload (tim)] [AI Check (indigo)] [Submit to Review (xanh)] |

## 9.6 My Tasks - Gom theo Workflow

**Truoc (v5):** My Tasks hien tung L3 step rieng le (nhieu dong cho 1 workflow).

**Sau (v6):** Gom theo L1 root, hien **1 dong per workflow**.

| Field | Nguon |
|-------|-------|
| Code | L1 tsi_code |
| Title | L1 title |
| Submitted By | L1 requested_by → EMP name |
| Type | TST L1 name |
| Status | **L3 cuoi cung** (updated_at desc) |
| Due Date | L1 due_date |

## 9.7 Login Page

**Truoc (v5):** Hien "Pham Thanh Minh" va "Tran Anh Tiep".

**Sau (v6):**

| Card | Label | Role | Mo ta |
|------|-------|------|-------|
| Trai (xanh duong) | **User** | Product Manager | Submit legal review requests, upload documents, track progress |
| Phai (xanh la) | **Legal Admin** | Legal Manager | Review and approve submitted tasks, manage compliance |

Sidebar hien "User" hoac "Legal Admin" thay vi ten thuc.

## 9.8 Files da thay doi (v5 → v6)

### Backend (legal-workflow-be)
| File | Thay doi |
|------|---------|
| `src/config/database.py` | **NEW** - SQLite connection, 14-table schema, reset_db() |
| `src/config/settings.py` | Them CORS ports 5174-5176 |
| `src/common/status_machine.py` | Them APPROVED/REJECTED cho PENDING, APPROVED cho IN_PROGRESS |
| `src/modules/*/repository.py` | **ALL 12 rewritten** - tu in-memory sang SQLite |
| `src/modules/tsi/router.py` | Approve→APPROVED, reject auto-transition, tree aggregation |
| `src/modules/tsi/my_tasks_router.py` | Gom theo L1 root, latest L3 status, submitted_by_name |
| `src/modules/tdi/repository.py` | Them get_by_tsi_ids() |
| `src/modules/tsev/repository.py` | Them get_by_tsi_ids() |
| `src/modules/workflow/engine.py` | Xu ly APPROVED nhu COMPLETED trong phase completion |
| `src/app.py` | init_db() + conditional seeding |

### Frontend (legal-workflow-fe)
| File | Thay doi |
|------|---------|
| `src/pages/TaskDetailPage.tsx` | **REWRITE** - Inline review table, role-based actions, aggregated data |
| `src/pages/MyTasksPage.tsx` | Them cot Submitted By, APPROVED status color |
| `src/pages/LoginPage.tsx` | Doi ten User / Legal Admin |
| `src/components/layout/Sidebar.tsx` | Hien User / Legal Admin thay vi ten thuc |

### Tests
- 158 BE tests pass (updated cho APPROVED flow + SQLite)
- Test fixtures dung `reset_db(":memory:")` de isolate

---


### v7 Files (bo sung)

**Backend:**
| File | Thay doi |
|------|---------|
| `src/modules/ai_review/service.py` | **NEW** - GPT-4o-mini review, doc file content, mock fallback |
| `src/modules/ai_review/router.py` | **NEW** - POST/GET ai-review endpoints |
| `src/modules/ai_review/file_reader.py` | **NEW** - Doc PDF/DOCX/PPTX/XLSX/TXT tu file thuc |
| `src/modules/tdi/router.py` | Them upload-file (multipart), serve file, delete doc |
| `src/modules/tsi/router.py` | AI score hien trong cot Comment |
| `src/common/status_machine.py` | Them SUBMITTED + REJECTED->SUBMITTED |
| `src/config/settings.py` | Them OPENAI_API_KEY |
| `.env` | OPENAI_API_KEY=sk-svcacct-... |

**Frontend:**
| File | Thay doi |
|------|---------|
| `src/pages/TaskDetailPage.tsx` | Them AI Check button, file upload thuc, AI result panel |

**Dependencies moi:** `openai`, `python-docx`, `python-pptx`, `openpyxl`, `PyPDF2`

> **Document End**
> Version: v7 | Date: 2026-03-26
> Architecture Pack for Legal Workflow System
> v5.1 - TDTP entity (1:1 TDT), CTY filter, HR emp_code format
> v5.2 - Filter codes tu AllocationToItem_NativeTable (742 rows)
> v6.0 - SQLite database, APPROVED status flow, inline admin review, role-based UI
> v7.0 - AI Review (GPT-4o-mini), real file upload, SUBMITTED status, reject continues workflow
