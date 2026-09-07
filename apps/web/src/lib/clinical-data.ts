export interface PatientRecord {
  id: string;
  code: string;
  fullName: string;
  dob: string;
  age: number;
  gender: "Male" | "Female";
  phone: string;
  whatsappPhone: string;
  email: string;
  address: string;
  sourceStreamId?: string | null;
  sourceStream?: string | null;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  assignedDoctor: string;
  status: "Active" | "In Treatment" | "Follow-up" | "Completed";
  lastVisit: string;
  nextAppointment: string | null;
  medicalAlerts: string[];
  medicalHistory: {
    allergies: string;
    conditions: string[];
    medications: string;
    surgeries: string;
    smokingStatus: "Non-smoker" | "Smoker" | "Former smoker";
    additionalNotes: string;
  };
  dentalHistory: {
    previousTreatment: string;
    extractions: string;
    rootCanals: string;
    gumProblems: string;
    sensitivity: string;
    lastVisitDate: string;
  };
}

export interface ClinicalVisit {
  id: string;
  patientId: string;
  patientName?: string;
  doctorName: string;
  date: string;
  time: string;
  chiefComplaint: string;
  clinicalFindings: string;
  diagnosis: string;
  procedures: {
    id: string;
    name: string;
    toothNumber?: string;
    status: "Completed" | "In Progress" | "Planned";
    costEGP: number;
    notes?: string;
  }[];
  attachments: {
    id: string;
    kind: "XRAY" | "PHOTO_BEFORE" | "PHOTO_AFTER" | "DOCUMENT";
    title: string;
    thumbnailUrl: string;
    url: string;
    date: string;
    uploadedBy: string;
  }[];
  doctorNotes: string;
  prescriptions?: string[];
  status: "Completed" | "Draft";
  totalCostEGP?: number;
  paidAmountEGP?: number;
  remainingEGP?: number;
}

export interface AppointmentRecord {
  id: string;
  patientCode: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  date: string;
  time: string;
  durationMinutes: number;
  procedure: string;
  chiefComplaint?: string;
  location: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  notes?: string;
}

export interface DoctorRecord {
  id: string;
  code: string;
  name: string;
  specialization: string;
  phone: string;
  activePatients: number;
  completedVisitsThisMonth: number;
  status: "ACTIVE" | "ON_LEAVE" | "INACTIVE";
}

export interface FinancialRecord {
  id: string;
  date: string;
  type: "REVENUE" | "EXPENSE";
  category: string;
  categoryId?: string;
  amountEGP: number;
  patientName?: string;
  patientCode?: string;
  doctorName?: string;
  description: string;
  status: "POSTED" | "VOIDED";
}

export interface FinancialCategory {
  id: string;
  transactionType: "REVENUE" | "EXPENSE";
  nameEn: string;
  nameAr?: string | null;
  isActive: boolean;
}

export interface CaseStream {
  id: string;
  nameEn: string;
  nameAr?: string | null;
  isActive: boolean;
}

export interface AuditLogRecord {
  id: string;
  time: string;
  user: string;
  role: "ADMIN" | "DOCTOR";
  action: string;
  target: string;
  description: string;
}

export type Patient = PatientRecord;
export type Visit = ClinicalVisit;
export type Appointment = AppointmentRecord;
export type Doctor = DoctorRecord;
export type FinancialTransaction = FinancialRecord;
export type AuditLog = AuditLogRecord;

// Clean clinical datasets without fake dummy data
export const INITIAL_PATIENTS: PatientRecord[] = [];

export const INITIAL_VISITS: ClinicalVisit[] = [];

export const INITIAL_APPOINTMENTS: AppointmentRecord[] = [];

export const INITIAL_DOCTORS: DoctorRecord[] = [
  {
    id: "doc-1",
    code: "DOC-DR-001",
    name: "Dr. Tarek Omar",
    specialization: "Oral & Maxillofacial Surgery",
    phone: "+20 100 123 4567",
    activePatients: 0,
    completedVisitsThisMonth: 0,
    status: "ACTIVE",
  },
];

export const INITIAL_FINANCIALS: FinancialRecord[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogRecord[] = [];
