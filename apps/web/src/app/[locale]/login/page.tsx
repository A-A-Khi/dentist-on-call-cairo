"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LanguageSwitcher } from "../../../components/layout/LanguageSwitcher";
import { GlassBackground } from "../../../components/layout/GlassBackground";
import { BrandLogo } from "../../../components/brand/BrandLogo";
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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isArabic = locale === "ar";

  const t = {
    brandTag: isArabic ? "القاهرة — بوابة العمليات السريرية" : "Cairo — Clinical Operations Portal",
    title: isArabic ? "تسجيل الدخول إلى حسابك" : "Sign In to Your Account",
    subtitle: isArabic
      ? "مخصص للكوادر الطبية والإدارية المصرح لها فقط"
      : "Authorized clinical staff and administrators only",
    email: isArabic ? "البريد الإلكتروني" : "Email Address",
    password: isArabic ? "كلمة المرور" : "Password",
    rememberMe: isArabic ? "تذكر هذه الجلسة" : "Remember this session",
    forgotPassword: isArabic ? "نسيت كلمة المرور؟" : "Forgot password?",
    showPassword: isArabic ? "إظهار" : "Show",
    hidePassword: isArabic ? "إخفاء" : "Hide",
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

      <div className="absolute top-6 end-6 z-20 animate-fade-in">
        <LanguageSwitcher currentLocale={locale} />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in-up">
        <div className="text-center space-y-4">
          <BrandLogo variant="login" priority className="animate-soft-scale-in" />
          <p className="text-xs text-secondary">{t.brandTag}</p>
        </div>

        <Card variant="gold-bordered" className="p-8 stagger-2 animate-fade-in-up">
          <div className="mb-6 space-y-1">
            <h2 className="text-lg font-semibold text-primary">{t.title}</h2>
            <p className="text-xs text-muted">{t.subtitle}</p>
          </div>

          {errorMessage && (
            <div className="mb-5 animate-fade-in">
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
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={isLoading}
              endAdornment={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="rounded-lg px-2 py-1 text-[11px] font-medium text-gold hover:bg-[#caa95a]/10 transition-colors"
                  aria-label={showPassword ? t.hidePassword : t.showPassword}
                >
                  {showPassword ? t.hidePassword : t.showPassword}
                </button>
              }
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
                className="text-gold hover:text-[var(--gold-hover)] transition-colors"
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
        </Card>

        <p className="text-center text-[11px] leading-relaxed text-muted px-4 stagger-3 animate-fade-in-up">
          {t.securityNotice}
        </p>
      </div>
    </main>
  );
}
