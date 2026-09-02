# Dentist on Call — Architecture & Database Review

**Status:** Review required before implementation  
**MVP approach:** secure modular monolith; online-first PWA; bilingual English/Arabic.

## 1. Decisions and open items

### Decisions made for the MVP

- Deploy Next.js and FastAPI separately behind HTTPS. The browser only calls the FastAPI `/api/v1` surface.
- PostgreSQL stores structured clinical and operational data. Object storage stores attachment bytes; PostgreSQL stores only protected metadata and an opaque object key.
- One `users` identity table backs both roles. A doctor is a user with a one-to-one `doctor_profiles` record.
- Use UUID primary keys externally. Human-friendly patient IDs (`DOC-000001`) are generated from a database sequence and never used as authorization credentials.
- Store timestamps as `timestamptz` in UTC. Render using the tenant/clinic timezone, initially `Africa/Cairo`.
- Use a signed, short-lived access-token cookie plus a rotating refresh-token cookie. Neither token is exposed to JavaScript.
- A doctor may access a patient only if they are assigned through an appointment, visit, or explicit patient-care assignment. Admin has full access.
- FastAPI is the final authority for authentication, CSRF validation, role checks, organization isolation, and patient care-scope authorization. Frontend visibility rules are never trusted.
- Every business entity is organization-scoped from the first migration, including users, doctor profiles, patients, histories, visits, procedures, appointments, attachments, financial transactions, notifications, and audit logs.
- Record financial corrections as reversal/adjustment transactions, never silent mutation of posted history.
- No offline cache of protected API responses, files, or patient records in MVP.

### Product decisions needing confirmation

1. Is there one legal clinic/organization in MVP, or should the schema enforce an `organization_id` from day one? **Recommendation:** include a single seeded `organizations` row and require `organization_id` on business records; this is low-cost future-proofing for branches/tenants.
2. May doctors see all clinic patients, or only patients connected to them? This design uses **care-scoped access** by default.
3. Are financial amounts tax-inclusive and which currency is used? **Recommendation:** EGP, integer minor units (`amount_minor`) plus `currency_code`.
4. Should appointment reminders go only to staff in MVP, or also to patients? This design supports staff reminders first; patient channels need consent and message templates.
5. Is an attachment immutable after upload? **Recommendation:** yes; deletion changes status to `deleted` and preserves audit metadata, subject to an approved retention policy.

## 2. System architecture

```text
PWA browser (Next.js / React / TypeScript)
  ├─ public application shell, manifest, service worker
  ├─ authenticated UI, i18n and accessible RTL/LTR layout
  └─ HTTPS + secure cookies
                 │
                 ▼
FastAPI modular monolith (/api/v1)
  ├─ auth and policy enforcement
  ├─ patient, clinical, scheduling, finance, reporting modules
  ├─ attachment authorization and signed-upload/download orchestration
  ├─ audit/event creation and notification outbox
  └─ Alembic / SQLAlchemy / PostgreSQL
       ├─ PostgreSQL: transactional source of truth
       ├─ S3-compatible private object storage: attachments
       └─ worker/scheduler: reminders and asynchronous jobs
```

### Backend modules

`auth`, `users`, `doctors`, `patients`, `clinical`, `attachments`, `appointments`, `notifications`, `finance`, `reports`, `audit`, `settings`, `storage`, and `common` are independent feature packages. Routers only validate/request-response-map; services enforce business rules and policies; repositories encapsulate query persistence.

The notification worker may initially run as a separately deployed FastAPI/Celery/ARQ worker using a PostgreSQL outbox. A transaction writes both a domain change and an outbox record; the worker delivers it idempotently. This avoids losing a reminder after an appointment is committed.

### Request authorization boundary

```text
Browser
  │  HttpOnly + Secure session cookies
  ▼
Next.js PWA
  │  authenticated HTTPS request (plus CSRF token on mutations)
  ▼
FastAPI — final authority
  ├─ authenticate the cookie/session
  ├─ reject inactive/revoked users
  ├─ validate CSRF for state-changing requests
  ├─ require the endpoint role/permission
  ├─ constrain every query to organization_id
  └─ apply care-scope policy for patient-bound records
       │
       └─ allow only after every check succeeds
```

For example, a direct `GET /api/v1/patients/{id}` cannot be authorized by the UI. FastAPI resolves the requester's server-side session and evaluates this sequence:

```text
Authenticated? → Active? → Required role? → Same organization? → Care access to patient? → Allow / deny
```

An unauthorized or out-of-scope lookup returns a safe `404` where hiding record existence is required; otherwise it returns `403`. Neither response exposes protected patient information.

## 3. Roles and authorization

| Capability | Admin | Doctor |
|---|---:|---:|
| Manage users/doctors/settings | Yes | No |
| View patients | All | Care-scoped only |
| Create patients | Yes | Yes |
| Edit demographics | Yes | Allowed/care-scoped fields |
| View/create visits and histories | All | Care-scoped only |
| Manage all appointments | Yes | Own appointments; create only if enabled |
| Upload/view attachment | All | Care-scoped only |
| Financials/reports | Yes | No |
| Audit log | Yes | No |

Authorization is enforced in FastAPI dependency/policy checks on every resource lookup. Client route guards only improve UX; they are not a security boundary. A doctor cannot obtain data merely by guessing an ID. All repositories require an `organization_id` filter; service policies add role and care-scope predicates before data is returned or changed.

## 4. PostgreSQL schema

Every business table includes `id uuid primary key`, `organization_id uuid not null references organizations(id)`, `created_at timestamptz not null default now()`, and `updated_at timestamptz not null default now()` unless noted. This includes users, doctor profiles, patients, medical and dental histories, visits, visit procedures, appointments, attachments, financial transactions, notifications, and audit logs. `created_by_user_id` is captured where meaningful. `deleted_at` is used only for entities permitted to be soft-deleted.

### Identity and configuration

| Table | Essential fields | Relationships / rules |
|---|---|---|
| `organizations` | `id`, `name`, `timezone`, `default_locale`, `currency_code`, `is_active` | Seed one organization; future tenant/branch boundary. |
| `users` | `id`, `email citext`, `password_hash`, `role enum(ADMIN,DOCTOR)`, `display_name`, `is_active`, `last_login_at` | Unique `(organization_id,email)`; no plaintext credentials. |
| `refresh_sessions` | `id`, `user_id`, `token_hash`, `expires_at`, `revoked_at`, `rotated_from_id`, `ip_hash`, `user_agent` | Rotating, hashed refresh tokens; revoke on logout/password reset. |
| `password_reset_tokens` | `id`, `user_id`, `token_hash`, `expires_at`, `used_at` | Short-lived, one-time. |
| `doctor_profiles` | `id`, `user_id`, `doctor_code`, `phone`, `specialization`, `profile_attachment_id`, `status` | `user_id` unique; deactivation preserves history. |
| `settings` | `id`, `key`, `value_jsonb`, `scope`, `updated_by_user_id` | Allowlisted settings keys; not a secret store. |
| `procedure_catalog` | `id`, `name_en`, `name_ar`, `is_custom`, `is_active`, `default_cost_minor` | Configurable initial procedure choices. |
| `financial_categories` | `id`, `transaction_type`, `name_en`, `name_ar`, `is_active` | Configurable revenue/expense categories. |

### Patients and clinical record

| Table | Essential fields | Relationships / rules |
|---|---|---|
| `patients` | `id`, `patient_number bigint`, `patient_code`, `full_name`, `date_of_birth`, `gender`, `phone`, `whatsapp_phone`, `email`, `address`, `emergency_contact_jsonb`, `notes`, `status`, `deleted_at` | Unique `(organization_id,patient_number)` and `(organization_id,patient_code)`; `patient_code` formatted as DOC-######. |
| `patient_care_assignments` | `id`, `patient_id`, `doctor_id`, `assigned_at`, `unassigned_at`, `assigned_by_user_id` | Explicit ongoing doctor-patient access. Partial unique active assignment. |
| `medical_histories` | `id`, `patient_id`, `conditions_text`, `medications_text`, `drug_allergies_text`, `food_allergies_text`, `surgeries_text`, `hospitalization_text`, `family_history_text`, `smoking_status`, `additional_notes` | One current record per patient. |
| `medical_history_flags` | `id`, `medical_history_id`, `code`, `value boolean`, `details` | Codes: pregnancy, diabetes, hypertension, heart_disease, blood_disorder, kidney_disease, liver_disease, asthma, epilepsy. Unique `(medical_history_id,code)`. |
| `dental_histories` | `id`, `patient_id`, `previous_treatment_text`, `extractions_text`, `root_canal_text`, `implants_text`, `orthodontics_text`, `gum_problems_text`, `sensitivity_text`, `bleeding_gums_text`, `tmj_text`, `trauma_text`, `last_dental_visit_on`, `other_text` | One current record per patient. |
| `visits` | `id`, `patient_id`, `doctor_id`, `appointment_id nullable`, `occurred_at`, `chief_complaint`, `clinical_findings`, `diagnosis_text`, `treatment_notes`, `doctor_notes`, `status` | Patient clinical event; never flatten into patient columns. |
| `visit_procedures` | `id`, `visit_id`, `catalog_procedure_id nullable`, `procedure_name`, `description`, `status`, `cost_minor`, `currency_code`, `notes`, `performed_at` | One visit → many procedures; snapshot procedure name/cost. |
| `patient_notes` | `id`, `patient_id`, `author_user_id`, `body`, `visibility` | Use only for non-duplicative patient notes; policy-enforced. |

### Attachments

| Table | Essential fields | Relationships / rules |
|---|---|---|
| `attachments` | `id`, `patient_id`, `visit_id nullable`, `uploaded_by_user_id`, `kind enum(XRAY,PHOTO_BEFORE,PHOTO_AFTER,DOCUMENT,OTHER)`, `storage_key`, `original_filename`, `safe_filename`, `mime_type`, `size_bytes`, `sha256`, `description`, `status`, `deleted_at` | `storage_key` is private and unique; never return directly to client. |
| `attachment_access_events` | `id`, `attachment_id`, `user_id`, `action enum(UPLOAD,VIEW,DOWNLOAD,DELETE)`, `occurred_at`, `ip_hash` | High-value immutable audit trail. |

### Scheduling and notifications

| Table | Essential fields | Relationships / rules |
|---|---|---|
| `appointments` | `id`, `patient_id`, `doctor_id nullable`, `starts_at`, `ends_at`, `duration_minutes`, `reason`, `location`, `status enum(PENDING,CONFIRMED,COMPLETED,CANCELLED,NO_SHOW)`, `notes`, `created_by_user_id`, `cancelled_at`, `completed_at` | Check `ends_at > starts_at`; doctor calendar query indexed. |
| `appointment_status_events` | `id`, `appointment_id`, `from_status`, `to_status`, `changed_by_user_id`, `reason`, `occurred_at` | Immutable status history. |
| `notifications` | `id`, `recipient_user_id`, `type`, `title_key`, `body_key`, `payload_jsonb`, `channel enum(IN_APP,WEB_PUSH,EMAIL,WHATSAPP,SMS)`, `status`, `scheduled_for`, `sent_at`, `read_at` | First release uses in-app/web push only. |
| `push_subscriptions` | `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `expires_at`, `disabled_at` | Encrypt subscription secrets at rest. |
| `outbox_events` | `id`, `topic`, `payload_jsonb`, `available_at`, `processed_at`, `attempts`, `last_error` | Transactional hand-off to worker. |

### Finance, auditing, reporting support

| Table | Essential fields | Relationships / rules |
|---|---|---|
| `financial_transactions` | `id`, `type enum(REVENUE,EXPENSE)`, `category_id`, `amount_minor`, `currency_code`, `description`, `patient_id nullable`, `visit_id nullable`, `doctor_id nullable`, `effective_on`, `status enum(POSTED,VOIDED)`, `reversal_of_id nullable`, `created_by_user_id`, `voided_at` | Check amount > 0. Corrections insert a reversal/adjustment, preserving source. |
| `audit_logs` | `id`, `actor_user_id nullable`, `actor_role`, `action`, `target_type`, `target_id`, `description`, `metadata_jsonb`, `occurred_at`, `request_id`, `ip_hash` | Append-only. Never store credentials or full clinical payloads. |

### Key relationships

```text
users 1──0..1 doctor_profiles
patients 1──1 medical_histories / dental_histories
patients 1──* visits ──1..* visit_procedures
patients 1──* attachments; visits 1──* attachments
patients 1──* appointments *──0..1 doctor_profiles
patients *──* doctors through patient_care_assignments
users 1──* audit_logs / refresh_sessions / notifications
```

### Essential indexes and constraints

- `patients (organization_id, patient_code) unique`, plus trigram/GIN indexes for normalized name, `phone`, and `whatsapp_phone` search.
- `visits (organization_id, patient_id, occurred_at desc)` and `visits (doctor_id, occurred_at desc)`.
- `appointments (organization_id, doctor_id, starts_at)` and `(organization_id, starts_at)`.
- PostgreSQL exclusion constraint on active appointments for the same doctor and overlapping time range, if overlapping bookings are disallowed.
- `attachments (patient_id, created_at desc)` and unique `storage_key`.
- `financial_transactions (organization_id, effective_on, type)`; audit logs `(organization_id, occurred_at desc)` and `(target_type,target_id)`.
- Foreign keys use `RESTRICT` for medical/audit history; avoid cascaded deletion of clinical data.

## 5. REST API surface

All APIs are under `/api/v1`, use JSON, return RFC 7807-style errors (`type`, `title`, `status`, `detail`, `requestId`), and paginate collection responses using `items`, `nextCursor`, `total` where count is affordable.

| Domain | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/password-reset/request`, `/auth/password-reset/confirm`, `GET /auth/me` |
| Users/doctors | `GET,POST /doctors`; `GET,PATCH /doctors/{id}`; `POST /doctors/{id}/activate`; `POST /doctors/{id}/deactivate`; `GET /doctors/{id}/performance` |
| Patients | `GET,POST /patients`; `GET,PATCH /patients/{id}`; `GET,PUT /patients/{id}/medical-history`; `GET,PUT /patients/{id}/dental-history`; `GET,POST /patients/{id}/care-assignments`; `GET /patients/{id}/timeline` |
| Visits | `GET,POST /patients/{id}/visits`; `GET,PATCH /visits/{id}`; `POST /visits/{id}/procedures`; `PATCH,DELETE /visit-procedures/{id}` |
| Attachments | `POST /attachments/upload-intents`; `POST /attachments/{id}/complete`; `GET /attachments/{id}`; `POST /attachments/{id}/download-url`; `DELETE /attachments/{id}` |
| Appointments | `GET,POST /appointments`; `GET,PATCH /appointments/{id}`; `POST /appointments/{id}/confirm`; `/complete`; `/cancel`; `GET /calendar` |
| Finance/reports | `GET,POST /financial-transactions`; `POST /financial-transactions/{id}/reverse`; `GET /reports/overview`; `/reports/financials`; `/reports/doctors`; `/reports/appointments` |
| Audit/settings/notifications | `GET /audit-logs`; `GET,PUT /settings/{key}`; `GET /notifications`; `POST /notifications/{id}/read`; `POST,DELETE /push-subscriptions` |

All mutable endpoints require CSRF validation if cookie-authenticated. Every list endpoint accepts only allowlisted filter/sort fields.

## 6. Frontend routes

```text
/(locale)/login
/(locale)/forgot-password
/(locale)/reset-password
/(locale)/dashboard/admin
/(locale)/dashboard/doctor
/(locale)/patients
/(locale)/patients/new
/(locale)/patients/[patientId]
/(locale)/patients/[patientId]/visit/new
/(locale)/calendar
/(locale)/reservations
/(locale)/doctors                 (admin)
/(locale)/financials              (admin)
/(locale)/reports                 (admin)
/(locale)/activity                (admin)
/(locale)/settings                (admin)
```

The patient profile presents tabs/sections for overview, medical history, dental history, visits/timeline, and attachments. On small screens it uses stacked collapsible sections. Middleware redirects anonymous users to login; server layouts load the role and deny role-incompatible routes, while FastAPI remains authoritative.

## 7. Repository structure

```text
dentist-on-call/
  apps/
    web/                 # Next.js application
      app/[locale]/
      features/{auth,patients,visits,appointments,finance,...}/
      components/ hooks/ lib/ i18n/ types/
      public/{icons,manifest.webmanifest}/
    api/                 # FastAPI application
      app/
        routers/ schemas/ models/ repositories/ services/
        auth/ permissions/ database/ storage/ workers/ utils/
      alembic/
      tests/
  infra/                 # deployment, object-storage, reverse-proxy examples
  docs/
  .env.example
  README.md
```

## 8. PWA design

- `manifest.webmanifest`: name, short name, theme/background colors, maskable icons, display `standalone`, start URL.
- Service worker precaches only static application assets and public locale resources. It uses a network-first policy for pages and API requests and does **not** cache API responses containing patient/clinical data.
- Authentication responses, signed URLs, images, documents, and X-rays receive `Cache-Control: no-store` / `private` as appropriate.
- Offline state is explicit: show an informative reconnect UI; queueing clinical writes is deferred until a threat model and encrypted offline design are approved.
- Request push permission only after a clear user action in settings; persist the subscription server-side.

## 9. File-storage design

1. Client requests an upload intent with declared MIME type, byte size, patient/visit context and description.
2. API validates authorization, content type/size policy, creates a pending attachment record and issues a very short-lived presigned upload URL to a private bucket.
3. Client uploads directly. It calls completion; the API verifies object metadata/checksum, runs or queues malware scanning, and marks the attachment available only after passing.
4. For viewing/downloading, API re-checks patient/attachment policy and returns a short-lived signed URL or streams through a protected endpoint. Raw keys never appear in UI/API payloads.
5. Images get private thumbnails/derivatives generated asynchronously. Originals remain private. Retention/deletion events are audited.

Initial allowlist: JPEG, PNG, WebP, PDF and DICOM only if a DICOM-safe viewer and scanning process are provisioned. Enforce configurable per-type limits (for example 15 MB image, 25 MB PDF) and server-side MIME sniffing.

## 10. Security architecture

- TLS termination in production; HSTS, CSP, `X-Content-Type-Options`, frame-ancestors policy, referrer policy, and restrictive CORS allowlist.
- Argon2id password hashing; minimum password policy; login/reset rate limits; generic reset responses; audit login success/failure without passwords.
- Short-lived access tokens and rotating refresh session tokens in `HttpOnly`, `Secure`, `SameSite=Lax` cookies. CSRF token/double-submit or origin validation is required on state changes.
- Pydantic request validation, SQLAlchemy bound parameters, output schemas, HTML sanitization/escaped rendering, payload-size limits, and centralized safe error handling.
- Object storage is private, encrypted at rest, denied by default, and only accessed using a least-privilege service account. Scan uploads before availability.
- Secrets reside only in environment/secret management; `.env.example` has placeholders. Logs redact authorization headers, tokens, presigned URLs, and clinical bodies.
- Backup PostgreSQL with encrypted, tested restores. Define retention, breach response, access review, and Egyptian legal/compliance review before production launch.

## 11. Implementation phases

1. Foundation: monorepo, linting, strict TypeScript, Python tooling, Docker/dev services, `.env.example`, CI skeleton.
2. Database: SQLAlchemy models, Alembic initial migration, constraints/indexes, development seed command.
3. Identity: login, refresh/logout/reset, role/policy framework, security headers and tests.
4. App shell: responsive dark-gold design system, locale architecture, EN/AR RTL, admin/doctor dashboards.
5. Patients: search, creation/editing, care assignment, profile and permissions.
6. Clinical: medical/dental histories, visits, multiple procedures, patient timeline.
7. Secure media: upload intent, storage adapter, protected gallery and access audit.
8. Scheduling: appointments, calendar views, status history, doctor workflow.
9. Notifications: in-app reminders, web-push opt-in, outbox worker.
10. Finance and reports: immutable transactions, charts, filters, doctor performance.
11. Audit/settings: activity views, configuration and audit-log APIs.
12. PWA and polish: manifest, safe caching, accessibility, mobile camera flows, localized error/empty/loading states.
13. Hardening and release: comprehensive tests, threat-model review, backups, observability, deployment guide.

## 12. Acceptance gates before implementation

- Confirm the five product decisions in section 1.
- Approve the single-organization-with-organization-ID approach and care-scoped doctor access.
- Confirm attachment types/size limits and whether DICOM is in MVP.
- Confirm required deployment and object-storage provider (S3, Cloudflare R2, MinIO, etc.).
- Approve the staff-only reminder MVP and financial currency/tax rules.

After approval, implementation begins with Phase 1 only; no application code is included in this review package.
