"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LanguageSwitcher } from "../../../components/layout/LanguageSwitcher";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { Alert } from "../../../components/ui/Alert";
import { requestPasswordReset } from "../../../lib/auth";

export default function ForgotPasswordPage() {
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const isArabic = locale === "ar";

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const t = {
    brandName: isArabic ? "طبيب أسنان تحت الطلب" : "Dentist on Call",
    title: isArabic ? "استعادة كلمة المرور" : "Reset Your Password",
    subtitle: isArabic
      ? "أدخل بريدك الإلكتروني المسجل لإصدار رمز استعادة كلمة المرور."
      : "Enter your registered email to issue a secure password reset token.",
    email: isArabic ? "البريد الإلكتروني" : "Email Address",
    sendButton: isArabic ? "إصدار رمز الاستعادة" : "Issue Reset Token",
    sending: isArabic ? "جاري الإصدار..." : "Processing...",
    backToLogin: isArabic ? "العودة لتسجيل الدخول" : "Back to Sign In",
    successNotice: isArabic
      ? "إذا كان البريد مسجلاً في النظام، تم إصدار رمز إعادة التعيين بنجاح."
      : "If an active account exists with that email, a password reset token has been issued.",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setMessage(null);

    try {
      const res = await requestPasswordReset(email);
      setIsSuccess(true);
      setMessage(res.message || t.successNotice);
    } catch {
      setIsSuccess(true);
      setMessage(t.successNotice);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4">
      <div className="absolute top-6 end-6 z-20">
        <LanguageSwitcher currentLocale={locale} />
      </div>

      <div className="relative z-10 w-full max-w-md space-y-6">
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
        </div>

        <Card variant="gold-bordered" className="p-8 backdrop-blur-xl">
          <div className="mb-6 space-y-1">
            <h2 className="text-lg font-semibold text-primary">{t.title}</h2>
            <p className="text-xs text-muted">{t.subtitle}</p>
          </div>

          {isSuccess ? (
            <div className="space-y-4">
              <Alert variant="success">{message}</Alert>
              <Link href={`/${locale}/login`} className="block">
                <Button variant="secondary" className="w-full">
                  {t.backToLogin}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t.email}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@dentistoncall.eg"
                disabled={isLoading}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-2"
                isLoading={isLoading}
              >
                {isLoading ? t.sending : t.sendButton}
              </Button>

              <div className="pt-2 text-center">
                <Link
                  href={`/${locale}/login`}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  ← {t.backToLogin}
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </main>
  );
}
