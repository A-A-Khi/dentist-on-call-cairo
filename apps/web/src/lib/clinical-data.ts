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

export interface RevenueShare {
  doctorPercent: number;
  assistantPercent: number;
  referralPercent: number;
  orgPercent: number;
  paidEGP?: number;
  caseCostEGP?: number;
  caseCostNote?: string | null;
  basisEGP: number;
  doctorEGP: number;
  assistantEGP: number;
  referralEGP: number;
  orgEGP: number;
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
    costEGP?: number | null;
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
  status: "Completed" | "Draft" | "Amended";
  totalCostEGP?: number;
  paidAmountEGP?: number;
  remainingEGP?: number;
  caseCostEGP?: number;
  caseCostNote?: string | null;
  sourceStreamId?: string | null;
  sourceStream?: string | null;
  revenueShare?: RevenueShare;
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
  visitId?: string | null;
  isManual?: boolean;
}

export interface FinancialCategory {
  id: string;
  transactionType: "REVENUE" | "EXPENSE";
  nameEn: string;
  nameAr?: string | null;
  isActive: boolean;
}

export interface FinancialSummary {
  grossCollectedEGP: number;
  caseCostsEGP?: number;
  splitBasisEGP?: number;
  doctorShareEGP: number;
  assistantShareEGP: number;
  referralShareEGP: number;
  clinicShareEGP: number;
  manualRevenueEGP: number;
  totalExpensesEGP: number;
  netClinicProfitEGP: number;
  paidVisitCount: number;
  avgCaseEGP: number;
}

export interface CaseStream {
  id: string;
  nameEn: string;
  nameAr?: string | null;
  isActive: boolean;
  /** Admin-configured referrer share (0–50). Omitted for medical staff. */
  referralPercent?: number;
}

export interface ReportSourceBreakdown {
  streamId: string | null;
  nameEn: string;
  nameAr?: string | null;
  referralPercent: number;
  isOwnedChannel: boolean;
  visitCount: number;
  patientCount: number;
  percentOfVisits: number;
  paidEGP: number;
  treatmentValueEGP: number;
  clinicShareEGP: number;
  referralShareEGP: number;
  doctorShareEGP: number;
  assistantShareEGP: number;
}

export interface ReportTimeBucket {
  visits: number;
  paidEGP: number;
  clinicShareEGP: number;
  treatmentValueEGP: number;
}

export interface ReportCaseRow {
  visitId: string;
  occurredAt: string;
  patientName: string;
  paidEGP: number;
  caseCostEGP: number;
  caseCostNote?: string | null;
  splitBasisEGP: number;
  doctorEGP: number;
  assistantEGP: number;
  referralEGP: number;
  clinicEGP: number;
  doctorPercent: number;
  assistantPercent: number;
  referralPercent: number;
  orgPercent: number;
}

export interface ReportAnalytics {
  period: { preset: string; from: string; to: string };
  totals: {
    visits: number;
    patients: number;
    newPatients: number;
    grossCollectedEGP: number;
    caseCostsEGP: number;
    splitBasisEGP: number;
    treatmentValueEGP: number;
    doctorShareEGP: number;
    assistantShareEGP: number;
    referralShareEGP: number;
    clinicShareEGP: number;
    outstandingEGP: number;
    avgPaidPerVisitEGP: number;
    collectionRatePercent: number;
  };
  bySource: ReportSourceBreakdown[];
  byDay: Array<ReportTimeBucket & { date: string }>;
  byMonth: Array<ReportTimeBucket & { month: string }>;
  byDoctor: Array<{
    doctorId: string;
    name: string;
    visits: number;
    paidEGP: number;
    clinicShareEGP: number;
  }>;
  topProcedures: Array<{
    name: string;
    count: number;
    revenueEGP: number;
    percentOfRevenue: number;
  }>;
  cases: ReportCaseRow[];
  insights: {
    peakDay: (ReportTimeBucket & { date: string }) | null;
    peakMonth: (ReportTimeBucket & { month: string }) | null;
    ownedChannelVisits: number;
    referrerChannelVisits: number;
  };
  filterOptions: {
    streams: Array<{
      id: string;
      nameEn: string;
      nameAr?: string | null;
      referralPercent: number;
      isActive: boolean;
    }>;
    doctors: Array<{ id: string; name: string }>;
  };
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

export interface DashboardOverviewMonth {
  from: string;
  to: string;
  grossCollectedEGP: number;
  clinicShareEGP: number;
  netClinicProfitEGP: number;
  byDay: Array<{ date: string; paidEGP: number; clinicShareEGP: number }>;
}

export interface DashboardOverview {
  role: "ADMIN" | "DOCTOR";
  counts: {
    patients?: number;
    doctors?: number;
    todayAppointments?: number;
    todayQueue?: number;
    patientsInCare?: number;
  };
  month?: DashboardOverviewMonth;
  todaySchedule?: AppointmentRecord[];
  recentPatients?: Array<{ id: string; code: string; fullName: string; lastVisit: string }>;
  todayQueue?: AppointmentRecord[];
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
    name: "Dr. Sayed El-Bahy",
    specialization: "Oral & Maxillofacial Surgery",
    phone: "+20 100 123 4567",
    activePatients: 0,
    completedVisitsThisMonth: 0,
    status: "ACTIVE",
  },
];

export const INITIAL_FINANCIALS: FinancialRecord[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogRecord[] = [];
