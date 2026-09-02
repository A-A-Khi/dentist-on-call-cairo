import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, locales } from "./i18n/config";

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)",
  ],
};
