export type NavRole = "ADMIN" | "DOCTOR";

export interface NavDict {
  dashboard: string;
  patients: string;
  calendar: string;
  reservations: string;
  doctors: string;
  financials: string;
  reports: string;
  activity: string;
  settings: string;
  more?: string;
  sectionCare?: string;
  sectionFinance?: string;
  sectionAdmin?: string;
}

export interface NavItem {
  name: string;
  href: string;
  key: string;
}

export type NavSectionId = "care" | "finance" | "admin";

export interface NavSection {
  id: NavSectionId;
  label: string;
  items: NavItem[];
}

export function getDashboardHref(locale: string, role: NavRole): string {
  return `/${locale}/dashboard/${role === "ADMIN" ? "admin" : "doctor"}`;
}

export function getNavItems(locale: string, role: NavRole, dict: NavDict): NavItem[] {
  return getNavSections(locale, role, dict).flatMap((section) => section.items);
}

export function getNavSections(locale: string, role: NavRole, dict: NavDict): NavSection[] {
  const careLabel =
    dict.sectionCare ?? (locale === "ar" ? "الرعاية" : "Care");
  const financeLabel =
    dict.sectionFinance ?? (locale === "ar" ? "المالية" : "Finance");
  const adminLabel =
    dict.sectionAdmin ?? (locale === "ar" ? "الإدارة" : "Admin");

  const care: NavSection = {
    id: "care",
    label: careLabel,
    items: [
      { name: dict.dashboard, href: getDashboardHref(locale, role), key: "dashboard" },
      { name: dict.patients, href: `/${locale}/patients`, key: "patients" },
      { name: dict.calendar, href: `/${locale}/calendar`, key: "calendar" },
      { name: dict.reservations, href: `/${locale}/reservations`, key: "reservations" },
    ],
  };

  if (role === "DOCTOR") {
    return [
      care,
      {
        id: "admin",
        label: adminLabel,
        items: [{ name: dict.settings, href: `/${locale}/settings`, key: "settings" }],
      },
    ];
  }

  return [
    care,
    {
      id: "finance",
      label: financeLabel,
      items: [
        { name: dict.financials, href: `/${locale}/financials`, key: "financials" },
        { name: dict.reports, href: `/${locale}/reports`, key: "reports" },
      ],
    },
    {
      id: "admin",
      label: adminLabel,
      items: [
        { name: dict.doctors, href: `/${locale}/doctors`, key: "doctors" },
        { name: dict.activity, href: `/${locale}/activity`, key: "activity" },
        { name: dict.settings, href: `/${locale}/settings`, key: "settings" },
      ],
    },
  ];
}

/** Primary bottom-nav shortcuts (excludes FAB and More). */
export function getMobilePrimaryKeys(_role: NavRole): string[] {
  return ["dashboard", "patients", "calendar"];
}

export function getMobileMoreItems(locale: string, role: NavRole, dict: NavDict): NavItem[] {
  const primary = new Set(getMobilePrimaryKeys(role));
  return getNavItems(locale, role, dict).filter((item) => !primary.has(item.key));
}

/** @deprecated Prefer getNavSections — kept for any lingering single-label callers. */
export function getNavSectionLabel(locale: string, role: NavRole): string {
  if (role === "DOCTOR") {
    return locale === "ar" ? "الرعاية السريرية" : "Clinical Care";
  }
  return locale === "ar" ? "العمليات" : "Operations";
}
