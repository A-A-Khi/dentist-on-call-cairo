import { apiClient } from "./api-client";
import type { Appointment, AuditLogRecord, Doctor, FinancialTransaction, Patient, Visit } from "./clinical-data";

const STORAGE_KEYS = {
  PATIENTS: "doc_clinical_patients",
  VISITS: "doc_clinical_visits",
  APPOINTMENTS: "doc_clinical_appointments",
  FINANCIALS: "doc_clinical_financials",
};

function getLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, val: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // Ignore quota issues
  }
}

// -----------------------------
// PATIENTS API
// -----------------------------

export async function fetchPatients(query?: string): Promise<Patient[]> {
  try {
    const endpoint = query ? `/patients?q=${encodeURIComponent(query)}` : "/patients";
    const data = await apiClient<Patient[]>(endpoint);
    if (Array.isArray(data) && data.length > 0) {
      setLocal(STORAGE_KEYS.PATIENTS, data);
      return data;
    }
  } catch {
    // Fallback to local persistent cache
  }
  const cached = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
  if (!query) return cached;
  const q = query.toLowerCase();
  return cached.filter(
    (p) =>
      p.fullName.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.phone.includes(q)
  );
}

export async function fetchPatientById(patientId: string): Promise<Patient | null> {
  try {
    const data = await apiClient<Patient>(`/patients/${encodeURIComponent(patientId)}`);
    if (data && data.id) {
      return data;
    }
  } catch {
    // Fallback
  }
  const cached = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
  return cached.find((p) => p.code === patientId || p.id === patientId) || null;
}

export interface CreatePatientInput {
  fullName: string;
  dob?: string;
  gender?: "Male" | "Female";
  phone?: string;
  whatsappPhone?: string;
  email?: string;
  address?: string;
  emergencyContact?: { name: string; relationship: string; phone: string };
  assignedDoctorId?: string;
  medicalHistory?: {
    allergies?: string;
    conditions?: string;
    medications?: string;
    surgeries?: string;
    smokingStatus?: string;
    additionalNotes?: string;
  };
  dentalHistory?: {
    previousTreatment?: string;
    extractions?: string;
    rootCanals?: string;
    gumProblems?: string;
    sensitivity?: string;
    other?: string;
  };
}

export async function createPatientRecord(input: CreatePatientInput): Promise<{ id: string; code: string; fullName: string }> {
  try {
    const response = await apiClient<{ id: string; code: string; fullName: string }>("/patients", {
      method: "POST",
      body: JSON.stringify({
        full_name: input.fullName,
        date_of_birth: input.dob || null,
        gender: input.gender || "Male",
        phone: input.phone || null,
        whatsapp_phone: input.whatsappPhone || null,
        email: input.email || null,
        address: input.address || null,
        emergency_contact: input.emergencyContact || null,
        assigned_doctor_id: input.assignedDoctorId || null,
        medical_history: input.medicalHistory || null,
        dental_history: input.dentalHistory || null,
      }),
    });

    // Refresh local cache
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    const newRecord: Patient = {
      id: response.id,
      code: response.code,
      fullName: response.fullName,
      dob: input.dob || "",
      age: input.dob ? new Date().getFullYear() - new Date(input.dob).getFullYear() : 0,
      gender: input.gender || "Male",
      phone: input.phone || "—",
      whatsappPhone: input.whatsappPhone || "—",
      email: input.email || "",
      address: input.address || "",
      emergencyContact: input.emergencyContact || { name: "—", relationship: "—", phone: "—" },
      assignedDoctor: "Dr. Tarek Omar",
      status: "Active",
      lastVisit: new Date().toISOString().split("T")[0],
      nextAppointment: null,
      medicalAlerts: input.medicalHistory?.allergies ? [`Allergy: ${input.medicalHistory.allergies}`] : [],
      medicalHistory: {
        allergies: input.medicalHistory?.allergies || "None reported",
        conditions: input.medicalHistory?.conditions ? [input.medicalHistory.conditions] : [],
        medications: input.medicalHistory?.medications || "None",
        surgeries: input.medicalHistory?.surgeries || "None",
        smokingStatus: (input.medicalHistory?.smokingStatus as any) || "Non-smoker",
        additionalNotes: input.medicalHistory?.additionalNotes || "",
      },
      dentalHistory: {
        previousTreatment: input.dentalHistory?.previousTreatment || "None",
        extractions: input.dentalHistory?.extractions || "None",
        rootCanals: input.dentalHistory?.rootCanals || "None",
        gumProblems: input.dentalHistory?.gumProblems || "None",
        sensitivity: input.dentalHistory?.sensitivity || "None",
        lastVisitDate: "First visit",
      },
    };
    setLocal(STORAGE_KEYS.PATIENTS, [newRecord, ...existing]);
    return response;
  } catch {
    // Local offline creation fallback
    const existing = getLocal<Patient[]>(STORAGE_KEYS.PATIENTS, []);
    const nextNum = 100 + existing.length + 1;
    const code = `DOC-${String(nextNum).padStart(6, "0")}`;
    const id = `loc_${Date.now()}`;
    const newRecord: Patient = {
      id,
      code,
      fullName: input.fullName,
      dob: input.dob || "",
      age: input.dob ? new Date().getFullYear() - new Date(input.dob).getFullYear() : 0,
      gender: input.gender || "Male",
      phone: input.phone || "—",
      whatsappPhone: input.whatsappPhone || "—",
      email: input.email || "",
      address: input.address || "",
      emergencyContact: input.emergencyContact || { name: "—", relationship: "—", phone: "—" },
      assignedDoctor: "Dr. Tarek Omar",
      status: "Active",
      lastVisit: new Date().toISOString().split("T")[0],
      nextAppointment: null,
      medicalAlerts: input.medicalHistory?.allergies ? [`Allergy: ${input.medicalHistory.allergies}`] : [],
      medicalHistory: {
        allergies: input.medicalHistory?.allergies || "None reported",
        conditions: input.medicalHistory?.conditions ? [input.medicalHistory.conditions] : [],
        medications: input.medicalHistory?.medications || "None",
        surgeries: input.medicalHistory?.surgeries || "None",
        smokingStatus: (input.medicalHistory?.smokingStatus as any) || "Non-smoker",
        additionalNotes: input.medicalHistory?.additionalNotes || "",
      },
      dentalHistory: {
        previousTreatment: input.dentalHistory?.previousTreatment || "None",
        extractions: input.dentalHistory?.extractions || "None",
        rootCanals: input.dentalHistory?.rootCanals || "None",
        gumProblems: input.dentalHistory?.gumProblems || "None",
        sensitivity: input.dentalHistory?.sensitivity || "None",
        lastVisitDate: "First visit",
      },
    };
    setLocal(STORAGE_KEYS.PATIENTS, [newRecord, ...existing]);
    return { id, code, fullName: input.fullName };
  }
}

// -----------------------------
// VISITS API
// -----------------------------

export async function fetchPatientVisits(patientIdentifier: string): Promise<Visit[]> {
  try {
    const data = await apiClient<Visit[]>(`/patients/${encodeURIComponent(patientIdentifier)}/visits`);
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch {
    // Fallback
  }
  const cached = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
  return cached.filter((v) => v.patientId === patientIdentifier);
}

export interface CreateVisitInput {
  patientIdentifier: string;
  chiefComplaint: string;
  clinicalFindings: string;
  diagnosis: string;
  doctorNotes: string;
  prescriptions: string;
  procedures: { name: string; toothNumber?: string; costEGP: number }[];
  status?: "Completed" | "Draft";
}

export async function recordClinicalVisit(input: CreateVisitInput): Promise<{ id: string; status: string }> {
  try {
    const response = await apiClient<{ id: string; status: string }>(
      `/patients/${encodeURIComponent(input.patientIdentifier)}/visits`,
      {
        method: "POST",
        body: JSON.stringify({
          chief_complaint: input.chiefComplaint,
          clinical_findings: input.clinicalFindings,
          diagnosis: input.diagnosis,
          doctor_notes: input.doctorNotes,
          prescriptions: input.prescriptions,
          procedures: input.procedures.map((p) => ({
            name: p.name,
            tooth_number: p.toothNumber || null,
            cost_egp: p.costEGP || 0,
          })),
          status: input.status || "Completed",
        }),
      }
    );

    // Save locally
    const existing = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const newVisit: Visit = {
      id: response.id,
      patientId: input.patientIdentifier,
      doctorName: "Dr. Tarek Omar",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      chiefComplaint: input.chiefComplaint || "—",
      clinicalFindings: input.clinicalFindings || "—",
      diagnosis: input.diagnosis || "—",
      procedures: input.procedures.map((p, i) => ({
        id: `proc_${i}_${Date.now()}`,
        name: p.name,
        toothNumber: p.toothNumber || "General",
        costEGP: p.costEGP,
        status: "Completed",
      })),
      attachments: [],
      doctorNotes: input.doctorNotes || "—",
      prescriptions: input.prescriptions ? [input.prescriptions] : [],
      status: "Completed",
    };
    setLocal(STORAGE_KEYS.VISITS, [newVisit, ...existing]);

    // Financial revenue posting
    const totalCost = input.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
    if (totalCost > 0) {
      const existingTx = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
      const procList = input.procedures.map((p) => `${p.name}${p.toothNumber ? ` (#${p.toothNumber})` : ""}`).join(", ");
      const newTx: FinancialTransaction = {
        id: `TX-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split("T")[0],
        type: "REVENUE",
        category: "Clinical Procedures",
        amountEGP: totalCost,
        patientName: input.patientIdentifier,
        patientCode: input.patientIdentifier,
        doctorName: "Dr. Tarek Omar",
        description: `Procedures: ${procList}`,
        status: "POSTED",
      };
      setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existingTx]);
    }

    return response;
  } catch {
    const id = `visit_${Date.now()}`;
    const existing = getLocal<Visit[]>(STORAGE_KEYS.VISITS, []);
    const newVisit: Visit = {
      id,
      patientId: input.patientIdentifier,
      doctorName: "Dr. Tarek Omar",
      date: new Date().toISOString().split("T")[0],
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      chiefComplaint: input.chiefComplaint || "—",
      clinicalFindings: input.clinicalFindings || "—",
      diagnosis: input.diagnosis || "—",
      procedures: input.procedures.map((p, i) => ({
        id: `proc_${i}_${Date.now()}`,
        name: p.name,
        toothNumber: p.toothNumber || "General",
        costEGP: p.costEGP,
        status: "Completed",
      })),
      attachments: [],
      doctorNotes: input.doctorNotes || "—",
      prescriptions: input.prescriptions ? [input.prescriptions] : [],
      status: "Completed",
    };
    setLocal(STORAGE_KEYS.VISITS, [newVisit, ...existing]);

    // Financial revenue posting on local fallback
    const totalCost = input.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
    if (totalCost > 0) {
      const existingTx = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
      const procList = input.procedures.map((p) => `${p.name}${p.toothNumber ? ` (#${p.toothNumber})` : ""}`).join(", ");
      const newTx: FinancialTransaction = {
        id: `TX-${Date.now().toString().slice(-6)}`,
        date: new Date().toISOString().split("T")[0],
        type: "REVENUE",
        category: "Clinical Procedures",
        amountEGP: totalCost,
        patientName: input.patientIdentifier,
        patientCode: input.patientIdentifier,
        doctorName: "Dr. Tarek Omar",
        description: `Procedures: ${procList}`,
        status: "POSTED",
      };
      setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existingTx]);
    }

    return { id, status: "Completed" };
  }
}

// -----------------------------
// APPOINTMENTS API
// -----------------------------

export async function fetchAppointments(statusFilter?: string): Promise<Appointment[]> {
  try {
    const endpoint = statusFilter ? `/appointments?status=${statusFilter}` : "/appointments";
    const data = await apiClient<Appointment[]>(endpoint);
    if (Array.isArray(data) && data.length > 0) {
      setLocal(STORAGE_KEYS.APPOINTMENTS, data);
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
}

export async function scheduleAppointment(input: {
  patientIdOrCode: string;
  doctorName?: string;
  date: string;
  time: string;
  procedure?: string;
  chiefComplaint?: string;
  location?: string;
  durationMinutes?: number;
}): Promise<{ id: string; status: string }> {
  try {
    const response = await apiClient<{ id: string; status: string }>("/appointments", {
      method: "POST",
      body: JSON.stringify({
        patient_id_or_code: input.patientIdOrCode,
        doctor_name: input.doctorName || "Dr. Tarek Omar",
        date: input.date,
        time: input.time,
        procedure: input.procedure || "Clinical Consultation",
        chief_complaint: input.chiefComplaint || input.procedure || "Clinical Consultation",
        location: input.location || "Room 1 — Main Operatory",
        duration_minutes: input.durationMinutes || 30,
      }),
    });
    return response;
  } catch {
    const id = `apt_${Date.now()}`;
    const existing = getLocal<Appointment[]>(STORAGE_KEYS.APPOINTMENTS, []);
    const newApt: Appointment = {
      id,
      patientCode: input.patientIdOrCode,
      patientName: "Scheduled Patient",
      patientPhone: "—",
      doctorName: input.doctorName || "Dr. Tarek Omar",
      date: input.date,
      time: input.time,
      durationMinutes: input.durationMinutes || 30,
      procedure: input.procedure || "Clinical Consultation",
      chiefComplaint: input.chiefComplaint || input.procedure || "Clinical Consultation",
      location: input.location || "Room 1",
      status: "CONFIRMED",
    };
    setLocal(STORAGE_KEYS.APPOINTMENTS, [...existing, newApt]);
    return { id, status: "CONFIRMED" };
  }
}

// -----------------------------
// FINANCIALS API
// -----------------------------

export async function fetchFinancialTransactions(): Promise<FinancialTransaction[]> {
  try {
    const data = await apiClient<FinancialTransaction[]>("/financials/transactions");
    if (Array.isArray(data) && data.length > 0) {
      setLocal(STORAGE_KEYS.FINANCIALS, data);
      return data;
    }
  } catch {
    // Fallback
  }
  return getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
}

export async function postFinancialTransaction(input: {
  type: "REVENUE" | "EXPENSE";
  amountEGP: number;
  description: string;
  patientIdOrCode?: string;
  categoryName?: string;
}): Promise<{ id: string; status: string }> {
  try {
    const response = await apiClient<{ id: string; status: string }>("/financials/transactions", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        amount_egp: input.amountEGP,
        description: input.description,
        patient_id_or_code: input.patientIdOrCode || null,
        category_name: input.categoryName || (input.type === "REVENUE" ? "Clinical Treatment" : "Operating Expense"),
      }),
    });
    return response;
  } catch {
    const id = `tx_${Date.now()}`;
    const existing = getLocal<FinancialTransaction[]>(STORAGE_KEYS.FINANCIALS, []);
    const newTx: FinancialTransaction = {
      id,
      date: new Date().toISOString().split("T")[0],
      type: input.type,
      category: input.categoryName || (input.type === "REVENUE" ? "Clinical Treatment" : "Operating Expense"),
      amountEGP: input.amountEGP,
      patientName: input.patientIdOrCode ? "Patient" : undefined,
      patientCode: input.patientIdOrCode,
      doctorName: "Dr. Tarek Omar",
      description: input.description,
      status: "POSTED",
    };
    setLocal(STORAGE_KEYS.FINANCIALS, [newTx, ...existing]);
    return { id, status: "POSTED" };
  }
}

// -----------------------------
// DOCTORS API
// -----------------------------

export async function fetchDoctors(): Promise<Doctor[]> {
  try {
    const data = await apiClient<Doctor[]>("/doctors");
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch {
    // Fallback
  }
  return [
    {
      id: "doc-1",
      code: "DOC-DR-001",
      name: "Dr. Tarek Omar",
      specialization: "Endodontics & Aesthetic Dentistry",
      phone: "+20 100 123 4567",
      activePatients: 0,
      completedVisitsThisMonth: 0,
      status: "ACTIVE",
    },
  ];
}

// -----------------------------
// AUDIT LOGS API
// -----------------------------

export async function fetchAuditLogs(): Promise<AuditLogRecord[]> {
  try {
    const data = await apiClient<any[]>("/audit/logs");
    if (Array.isArray(data) && data.length > 0) {
      return data.map((d: any) => ({
        id: d.id,
        user: d.actor_user_id ? "Operations Staff" : "System Admin",
        role: (d.actor_role as "ADMIN" | "DOCTOR") || "ADMIN",
        action: d.action,
        target: d.target_id || "System",
        time: new Date(d.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        description: d.description || "",
      }));
    }
  } catch {
    // Fallback
  }
  return [];
}
