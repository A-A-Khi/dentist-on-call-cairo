from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "ADMIN"
    DOCTOR = "DOCTOR"


class DoctorStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class PatientStatus(StrEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class VisitStatus(StrEnum):
    DRAFT = "DRAFT"
    COMPLETED = "COMPLETED"
    AMENDED = "AMENDED"


class ProcedureStatus(StrEnum):
    PLANNED = "PLANNED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class AppointmentStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


class AttachmentKind(StrEnum):
    XRAY = "XRAY"
    PHOTO_BEFORE = "PHOTO_BEFORE"
    PHOTO_AFTER = "PHOTO_AFTER"
    DOCUMENT = "DOCUMENT"
    OTHER = "OTHER"


class AttachmentStatus(StrEnum):
    PENDING = "PENDING"
    AVAILABLE = "AVAILABLE"
    REJECTED = "REJECTED"
    DELETED = "DELETED"


class TransactionType(StrEnum):
    REVENUE = "REVENUE"
    EXPENSE = "EXPENSE"


class TransactionStatus(StrEnum):
    POSTED = "POSTED"
    VOIDED = "VOIDED"


class NotificationChannel(StrEnum):
    IN_APP = "IN_APP"
    WEB_PUSH = "WEB_PUSH"
    EMAIL = "EMAIL"
    WHATSAPP = "WHATSAPP"
    SMS = "SMS"


class NotificationStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"
    READ = "READ"
