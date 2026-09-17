import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, locales } from "./i18n/config";

const PUBLIC_PATH_SUFFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
];

const ADMIN_ONLY_SEGMENTS = [
  "/dashboard/admin",
  "/financials",
  "/reports",
  "/activity",
  "/doctors",
];

function localeFromPath(pathname: string): string | null {
  const match = locales.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );
  return match ?? null;
}

function isPublicPath(pathname: string): boolean {
  const locale = localeFromPath(pathname);
  if (!locale) return false;
  const rest = pathname.slice(locale.length + 1) || "/";
  const normalized = rest.startsWith("/") ? rest : `/${rest}`;
  if (normalized === "/") return true;
  return PUBLIC_PATH_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.startsWith(`${suffix}/`)
  );
}

function isAdminOnlyPath(pathname: string): boolean {
  const locale = localeFromPath(pathname);
  if (!locale) return false;
  const rest = pathname.slice(locale.length + 1) || "/";
  const normalized = rest.startsWith("/") ? rest : `/${rest}`;
  return ADMIN_ONLY_SEGMENTS.some(
    (segment) => normalized === segment || normalized.startsWith(`${segment}/`)
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Clean up any legacy malformed paths from browser history
  if (pathname.startsWith("/enlogin")) {
    const clean = pathname.replace(/^\/enlogin/, "");
    return NextResponse.redirect(new URL(`/en${clean || "/login"}`, request.url));
  }
  if (pathname.startsWith("/en/enlogin")) {
    const clean = pathname.replace(/^\/en\/enlogin/, "");
    return NextResponse.redirect(new URL(`/en${clean || "/login"}`, request.url));
  }
  if (pathname.startsWith("/arlogin")) {
    const clean = pathname.replace(/^\/arlogin/, "");
    return NextResponse.redirect(new URL(`/ar${clean || "/login"}`, request.url));
  }
  if (pathname.startsWith("/ar/arlogin")) {
    const clean = pathname.replace(/^\/ar\/arlogin/, "");
    return NextResponse.redirect(new URL(`/ar${clean || "/login"}`, request.url));
  }

  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const activeLocale = cookieLocale === "ar" || cookieLocale === "en" ? cookieLocale : defaultLocale;

  // Root path "/" redirects directly to active locale login
  if (pathname === "/") {
    return NextResponse.redirect(new URL(`/${activeLocale}/login`, request.url));
  }

  // Check if pathname starts with a valid supported locale
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (!pathnameHasLocale) {
    const target = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return NextResponse.redirect(
      new URL(`/${activeLocale}${target}`, request.url)
    );
  }

  const locale = localeFromPath(pathname) || activeLocale;
  const authenticated = request.cookies.get("doc_authenticated")?.value === "1";
  const role = request.cookies.get("doc_role")?.value;

  if (!isPublicPath(pathname) && !authenticated) {
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && isPublicPath(pathname) && pathname.includes("/login")) {
    const home =
      role === "DOCTOR"
        ? `/${locale}/dashboard/doctor`
        : `/${locale}/dashboard/admin`;
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (authenticated && isAdminOnlyPath(pathname) && role === "DOCTOR") {
    return NextResponse.redirect(new URL(`/${locale}/dashboard/doctor`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|brand|icon.png).*)",
  ],
};
