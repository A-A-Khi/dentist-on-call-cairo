export interface PriceListItem {
  id: string;
  category: "Consultation" | "Preventive" | "Restorative" | "Endodontics" | "Surgery" | "Prosthodontics" | "Cosmetics";
  nameEn: string;
  nameAr: string;
  defaultCostEGP: number;
}

export const PROCEDURE_PRICE_LIST: PriceListItem[] = [
  {
    id: "consultation-exam",
    category: "Consultation",
    nameEn: "Consultation & Comprehensive Oral Examination",
    nameAr: "كشف وفحص سريري شامل",
    defaultCostEGP: 500,
  },
  {
    id: "emergency-pain",
    category: "Consultation",
    nameEn: "Emergency Examination & Acute Pain Relief",
    nameAr: "كشف طارئ وتسكين ألم حاد",
    defaultCostEGP: 1000,
  },
  {
    id: "scaling-polishing",
    category: "Preventive",
    nameEn: "Ultrasonic Scaling & Polishing (Full Mouth)",
    nameAr: "تنظيف جير وتلميع بالموجات الصوتية (كامل الفم)",
    defaultCostEGP: 800,
  },
  {
    id: "deep-curettage",
    category: "Preventive",
    nameEn: "Subgingival Curettage / Deep Cleaning (Per Quadrant)",
    nameAr: "تجريف لثوي عميق (ربع فك)",
    defaultCostEGP: 1200,
  },
  {
    id: "composite-posterior",
    category: "Restorative",
    nameEn: "Posterior Composite Restoration (Light-Cured)",
    nameAr: "حشو تجميلي خلفي ضوئي",
    defaultCostEGP: 1400,
  },
  {
    id: "composite-anterior",
    category: "Restorative",
    nameEn: "Anterior Cosmetic Composite Restoration",
    nameAr: "حشو تجميلي أمامي عالي الدقة",
    defaultCostEGP: 1600,
  },
  {
    id: "glass-ionomer",
    category: "Restorative",
    nameEn: "Glass Ionomer Base / Restoration",
    nameAr: "حشو زجاجي أيونومر وقائي",
    defaultCostEGP: 900,
  },
  {
    id: "rct-anterior",
    category: "Endodontics",
    nameEn: "Root Canal Treatment — Anterior Tooth",
    nameAr: "علاج جذور وسحب عصب (سن أمامي)",
    defaultCostEGP: 2200,
  },
  {
    id: "rct-premolar",
    category: "Endodontics",
    nameEn: "Root Canal Treatment — Premolar",
    nameAr: "علاج جذور وسحب عصب (ضاحك)",
    defaultCostEGP: 2800,
  },
  {
    id: "rct-molar",
    category: "Endodontics",
    nameEn: "Rotary Root Canal Treatment — Molar",
    nameAr: "علاج جذور وسحب عصب آلي (ضرس طاحن)",
    defaultCostEGP: 3500,
  },
  {
    id: "rct-retreatment",
    category: "Endodontics",
    nameEn: "Endodontic Retreatment (Complex Molar)",
    nameAr: "إعادة معالجة جذور معقدة (ضرس)",
    defaultCostEGP: 4200,
  },
  {
    id: "extraction-simple",
    category: "Surgery",
    nameEn: "Simple Permanent Tooth Extraction",
    nameAr: "خلع سن دائم بسيط",
    defaultCostEGP: 900,
  },
  {
    id: "extraction-surgical",
    category: "Surgery",
    nameEn: "Surgical Extraction / Root Tip Removal",
    nameAr: "خلع جراحي وإزالة جذور متبقية",
    defaultCostEGP: 2000,
  },
  {
    id: "extraction-wisdom",
    category: "Surgery",
    nameEn: "Impacted Third Molar (Wisdom) Surgical Disimpaction",
    nameAr: "جراحة خلع ضرس عقل مدفون",
    defaultCostEGP: 3200,
  },
  {
    id: "crown-pfm",
    category: "Prosthodontics",
    nameEn: "Porcelain Fused to Metal (PFM) Crown",
    nameAr: "تاج بورسلين مدمج بالمعدن",
    defaultCostEGP: 2800,
  },
  {
    id: "crown-zirconia",
    category: "Prosthodontics",
    nameEn: "High-Translucency Multilayer Zirconia Crown",
    nameAr: "تاج زيركونيا عالي الشفافية",
    defaultCostEGP: 4500,
  },
  {
    id: "crown-emax",
    category: "Prosthodontics",
    nameEn: "E-Max Lithium Disilicate Ceramic Crown / Veneer",
    nameAr: "تاج أو فينير سيراميك إيماكس",
    defaultCostEGP: 4800,
  },
  {
    id: "whitening-laser",
    category: "Cosmetics",
    nameEn: "In-Clinic Laser / LED Teeth Whitening (Power Bleaching)",
    nameAr: "تبييض أسنان ليزر / ضوئي في العيادة",
    defaultCostEGP: 4000,
  },
  {
    id: "implant-titanium",
    category: "Surgery",
    nameEn: "Titanium Dental Implant (Fixture Only)",
    nameAr: "زراعة سن (مسمار تيتانيوم)",
    defaultCostEGP: 14000,
  },
];
