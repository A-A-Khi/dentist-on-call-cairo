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
}

export interface NavItem {
  name: string;
  href: string;
  key: string;
}

export function getDashboardHref(locale: string, role: NavRole): string {
  return `/${locale}/dashboard/${role === "ADMIN" ? "admin" : "doctor"}`;
}

export function getNavItems(locale: string, role: NavRole, dict: NavDict): NavItem[] {
  const items: NavItem[] = [
    { name: dict.dashboard, href: getDashboardHref(locale, role), key: "dashboard" },
    { name: dict.patients, href: `/${locale}/patients`, key: "patients" },
    { name: dict.calendar, href: `/${locale}/calendar`, key: "calendar" },
    { name: dict.reservations, href: `/${locale}/reservations`, key: "reservations" },
  ];

  if (role === "ADMIN") {
    items.push(
      { name: dict.doctors, href: `/${locale}/doctors`, key: "doctors" },
      { name: dict.financials, href: `/${locale}/financials`, key: "financials" },
      { name: dict.reports, href: `/${locale}/reports`, key: "reports" },
      { name: dict.activity, href: `/${locale}/activity`, key: "activity" },
    );
  }

  items.push({ name: dict.settings, href: `/${locale}/settings`, key: "settings" });

  return items;
}

export function getNavSectionLabel(locale: string, role: NavRole): string {
  if (role === "DOCTOR") {
    return locale === "ar" ? "الرعاية السريرية" : "Clinical Care";
  }
  return locale === "ar" ? "العمليات" : "Operations";
}
