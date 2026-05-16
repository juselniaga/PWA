# SVRMS API Services — Project Context

**Site Visit & Review Management System**
**Backend API Middleware | Express.js**
**Version:** 1.0 | **Status:** Draft | **Audience:** Backend / Frontend Developers

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Technical Stack](#3-technical-stack)
4. [Security & Access Control](#4-security--access-control)
5. [Application Lifecycle & Business Rules](#5-application-lifecycle--business-rules)
6. [Database Schema](#6-database-schema)
7. [File Storage & Asset Management](#7-file-storage--asset-management)
8. [Offline Synchronisation Strategy](#8-offline-synchronisation-strategy)
9. [API Endpoint Reference](#9-api-endpoint-reference)
10. [Request & Response Contracts](#10-request--response-contracts)
11. [Error Handling Standard](#11-error-handling-standard)
12. [Environment & DevOps Configuration](#12-environment--devops-configuration)
13. [Audit Logging](#13-audit-logging)

---

## 1. Project Overview

The **SVRMS API Service** is a high-performance middleware layer built with **Express.js**. It serves as the critical communication bridge between a **Progressive Web Application (PWA)** frontend and a **MySQL database** (accessed via the Laravel backend system).

### What it does

- Provides secure, stateless REST API endpoints consumed by the PWA
- Handles **JWT-based authentication** independently of the Laravel backend auth system
- Orchestrates **multi-part file submissions** (directional site photos)
- Manages **offline data synchronisation** — converting base64 payloads from Local Storage back into physical binary files
- Enforces **state-transition business rules** across the application lifecycle
- Records **full audit trails** for all status transitions and data changes

### Who uses it

| Consumer | Role |
|---|---|
| PWA Frontend (HTML/JS/CSS) | Calls all endpoints; handles online/offline switching |
| Laravel Backend System | Source of truth database (MySQL); backend system for Clerk, AD, Director modules |
| Officers | End users who log in, register sites, conduct site visits, submit reviews |

---

## 2. System Architecture

```
┌─────────────────────────┐        ┌───────────────────────────┐        ┌─────────────────────────┐
│   Frontend (PWA)        │◄──────►│   API Services            │◄──────►│   Backend System        │
│                         │        │   (Express.js)            │        │   (Laravel + MySQL)     │
│  HTML / JS / CSS        │        │                           │        │                         │
│  Offline-capable        │        │  ● JWT Authentication     │        │  ● PHP Laravel          │
│  Local Storage fallback │        │  ● REST routing           │        │  ● MySQL Database       │
│                         │        │  ● Zod validation         │        │  ● Blade / Tailwind     │
│  Port: browser          │        │  ● Multer file handling   │        │  ● File storage         │
│  Origin: svrms.gov.my   │        │  ● Offline sync engine    │        │                         │
└─────────────────────────┘        │  Port: 3000 (Staging)     │        └─────────────────────────┘
                                   └───────────────────────────┘
```

### Infrastructure Rules

- **Rule A:** All data communication between frontend and database goes exclusively through the API Services layer.
- **Rule B:** When the frontend submits data, it first checks for internet connectivity. If online → POST to API → saved to database. If offline → save to Local Storage → sync later via `POST /sync`.
- **Rule C:** The API Services layer maintains **functional independence** from the Laravel backend authentication system. It manages its own JWT issuance and validation.

---

## 3. Technical Stack

| Concern | Technology | Notes |
|---|---|---|
| Runtime | **Node.js LTS v20+** | Long-term support version required |
| Web Framework | **Express.js** | RESTful API architecture |
| Database Driver | **mysql2/promise** | Async, non-blocking MySQL operations |
| Schema Validation | **Zod** | Declarative, type-safe request validation |
| Authentication | **JWT (jsonwebtoken)** | Standard flat JSON payload, 8-hour TTL |
| Password Hashing | **bcrypt** | Credential comparison against `users` table |
| File Uploads | **Multer** | multipart/form-data; dynamic directory management |
| API Specification | **OpenAPI 3.0.3 (YAML)** | Canonical spec at `API.yml` |
| Environment Config | **.env** | DB credentials, JWT secret, CORS origin |

### Architectural Philosophy

Clean, modular, and maintainable code structure — optimised for both staging and production scalability. Each route module encapsulates its own validation, business logic, and database interaction.

---

## 4. Security & Access Control

### CORS

- **Allowed Origin:** `https://svrms.gov.my` (whitelisted; no wildcard in production)

### JWT Bearer Token

All protected endpoints require the header:

```
Authorization: Bearer <token>
```

**Token payload structure:**

```json
{
  "user_id": 5,
  "name": "Ahmad Fadzil",
  "role": "officer",
  "department": "Perancangan"
}
```

**Token lifecycle:**
- Obtained via `POST /auth/login`
- Expires after **8 hours (TTL)**
- Frontend stores token in memory; for offline resumption it may be kept in Local Storage
- On `401` response → frontend must redirect user to Login page
- No refresh token mechanism in v1.0; re-login is required after expiry

### Authentication Logic

Query against the `users` table:

```sql
SELECT * FROM users
WHERE email = :username
  AND role = 'officer'
  AND is_active = 1
```

Password is verified using **bcrypt.compare()**. Non-officer roles (`clerk`, `assistant_director`, `director`) are rejected at this layer — they authenticate through the Laravel system directly.

---

## 5. Application Lifecycle & Business Rules

The API enforces a **linear, state-driven lifecycle** on every application record. Status transitions are automatic and tied to specific API actions.

```
[RECORDED] ──POST /sites──► [RECORDED] ──POST /site-visits (action=submit)──► [SITE_VISIT_IN_PROGRESS] ──POST /reviews──► [PENDING_VERIFICATION]
                                 ▲
                                 │
                         POST /site-visits (action=draft)
                         (stays in RECORDED)
```

### Phase 1 — Site Registration (`RECORDED` stays `RECORDED`)

- Triggered by: `POST /sites`
- Officer registers land/site details for the application
- On success: `applications.status` remains `RECORDED`
- Logged in `audit_logs` as `SITE_REGISTERED`

### Phase 2 — Site Visit (`RECORDED` → `SITE_VISIT_IN_PROGRESS` OR stays `RECORDED`)

- Triggered by: `POST /site-visits` with `action` field controlling the transition
- **`action = "submit"`** → status advances to `SITE_VISIT_IN_PROGRESS`; officer has finalised on-site findings
- **`action = "draft"`** → status remains `RECORDED`; record saved for later completion
- Directional photos uploaded as `multipart/form-data`
- Logged in `audit_logs` as `SITE_INVESTIGATION_COMPLETED` or `SITE_VISIT_DRAFT_SAVED`

### Phase 3 — Review (`SITE_VISIT_IN_PROGRESS` → `PENDING_VERIFICATION`)

- Triggered by: `POST /reviews`
- Officer submits formal written review, recommendation (`SUPPORTED` or `NOT_SUPPORTED`), and confirms self-checklist
- On success: `applications.status` set to `PENDING_VERIFICATION`
- Notification to Assistant Director is triggered at the backend level
- Logged in `audit_logs` as `REVIEW_SUBMITTED`

### Dashboard / Todo Routing

The `GET /todo` endpoint returns applications in `RECORDED` or `SITE_VISIT_IN_PROGRESS` status. The PWA frontend uses the status value and existence of site data to route the officer to the correct form:

| `status` value | Child Data | Todo Type | Frontend Route |
|---|---|---|---|
| `RECORDED` | `site_id` is NULL | Type 1 | `/register-site` |
| `RECORDED` | `site_id` is NOT NULL | Type 2 | `/site-visit` |
| `SITE_VISIT_IN_PROGRESS` | - | Type 3 | `/review` |

---

## 6. Database Schema

The API Services layer provides direct CRUD operations and relational joins across the following tables:

### `users`
Identity and Role-Based Access Control.

| Column | Type | Notes |
|---|---|---|
| user_id | int PK | |
| name | varchar | Officer's full name |
| email | varchar | Used as login username |
| password | varchar | bcrypt-hashed |
| role | varchar | `officer`, `clerk`, `assistant_director`, `director` |
| department | varchar | |
| is_active | tinyint | 1 = active, 0 = disabled |
| remember_token | varchar | Laravel session token (ignored by API Services) |
| created_at / updated_at | timestamp | |

### `applications`
State management and officer assignment tracking.

| Column | Type | Notes |
|---|---|---|
| application_id | int PK | |
| reference_no | varchar | e.g. `MPJ/2025/001` |
| developer_id | int FK | → `developers.developer_id` |
| tajuk | varchar | Project title |
| lokasi | varchar | Location description |
| no_fail | varchar | File number |
| status | varchar | `RECORDED`, `SITE_VISIT_IN_PROGRESS`, `PENDING_VERIFICATION`, `APPROVED`, `REJECTED` |
| officer_id | int FK | → `users.user_id` |
| is_active | tinyint | |
| created_at / updated_at | timestamp | |

### `developers`
External entity data — left-joined for Dashboard/Todo lists.

| Column | Type | Notes |
|---|---|---|
| developer_id | int PK | |
| name | varchar | Developer / company name |
| address1, address2 | varchar | |
| poskod, city, state | varchar | |
| email, fax, tel | varchar | |
| created_at / updated_at | timestamp | |

### `sites`
Technical land specifications registered in Phase 1.

| Column | Type | Notes |
|---|---|---|
| site_id | int PK | |
| application_id | int FK | |
| mukim | varchar | |
| bpk | varchar | Bahagian Pentadbiran Kecil |
| luas | decimal | Land area (Hectares / Acres) |
| google_lat | varchar | GPS coordinates / Locations |
| lot | varchar | |
| lembaran | varchar | Sheet reference |
| kategori_tanah | varchar | |
| status_tanah | varchar | |
| status | varchar | Always `REGISTERED` after creation |
| is_active | tinyint | Soft-delete flag |
| created_at / updated_at | timestamp | |

### `site_visits`
Directional findings, site characteristics, and file path mapping from Phase 2.

| Column | Type | Notes |
|---|---|---|
| site_visit_id | int PK | |
| application_id | int FK | |
| officer_id | int FK | |
| visit_date | datetime | |
| finding_north | varchar | Text findings |
| findings_south | varchar | Text findings (plural 's') |
| findings_east | varchar | Text findings (plural 's') |
| finding_west | varchar | Text findings |
| photos_north | json | File paths array |
| photos_south | json | File paths array |
| photo_east | json | File paths array (singular) |
| photo_west | json | File paths array (singular) |
| activity | varchar | Current site activity |
| facility | varchar | Existing facilities |
| entrance_way | varchar | Access/entrance |
| parit | varchar | Drainage condition |
| tree | varchar | Tree coverage |
| topography | varchar | |
| land_use_zone | varchar | |
| density | varchar | |
| recommend_road | tinyint | Boolean (1=Yes, 0=No) |
| anjakan | varchar | Setback requirements |
| social_facility | varchar | |
| location_data | varchar | GPS coordinates string |
| status | varchar | `DRAFT` or `COMPLETED` |
| created_at / updated_at | timestamp | |

### `reviews`
Professional recommendations and self-checklist compliance from Phase 3.

| Column | Type | Notes |
|---|---|---|
| review_id | int PK | |
| application_id | int FK | |
| officer_id | int FK | |
| review_content | text | Full report text |
| recommendation | varchar | `SUPPORTED` or `NOT_SUPPORTED` |
| self_check_completed | tinyint | 1 = confirmed |
| submitted_at | timestamp | |
| created_at / updated_at | timestamp | |

### `audit_logs`
Full-spectrum tracking of all status transitions and data snapshots.

| Column | Type | Notes |
|---|---|---|
| id | int PK | |
| application_id | int FK | |
| user_id | int FK | |
| action | varchar | e.g. `site_registered`, `review_submitted` |
| previous_status | varchar | State before the action |
| new_status | varchar | State after the action |
| snapshot_old | json | Full record state before change |
| snapshot_new | json | Full record state after change |
| remarks | varchar | |
| timestamp | timestamp | |
| created_at / updated_at | timestamp | |

### Supporting Tables (managed by Laravel, read-only for API Services)

- `verifications` — Assistant Director verification records
- `approvals` — Director approval records
- `sessions`, `cache`, `cache_locks` — Laravel session/cache infrastructure
- `jobs`, `job_batches`, `failed_jobs` — Laravel queue system
- `password_reset_tokens` — Laravel auth
- `migrations` — Laravel migration tracker

---

## 7. File Storage & Asset Management

### Storage Path

```
/public/storage/photos/
```

Photos are stored on the **backend server's local filesystem**, not in the database. Only the **file path string** is persisted in the database.

### Asset Naming Convention

```
{application_id}-{timestamp}_{officerID}_{direction}.{extension}
```

**Examples:**
```
101-20250615143022_5_north.jpg
101-20250615143055_5_south.png
101-20250615143110_5_attachment.pdf
```

### Accepted File Types

- Photos: `image/jpeg`, `image/png`
- Attachments: `application/pdf`, `image/jpeg`, `image/png`

### Upload Handling

- Multer processes `multipart/form-data` requests
- Dynamic directory creation: if `/public/storage/photos/{application_id}/` does not exist, it is created on first upload
- Maximum concurrent uploads handled via Multer's high-concurrency configuration
- File size limits and MIME type validation enforced at the Multer middleware level

---

## 8. Offline Synchronisation Strategy

### How offline mode works

1. PWA detects no internet connection via the browser's `navigator.onLine` API or a connectivity ping
2. Form submission data is **serialised to JSON** and stored in **browser Local Storage** with a generated `local_id` and `created_offline_at` timestamp
3. Photo/binary data is **base64-encoded** before storage in Local Storage
4. When connectivity is restored, the PWA calls `POST /sync` with all pending records

### Sync endpoint behaviour (`POST /sync`)

- Accepts a `records` array; each item has `type` (`site` | `site_visit` | `review`), `payload`, `local_id`, and `created_offline_at`
- Records are **processed sequentially**
- The sync engine **decodes base64 strings** back into physical binary files, then writes them to `/public/storage/photos/`
- The same business logic and Zod validation as the individual POST endpoints is applied to each record
- Processing **does not abort on first failure** — all records are attempted
- The response includes a per-record result array so the PWA can clear only successfully synced entries from Local Storage

### Sync response structure

```json
{
  "synced": 2,
  "failed": 0,
  "results": [
    { "local_id": "ls_001", "status": "success", "server_id": 45 },
    { "local_id": "ls_002", "status": "success", "server_id": 88 }
  ]
}
```

---

## 9. API Endpoint Reference

**Base URL:** `https://api.svrms.gov.my/v1`

| Method | Endpoint | Auth | Module | Description |
|---|---|---|---|---|
| `POST` | `/auth/login` | None | Auth | Authenticate officer, return JWT |
| `GET` | `/todo` | Bearer | Dashboard | Get officer's todo list (all 3 status types) |
| `POST` | `/sites` | Bearer | Register Site | Register new site (Phase 1) |
| `GET` | `/sites/:application_id` | Bearer | Register Site | Get site record by application |
| `PUT` | `/sites/:site_id` | Bearer | Register Site | Update site record |
| `DELETE` | `/sites/:site_id` | Bearer | Register Site | Soft-delete site record |
| `POST` | `/site-visits` | Bearer | Site Visit | Create site visit — submit or save draft (Phase 2) |
| `GET` | `/site-visits/:application_id` | Bearer | Site Visit | Get site visit record (includes photo URLs) |
| `PUT` | `/site-visits/:site_visit_id` | Bearer | Site Visit | Update site visit record |
| `DELETE` | `/site-visits/:site_visit_id` | Bearer | Site Visit | Soft-delete site visit record |
| `POST` | `/reviews` | Bearer | Review | Submit formal review (Phase 3) |
| `GET` | `/reviews/:application_id` | Bearer | Review | Get review record by application |
| `PUT` | `/reviews/:review_id` | Bearer | Review | Update review (only if not yet verified) |
| `DELETE` | `/reviews/:review_id` | Bearer | Review | Soft-delete review record |
| `POST` | `/sync` | Bearer | Offline Sync | Batch upload offline Local Storage records |

**15 operations across 12 paths.** Full OpenAPI 3.0.3 specification is defined in `API.yml`.

---

## 10. Request & Response Contracts

### 10.1 Login — `POST /auth/login`

**Request:**
```json
{ "username": "ahmad.fadzil@mpj.gov.my", "password": "P@ssw0rd123" }
```

**Response 200:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "user_id": 5, "name": "Ahmad Fadzil", "role": "officer", "department": "Perancangan" }
}
```

---

### 10.2 Todo List — `GET /todo`

**Query param (optional):** `?status=recorded`

**Response 200:**
```json
{
  "officer": { "user_id": 5, "name": "Ahmad Fadzil" },
  "total": 3,
  "applications": [
    {
      "application_id": 101,
      "officer_id": 5,
      "reference_no": "MPJ/2025/001",
      "developer_id": 12,
      "developer_name": "Syarikat ABC Sdn Bhd",
      "tajuk": "Taman Maju Jaya",
      "lokasi": "Mukim Sg. Petani",
      "no_fail": "JPN/2025/101",
      "status": "recorded"
    }
  ]
}
```

---

### 10.3 Register Site — `POST /sites`

**Content-Type:** `application/json`

**Required fields:** `application_id`, `mukim`, `bpk`, `luas`, `nofail`, `lot`, `kategori_tanah`, `status_tanah`, `lokasi`

**Optional fields:** `lembaran`, `google_lat`, `google_long`

**Response 201:**
```json
{
  "message": "Site berjaya didaftarkan. Langkah seterusnya ialah lawatan tapak.",
  "site_id": 45,
  "application_status": "site_visit"
}
```

---

### 10.4 Site Visit — `POST /site-visits`

**Content-Type:** `multipart/form-data` (when photos included) or `application/json`

**Key field — `action`:**
- `"submit"` → status advances to `review`
- `"draft"` → status stays `site_visit`

**Required text fields:** `application_id`, `officer_id`, `visit_date`, `finding_north`, `finding_south`, `finding_east`, `finding_west`, `activity`, `facility`, `entrance_way`, `parit`, `tree`, `topography`, `land_use_zone`, `density`, `recommend_road`, `parking`, `anjakan`, `sosial_facility`, `action`

**Optional file fields:** `photos_north`, `photo_south`, `photo_east`, `photo_west`, `attachments[]`

**Optional data fields:** `location_data` (GPS JSON string)

**Response 201 (submit):**
```json
{
  "message": "Lawatan tapak berjaya dihantar. Sila lengkapkan ulasan.",
  "site_visit_id": 88,
  "application_status": "review"
}
```

**Response 201 (draft):**
```json
{
  "message": "Draf disimpan.",
  "site_visit_id": 88,
  "application_status": "site_visit"
}
```

---

### 10.5 Review — `POST /reviews`

**Content-Type:** `application/json`

**Required fields:** `application_id`, `officer_id`, `review_content`, `recommendation` (`Lulus` | `Tolak` | `Tangguh`), `self_check_completed` (boolean)

**Response 201:**
```json
{
  "message": "Ulasan berjaya dihantar kepada Penolong Pengarah untuk pengesahan.",
  "review_id": 33,
  "application_status": "verified"
}
```

---

### 10.6 Offline Sync — `POST /sync`

**Content-Type:** `application/json`

**Request:**
```json
{
  "records": [
    {
      "type": "site",
      "payload": { "application_id": 101, "mukim": "...", "..." : "..." },
      "local_id": "ls_001",
      "created_offline_at": "2025-06-18T08:00:00Z"
    },
    {
      "type": "site_visit",
      "payload": { "application_id": 101, "..." : "...", "photos_north": "<base64string>" },
      "local_id": "ls_002",
      "created_offline_at": "2025-06-18T09:30:00Z"
    }
  ]
}
```

**Response 200:**
```json
{
  "synced": 2,
  "failed": 0,
  "results": [
    { "local_id": "ls_001", "status": "success", "server_id": 45 },
    { "local_id": "ls_002", "status": "success", "server_id": 88 }
  ]
}
```

---

## 11. Error Handling Standard

All error responses use a consistent envelope:

```json
{
  "error": "Human-readable error message.",
  "code": "VALIDATION_ERROR",
  "details": { "field": "application_id", "issue": "required" }
}
```

### HTTP Status Code Reference

| Code | Status | Meaning |
|---|---|---|
| `200` | OK | Request successful, data returned |
| `201` | Created | Record successfully created |
| `400` | Bad Request | Validation error; missing or invalid fields |
| `401` | Unauthorized | Invalid/expired token or wrong credentials |
| `403` | Forbidden | Action not allowed (e.g. editing a locked review) |
| `404` | Not Found | Requested resource does not exist |
| `422` | Unprocessable | Business rule violation (e.g. duplicate site record) |
| `500` | Server Error | Unexpected backend failure |

### Behaviour notes

- Zod validation errors are caught and formatted into the `details` field
- `DELETE` operations are **soft-deletes** (`is_active = 0`) — no data is permanently destroyed
- `PUT /reviews/:review_id` returns `403` if the application status is already `verified` or `approved`
- `POST /sync` never returns `500` for individual record failures — it returns `200` with per-record `status: "failed"` entries

---

## 12. Environment & DevOps Configuration

### Environment Variables (`.env`)

```env
# Server
PORT=3000
NODE_ENV=staging

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=svrms
DB_USER=svrms_api
DB_PASSWORD=<secret>

# JWT
JWT_SECRET=<secret>
JWT_EXPIRES_IN=8h

# CORS
CORS_ORIGIN=https://svrms.gov.my

# Storage
STORAGE_PATH=/public/storage/photos
```

### Servers

| Environment | Base URL |
|---|---|
| Production | `https://api.svrms.gov.my/v1` |
| Staging | `https://staging-api.svrms.gov.my/v1` |
| Local Dev | `http://localhost:3000/v1` |

### Project Structure (recommended)

```
svrms-api/
├── .env
├── package.json
├── API.yml                        # OpenAPI 3.0.3 specification
├── CONTEXT.md                     # This document
├── src/
│   ├── app.js                     # Express app setup, CORS, middleware
│   ├── server.js                  # Port binding
│   ├── config/
│   │   ├── db.js                  # mysql2/promise pool
│   │   └── jwt.js                 # JWT sign/verify helpers
│   ├── middleware/
│   │   ├── auth.js                # Bearer token verification middleware
│   │   └── upload.js              # Multer configuration
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── todo.routes.js
│   │   ├── sites.routes.js
│   │   ├── siteVisits.routes.js
│   │   ├── reviews.routes.js
│   │   └── sync.routes.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── todo.controller.js
│   │   ├── sites.controller.js
│   │   ├── siteVisits.controller.js
│   │   ├── reviews.controller.js
│   │   └── sync.controller.js
│   ├── schemas/                   # Zod validation schemas
│   │   ├── site.schema.js
│   │   ├── siteVisit.schema.js
│   │   └── review.schema.js
│   └── utils/
│       ├── auditLog.js            # audit_logs insert helper
│       ├── statusTransition.js    # applications.status update helper
│       └── base64ToFile.js        # Offline sync base64 decoder
└── public/
    └── storage/
        └── photos/                # Uploaded site visit photos
```

---

## 13. Audit Logging

Every state-transition action writes a record to `audit_logs`. The API Services layer is responsible for these inserts at the point of status change.

### Actions logged

| Action constant | Triggered by | Status transition |
|---|---|---|
| `site_registered` | `POST /sites` | `recorded` → `site_visit` |
| `site_visit_submitted` | `POST /site-visits` (action=submit) | `site_visit` → `review` |
| `site_visit_draft_saved` | `POST /site-visits` (action=draft) | stays `site_visit` |
| `review_submitted` | `POST /reviews` | `review` → `verified` |

### Snapshot pattern

Each audit log entry captures the **full record state** before and after the change in `snapshot_old` and `snapshot_new` JSON columns. This enables complete rollback analysis and compliance reporting at the backend level.

---

*SVRMS API Services — CONTEXT.md | v1.0 | For internal development use only*
