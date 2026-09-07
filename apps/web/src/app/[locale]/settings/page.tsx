"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";
import { getDictionarySync } from "../../../i18n/get-dictionary";

export default function SettingsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [activeTab, setActiveTab] = useState("account");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const tabs = [
    { id: "account", label: dict.settings.tabs.account },
    { id: "clinic", label: dict.settings.tabs.clinic },
    { id: "appearance", label: dict.settings.tabs.appearance },
    { id: "notifications", label: dict.settings.tabs.notifications },
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <AppShell locale={locale}>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader title={dict.settings.title} subtitle={dict.settings.subtitle} />

        <Tabs items={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {savedSuccess && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-3 text-xs text-emerald-700">
            ✓ {locale === "ar" ? "تم حفظ التفضيلات بنجاح." : "Preferences updated successfully."}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {activeTab === "account" && (
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">
                {locale === "ar" ? "بيانات الحساب" : "Account Credentials"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label={locale === "ar" ? "الاسم المعروض" : "Display Name"} defaultValue="Clinic Administrator" />
                <Input label={dict.auth.emailLabel} type="email" defaultValue="admin@dentistoncall.eg" disabled />
                <Input label={locale === "ar" ? "كلمة المرور الحالية" : "Current Password"} type="password" placeholder="••••••••••••" />
                <Input label={locale === "ar" ? "كلمة المرور الجديدة" : "New Password"} type="password" placeholder="••••••••••••" />
              </div>
            </div>
          )}

          {activeTab === "clinic" && (
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">
                {locale === "ar" ? "ملف العيادة" : "Clinic Organization Profile"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label={dict.settings.clinicName} defaultValue="Dentist on Call Cairo" />
                <Input label={locale === "ar" ? "السجل التجاري" : "Commercial Registration #"} defaultValue="CR-EG-2026-9912" />
                <Input label={dict.settings.timezone} defaultValue="Africa/Cairo (UTC+2)" disabled />
                <Input label={dict.settings.currency} defaultValue="EGP (Egyptian Pound)" disabled />
                <div className="sm:col-span-2">
                  <Input label={locale === "ar" ? "عنوان العيادة" : "Clinic Main Address"} defaultValue="New Cairo Operations Center, Cairo, Egypt" />
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">
                {locale === "ar" ? "المظهر واللغة" : "Appearance & Localization"}
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1.5">
                    {dict.settings.defaultLocale}
                  </label>
                  <select className="glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none">
                    <option>English (LTR)</option>
                    <option>العربية (Arabic RTL)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-semibold text-primary">
                {dict.settings.tabs.notifications}
              </h3>
              <div className="space-y-3 text-xs">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-gold focus:ring-[#caa95a]" />
                  <span className="text-primary">
                    {locale === "ar"
                      ? "تنبيه بالموعد قبل 30 دقيقة من وقت الكرسي"
                      : "Upcoming appointment alert 30 minutes before chair time"}
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-gold focus:ring-[#caa95a]" />
                  <span className="text-primary">
                    {locale === "ar"
                      ? "إشعار وصول مريض طوارئ"
                      : "Emergency triage patient arrival notification"}
                  </span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" defaultChecked className="rounded border-slate-200 text-gold focus:ring-[#caa95a]" />
                  <span className="text-primary">
                    {locale === "ar"
                      ? "ملخص التسوية المالية اليومية الساعة 9 مساءً"
                      : "Daily financial reconciliation summary at 09:00 PM"}
                  </span>
                </label>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="submit" variant="primary">
              {dict.settings.save}
            </Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
