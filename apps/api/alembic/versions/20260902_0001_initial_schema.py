"""Initial organization-scoped Dentist on Call schema.

Revision ID: 20260902_0001
Revises:
Create Date: 2026-09-02
"""

from alembic import op

revision = "20260902_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "citext"')
    for name, values in {
        "user_role": "'ADMIN', 'DOCTOR'",
        "doctor_status": "'ACTIVE', 'INACTIVE'",
        "patient_status": "'ACTIVE', 'INACTIVE'",
        "visit_status": "'DRAFT', 'COMPLETED', 'AMENDED'",
        "procedure_status": "'PLANNED', 'COMPLETED', 'CANCELLED'",
        "appointment_status": "'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'",
        "attachment_kind": "'XRAY', 'PHOTO_BEFORE', 'PHOTO_AFTER', 'DOCUMENT', 'OTHER'",
        "attachment_status": "'PENDING', 'AVAILABLE', 'REJECTED', 'DELETED'",
        "transaction_type": "'REVENUE', 'EXPENSE'",
        "transaction_status": "'POSTED', 'VOIDED'",
        "notification_channel": "'IN_APP', 'WEB_PUSH', 'EMAIL', 'WHATSAPP', 'SMS'",
        "notification_status": "'PENDING', 'SENT', 'FAILED', 'READ'",
    }.items():
        op.execute(f"CREATE TYPE {name} AS ENUM ({values})")

    statements = [
        """
        CREATE TABLE organizations (
          id uuid PRIMARY KEY, name varchar(160) NOT NULL, timezone varchar(64) NOT NULL DEFAULT 'Africa/Cairo',
          default_locale varchar(8) NOT NULL DEFAULT 'en', currency_code varchar(3) NOT NULL DEFAULT 'EGP',
          is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE users (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          email citext NOT NULL, password_hash varchar(255) NOT NULL, role user_role NOT NULL, display_name varchar(160) NOT NULL,
          is_active boolean NOT NULL DEFAULT true, last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_users_organization_email UNIQUE (organization_id, email)
        )
        """,
        """
        CREATE TABLE doctor_profiles (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, doctor_code varchar(32) NOT NULL, phone varchar(32),
          specialization varchar(160), profile_attachment_id uuid, status doctor_status NOT NULL DEFAULT 'ACTIVE',
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_doctor_profiles_organization_user UNIQUE (organization_id, user_id),
          CONSTRAINT uq_doctor_profiles_organization_code UNIQUE (organization_id, doctor_code)
        )
        """,
        """
        CREATE TABLE settings (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          key varchar(160) NOT NULL, value_json jsonb NOT NULL, scope varchar(32) NOT NULL DEFAULT 'ORGANIZATION',
          updated_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_settings_organization_key UNIQUE (organization_id, key)
        )
        """,
        """
        CREATE TABLE refresh_sessions (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, token_hash varchar(255) NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL, revoked_at timestamptz, rotated_from_id uuid REFERENCES refresh_sessions(id),
          ip_hash varchar(128), user_agent text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE password_reset_tokens (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, token_hash varchar(255) NOT NULL UNIQUE,
          expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE procedure_catalog (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          name_en varchar(160) NOT NULL, name_ar varchar(160), is_custom boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
          default_cost_minor bigint, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_procedure_catalog_organization_name_en UNIQUE (organization_id, name_en)
        )
        """,
        """
        CREATE TABLE financial_categories (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          transaction_type transaction_type NOT NULL, name_en varchar(160) NOT NULL, name_ar varchar(160), is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_financial_categories_org_type_name UNIQUE (organization_id, transaction_type, name_en)
        )
        """,
        """
        CREATE TABLE patients (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_number bigint NOT NULL, patient_code varchar(32) NOT NULL, full_name varchar(200) NOT NULL, date_of_birth date,
          gender varchar(32), phone varchar(32), whatsapp_phone varchar(32), email varchar(255), address text, emergency_contact jsonb,
          notes text, status patient_status NOT NULL DEFAULT 'ACTIVE', deleted_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_patients_organization_number UNIQUE (organization_id, patient_number),
          CONSTRAINT uq_patients_organization_code UNIQUE (organization_id, patient_code)
        )
        """,
        """
        CREATE TABLE medical_histories (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, conditions_text text, medications_text text,
          drug_allergies_text text, food_allergies_text text, surgeries_text text, hospitalization_text text, family_history_text text,
          smoking_status varchar(64), additional_notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_medical_histories_organization_patient UNIQUE (organization_id, patient_id)
        )
        """,
        """
        CREATE TABLE medical_history_flags (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          medical_history_id uuid NOT NULL REFERENCES medical_histories(id) ON DELETE RESTRICT, code varchar(64) NOT NULL,
          value boolean NOT NULL DEFAULT false, details text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_medical_history_flags_history_code UNIQUE (medical_history_id, code)
        )
        """,
        """
        CREATE TABLE dental_histories (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, previous_treatment_text text, extractions_text text,
          root_canal_text text, implants_text text, orthodontics_text text, gum_problems_text text, sensitivity_text text,
          bleeding_gums_text text, tmj_text text, trauma_text text, last_dental_visit_on date, other_text text,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_dental_histories_organization_patient UNIQUE (organization_id, patient_id)
        )
        """,
        """
        CREATE TABLE patient_care_assignments (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
          assigned_by_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, assigned_at timestamptz NOT NULL, unassigned_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE appointments (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, doctor_id uuid REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
          starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
          reason text, location varchar(255), status appointment_status NOT NULL DEFAULT 'PENDING', notes text,
          created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, cancelled_at timestamptz, completed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at)
        )
        """,
        """
        CREATE TABLE appointment_status_events (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT, from_status appointment_status,
          to_status appointment_status NOT NULL, changed_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          reason text, occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE visits (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, doctor_id uuid NOT NULL REFERENCES doctor_profiles(id) ON DELETE RESTRICT,
          appointment_id uuid REFERENCES appointments(id) ON DELETE RESTRICT, occurred_at timestamptz NOT NULL, chief_complaint text,
          clinical_findings text, diagnosis_text text, treatment_notes text, doctor_notes text, status visit_status NOT NULL DEFAULT 'DRAFT',
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE visit_procedures (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          visit_id uuid NOT NULL REFERENCES visits(id) ON DELETE RESTRICT, catalog_procedure_id uuid REFERENCES procedure_catalog(id) ON DELETE RESTRICT,
          procedure_name varchar(160) NOT NULL, description text, status procedure_status NOT NULL DEFAULT 'PLANNED', cost_minor bigint,
          currency_code varchar(3), notes text, performed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CHECK (cost_minor IS NULL OR cost_minor >= 0)
        )
        """,
        """
        CREATE TABLE patient_notes (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, author_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          body text NOT NULL, visibility varchar(32) NOT NULL DEFAULT 'CARE_TEAM', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE attachments (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, visit_id uuid REFERENCES visits(id) ON DELETE RESTRICT,
          uploaded_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, kind attachment_kind NOT NULL, storage_key varchar(512) NOT NULL,
          original_filename varchar(255) NOT NULL, safe_filename varchar(255) NOT NULL, mime_type varchar(127) NOT NULL, size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
          sha256 varchar(64), description text, status attachment_status NOT NULL DEFAULT 'PENDING', deleted_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT uq_attachments_storage_key UNIQUE (storage_key)
        )
        """,
        """
        CREATE TABLE financial_transactions (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          type transaction_type NOT NULL, category_id uuid NOT NULL REFERENCES financial_categories(id) ON DELETE RESTRICT,
          amount_minor bigint NOT NULL CHECK (amount_minor > 0), currency_code varchar(3) NOT NULL, description text,
          patient_id uuid REFERENCES patients(id) ON DELETE RESTRICT, visit_id uuid REFERENCES visits(id) ON DELETE RESTRICT,
          doctor_id uuid REFERENCES doctor_profiles(id) ON DELETE RESTRICT, effective_on date NOT NULL, status transaction_status NOT NULL DEFAULT 'POSTED',
          reversal_of_id uuid REFERENCES financial_transactions(id) ON DELETE RESTRICT, created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          voided_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE attachment_access_events (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE RESTRICT,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, action varchar(32) NOT NULL,
          occurred_at timestamptz NOT NULL, ip_hash varchar(128),
          created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE notifications (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          recipient_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, type varchar(100) NOT NULL, title_key varchar(160) NOT NULL,
          body_key varchar(160) NOT NULL, payload jsonb, channel notification_channel NOT NULL, status notification_status NOT NULL DEFAULT 'PENDING',
          scheduled_for timestamptz, sent_at timestamptz, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE push_subscriptions (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL,
          expires_at timestamptz, disabled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_push_subscriptions_user_endpoint UNIQUE (user_id, endpoint)
        )
        """,
        """
        CREATE TABLE outbox_events (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          topic varchar(160) NOT NULL, payload jsonb NOT NULL, available_at timestamptz NOT NULL, processed_at timestamptz,
          attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0), last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
        )
        """,
        """
        CREATE TABLE audit_logs (
          id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          actor_user_id uuid REFERENCES users(id) ON DELETE RESTRICT, actor_role varchar(32), action varchar(32) NOT NULL,
          target_type varchar(100) NOT NULL, target_id uuid, description text NOT NULL, metadata_json jsonb, occurred_at timestamptz NOT NULL,
          request_id varchar(64), ip_hash varchar(128)
        )
        """,
    ]
    for statement in statements:
        op.execute(statement)

    for statement in [
        "CREATE INDEX ix_patients_organization_phone ON patients (organization_id, phone)",
        "CREATE INDEX ix_patients_organization_created_at ON patients (organization_id, created_at)",
        "CREATE INDEX ix_patient_care_assignments_patient_doctor ON patient_care_assignments (patient_id, doctor_id)",
        "CREATE INDEX ix_visits_organization_patient_occurred_at ON visits (organization_id, patient_id, occurred_at DESC)",
        "CREATE INDEX ix_visits_doctor_occurred_at ON visits (doctor_id, occurred_at DESC)",
        "CREATE INDEX ix_appointments_organization_doctor_starts_at ON appointments (organization_id, doctor_id, starts_at)",
        "CREATE INDEX ix_appointments_organization_starts_at ON appointments (organization_id, starts_at)",
        "CREATE INDEX ix_financial_transactions_organization_effective_type ON financial_transactions (organization_id, effective_on, type)",
        "CREATE INDEX ix_audit_logs_organization_occurred_at ON audit_logs (organization_id, occurred_at DESC)",
        "CREATE INDEX ix_audit_logs_target ON audit_logs (target_type, target_id)",
    ]:
        op.execute(statement)


def downgrade() -> None:
    tables = [
        "audit_logs", "outbox_events", "push_subscriptions", "notifications", "attachment_access_events", "financial_transactions", "attachments",
        "patient_notes", "visit_procedures", "visits", "appointment_status_events", "appointments", "patient_care_assignments",
        "dental_histories", "medical_history_flags", "medical_histories", "patients", "financial_categories", "procedure_catalog",
        "password_reset_tokens", "refresh_sessions", "settings", "doctor_profiles", "users", "organizations",
    ]
    for table in tables:
        op.execute(f"DROP TABLE {table}")
    for name in [
        "notification_status", "notification_channel", "transaction_status", "transaction_type", "attachment_status", "attachment_kind",
        "appointment_status", "procedure_status", "visit_status", "patient_status", "doctor_status", "user_role",
    ]:
        op.execute(f"DROP TYPE {name}")
