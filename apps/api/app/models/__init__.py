"""Import mapped models so Alembic discovers one complete metadata graph."""

from app.models.audit import AuditLog
from app.models.identity import (
    AuthLoginAttempt,
    DoctorProfile,
    Organization,
    PasswordResetToken,
    RefreshSession,
    User,
)
from app.models.notifications import Notification, OutboxEvent, PushSubscription
from app.models.operations import (
    Attachment,
    AttachmentAccessEvent,
    FinancialCategory,
    FinancialTransaction,
    ProcedureCatalog,
)
from app.models.patients import (
    DentalHistory,
    MedicalHistory,
    MedicalHistoryFlag,
    Patient,
    PatientCareAssignment,
    PatientNote,
    Visit,
    VisitProcedure,
)
from app.models.scheduling import Appointment, AppointmentStatusEvent
from app.models.settings import SystemSetting

__all__ = [
    "Appointment",
    "AppointmentStatusEvent",
    "Attachment",
    "AttachmentAccessEvent",
    "AuthLoginAttempt",
    "AuditLog",
    "DentalHistory",
    "DoctorProfile",
    "FinancialCategory",
    "FinancialTransaction",
    "MedicalHistory",
    "MedicalHistoryFlag",
    "Notification",
    "Organization",
    "OutboxEvent",
    "PasswordResetToken",
    "Patient",
    "PatientCareAssignment",
    "PatientNote",
    "ProcedureCatalog",
    "PushSubscription",
    "RefreshSession",
    "SystemSetting",
    "User",
    "Visit",
    "VisitProcedure",
]
