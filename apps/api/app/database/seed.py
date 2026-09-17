import os
import sys
from uuid import uuid4

from sqlalchemy import select

from app.auth.security import hash_password
from app.core.config import get_settings
from app.database.session import get_session_factory
from app.models.enums import DoctorStatus, TransactionType, UserRole
from app.models.identity import DoctorProfile, Organization, User
from app.models.operations import CaseStream, FinancialCategory, ProcedureCatalog
from app.models.settings import SystemSetting


def seed_database() -> None:
    settings = get_settings()
    admin_password = settings.seed_admin_password or os.environ.get("SEED_ADMIN_PASSWORD")
    doctor_password = settings.seed_doctor_password or os.environ.get("SEED_DOCTOR_PASSWORD")
    if not admin_password or not doctor_password:
        raise RuntimeError(
            "SEED_DEMO_DATA requires SEED_ADMIN_PASSWORD and SEED_DOCTOR_PASSWORD "
            "(min 12 characters). Passwords are never logged."
        )
    if len(admin_password) < 12 or len(doctor_password) < 12:
        raise RuntimeError("Seed passwords must be at least 12 characters.")

    session_factory = get_session_factory()
    with session_factory() as session:
        # 1. Organization
        org = session.scalar(select(Organization).limit(1))
        if org is None:
            org = Organization(
                id=uuid4(),
                name="Dentist on Call Cairo",
                timezone="Africa/Cairo",
                default_locale="en",
                currency_code="EGP",
                is_active=True,
            )
            session.add(org)
            session.flush()
            print(f"[Seed] Created Organization: {org.name} ({org.id})")
        else:
            print(f"[Seed] Existing Organization found: {org.name} ({org.id})")

        # 2. Administrator User
        admin_email = "admin@dentistoncall.eg"
        admin = session.scalar(
            select(User).where(User.organization_id == org.id, User.email == admin_email)
        )
        if admin is None:
            admin = User(
                id=uuid4(),
                organization_id=org.id,
                email=admin_email,
                password_hash=hash_password(admin_password),
                role=UserRole.ADMIN,
                display_name="Clinic Administrator",
                is_active=True,
            )
            session.add(admin)
            session.flush()
            print(f"[Seed] Created Admin: {admin.email}")
        else:
            print(f"[Seed] Existing Admin found: {admin.email}")

        # 3. Doctor User & Profile
        doctor_email = "doctor@dentistoncall.eg"
        doctor_user = session.scalar(
            select(User).where(User.organization_id == org.id, User.email == doctor_email)
        )
        if doctor_user is None:
            doctor_user = User(
                id=uuid4(),
                organization_id=org.id,
                email=doctor_email,
                password_hash=hash_password(doctor_password),
                role=UserRole.DOCTOR,
                display_name="Dr. Sayed El-Bahy",
                is_active=True,
            )
            session.add(doctor_user)
            session.flush()

            doctor_profile = DoctorProfile(
                id=uuid4(),
                organization_id=org.id,
                user_id=doctor_user.id,
                doctor_code="DOC-DR-001",
                phone="+201001234567",
                specialization="Oral & Maxillofacial Surgery",
                status=DoctorStatus.ACTIVE,
            )
            session.add(doctor_profile)
            session.flush()
            print(f"[Seed] Created Doctor: {doctor_user.email} (Code: DOC-DR-001)")
        else:
            if doctor_user.display_name != "Dr. Sayed El-Bahy":
                doctor_user.display_name = "Dr. Sayed El-Bahy"
                print(f"[Seed] Updated Doctor display name: {doctor_user.email} -> Dr. Sayed El-Bahy")
            else:
                print(f"[Seed] Existing Doctor found: {doctor_user.email}")

        # 4. Procedure Catalog
        procedures = [
            ("Consultation & Examination", "فحص واستشارة", 50000),
            ("Dental Scaling & Polishing", "تنظيف وتلميع الأسنان", 80000),
            ("Composite Resin Filling", "حشو تجميلي كومبوزيت", 120000),
            ("Root Canal Treatment", "علاج جذور وعصب", 250000),
            ("Surgical Extraction", "خلع جراحي", 180000),
            ("Ceramic Crown", "تركيب تاج سيراميك", 350000),
        ]
        for name_en, name_ar, cost in procedures:
            proc = session.scalar(
                select(ProcedureCatalog).where(
                    ProcedureCatalog.organization_id == org.id,
                    ProcedureCatalog.name_en == name_en,
                )
            )
            if proc is None:
                session.add(
                    ProcedureCatalog(
                        organization_id=org.id,
                        name_en=name_en,
                        name_ar=name_ar,
                        is_custom=False,
                        is_active=True,
                        default_cost_minor=cost,
                    )
                )
        print("[Seed] Procedure catalog verified.")

        # 5. Financial Categories
        categories = [
            (TransactionType.REVENUE, "Clinical Services", "خدمات علاجية"),
            (TransactionType.REVENUE, "Emergency Care", "خدمات طوارئ"),
            (TransactionType.EXPENSE, "Social Media Ads", "إعلانات وسائل التواصل"),
            (TransactionType.EXPENSE, "Materials", "مواد ومستلزمات"),
            (TransactionType.EXPENSE, "Dental Supplies & Consumables", "مستلزمات ومواد طبية"),
            (TransactionType.EXPENSE, "Dental Laboratory Fees", "مصاريف معامل الأسنان"),
            (TransactionType.EXPENSE, "Clinic Operating Overhead", "مصاريف تشغيلية"),
            (TransactionType.EXPENSE, "Partnerships & Referrals", "شراكات وإحالات"),
        ]
        for tx_type, name_en, name_ar in categories:
            cat = session.scalar(
                select(FinancialCategory).where(
                    FinancialCategory.organization_id == org.id,
                    FinancialCategory.transaction_type == tx_type,
                    FinancialCategory.name_en == name_en,
                )
            )
            if cat is None:
                session.add(
                    FinancialCategory(
                        organization_id=org.id,
                        transaction_type=tx_type,
                        name_en=name_en,
                        name_ar=name_ar,
                        is_active=True,
                    )
                )
        print("[Seed] Financial categories verified.")

        # 5b. Case Streams (patient acquisition sources)
        streams = [
            ("Social Media Ads", "إعلانات وسائل التواصل"),
            ("Partnership Clinics", "عيادات شريكة"),
            ("Walk-in", "حضور مباشر"),
            ("Patient Referral", "إحالة من مريض"),
            ("Emergency Hotline", "خط الطوارئ"),
        ]
        for name_en, name_ar in streams:
            stream = session.scalar(
                select(CaseStream).where(
                    CaseStream.organization_id == org.id,
                    CaseStream.name_en == name_en,
                )
            )
            if stream is None:
                session.add(
                    CaseStream(
                        organization_id=org.id,
                        name_en=name_en,
                        name_ar=name_ar,
                        is_active=True,
                        referral_percent=10 if name_en == "Partnership Clinics" else 0,
                    )
                )
            elif name_en == "Partnership Clinics" and stream.referral_percent == 0:
                # Sensible default for partnership referrers if never configured.
                stream.referral_percent = 10
        print("[Seed] Case streams verified.")

        # 6. Default Settings
        settings_data = [
            ("clinic_info", {"name": "Dentist on Call Cairo", "phone": "+201000000000", "address": "New Cairo, Egypt"}),
            ("working_hours", {"start": "09:00", "end": "22:00", "days": ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"]}),
        ]
        for key, val in settings_data:
            setting = session.scalar(
                select(SystemSetting).where(
                    SystemSetting.organization_id == org.id,
                    SystemSetting.key == key,
                )
            )
            if setting is None:
                session.add(
                    SystemSetting(
                        organization_id=org.id,
                        key=key,
                        value_json=val,
                        scope="ORGANIZATION",
                    )
                )
        print("[Seed] Default clinic settings verified.")

        session.commit()
        print("[Seed] Database seeding completed successfully.")


if __name__ == "__main__":
    try:
        seed_database()
    except Exception as exc:
        print(f"[Seed Error] {exc}", file=sys.stderr)
        sys.exit(1)
