"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LanguageSwitcher } from "../../../components/layout/LanguageSwitcher";
import { GlassBackground } from "../../../components/layout/GlassBackground";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Alert } from "../../../components/ui/Alert";
import { loginUser } from "../../../lib/auth";
import { ApiError } from "../../../lib/api-client";

export default function LoginPage() {
  const params = useParams();
  const router = useRouter();
  const rawLocale = (params?.locale as string) || "en";
  const locale = rawLocale === "ar" ? "ar" : "en";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In client component, we use simple localized labels with fallback
  const isArabic = locale === "ar";

  const t = {
    brandName: isArabic ? "طبيب أسنان تحت الطلب" : "Dentist on Call",
    brandTag: isArabic ? "القاهرة — بوابة العمليات السريرية" : "Cairo — Clinical Operations Portal",
    title: isArabic ? "تسجيل الدخول إلى حسابك" : "Sign In to Your Account",
    subtitle: isArabic
      ? "مخصص للكوادر الطبية والإدارية المصرح لها فقط"
      : "Authorized clinical staff and administrators only",
    email: isArabic ? "البريد الإلكتروني" : "Email Address",
    password: isArabic ? "كلمة المرور" : "Password",
    rememberMe: isArabic ? "تذكر هذه الجلسة" : "Remember this session",
    forgotPassword: isArabic ? "نسيت كلمة المرور؟" : "Forgot password?",
    signIn: isArabic ? "تسجيل الدخول" : "Sign In",
    signingIn: isArabic ? "جاري التحقق..." : "Authenticating...",
    invalidCredentials: isArabic
      ? "البريد الإلكتروني أو كلمة المرور غير صحيحة."
      : "The email or password you entered is incorrect.",
    rateLimitError: isArabic
      ? "محاولات تسجيل دخول كثيرة غير ناجحة. يرجى الانتظار."
      : "Too many failed attempts. Please wait before trying again.",
    securityNotice: isArabic
      ? "نظام بيانات طبية محمي. جميع العمليات مسجلة وتخضع للمراجعة والتدقيق."
      : "Protected clinical information system. All access is logged and audited.",
    demoAdmin: isArabic ? "تعبئة بيانات الإدارة" : "Fill Admin Credentials",
    demoDoctor: isArabic ? "تعبئة بيانات الطبيب" : "Fill Doctor Credentials",
  };

  const handleFillAdmin = () => {
    setEmail("admin@dentistoncall.eg");
    setPassword("AdminSecurePass2026!");
    setErrorMessage(null);
  };

  const handleFillDoctor = () => {
    setEmail("doctor@dentistoncall.eg");
    setPassword("DoctorSecurePass2026!");
    setErrorMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const user = await loginUser({ email, password });
      if (user.role === "ADMIN") {
        router.push(`/${locale}/dashboard/admin`);
      } else {
        router.push(`/${locale}/dashboard/doctor`);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setErrorMessage(t.rateLimitError);
        } else {
          setErrorMessage(err.data.detail || t.invalidCredentials);
        }
      } else {
        setErrorMessage(t.invalidCredentials);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 selection:bg-[#caa95a] selection:text-[#1a1408]">
      <GlassBackground />

      {/* Top right language switcher */}
      <div className="absolute top-6 end-6 z-20">
        <LanguageSwitcher currentLocale={locale} />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#dfbf70] via-[#caa95a] to-[#99782a] text-on-gold shadow-lg shadow-[#caa95a]/25">
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2C8.5 2 6 4.5 6 8c0 4 3 9 6 14 3-5 6-10 6-14 0-3.5-2.5-6-6-6z" />
              <path d="M9 8h6" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">{t.brandName}</h1>
          <p className="text-xs text-secondary">{t.brandTag}</p>
        </div>

        {/* Login Card */}
        <Card variant="gold-bordered" className="p-8">
          <div className="mb-6 space-y-1">
            <h2 className="text-lg font-semibold text-primary">{t.title}</h2>
            <p className="text-xs text-muted">{t.subtitle}</p>
          </div>

          {errorMessage && (
            <div className="mb-5">
              <Alert variant="error">{errorMessage}</Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={t.email}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@dentistoncall.eg"
              disabled={isLoading}
            />

            <Input
              label={t.password}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-secondary hover:text-primary">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-200 glass-input text-gold focus:ring-[#caa95a]"
                />
                <span>{t.rememberMe}</span>
              </label>

              <Link
                href={`/${locale}/forgot-password`}
                className="text-gold hover:text-gold-hover transition-colors"
              >
                {t.forgotPassword}
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              {isLoading ? t.signingIn : t.signIn}
            </Button>
          </form>

          {/* Quick Demo Credentials */}
          <div className="mt-6 pt-5 border-t glass-divider space-y-2">
            <p className="text-[11px] text-muted text-center">Development quick credentials:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleFillAdmin}
                className="rounded-lg glass px-2.5 py-1.5 text-[11px] font-medium text-gold hover:bg-[#caa95a]/10 hover:border-[#caa95a]/30 transition-all"
              >
                {t.demoAdmin}
              </button>
              <button
                type="button"
                onClick={handleFillDoctor}
                className="rounded-lg glass px-2.5 py-1.5 text-[11px] font-medium text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/30 transition-all"
              >
                {t.demoDoctor}
              </button>
            </div>
          </div>
        </Card>

        {/* Security Notice */}
        <p className="text-center text-[11px] leading-relaxed text-muted px-4">
          {t.securityNotice}
        </p>
      </div>
    </main>
  );
}
