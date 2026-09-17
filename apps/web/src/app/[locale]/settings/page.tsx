"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";
import { Badge } from "../../../components/ui/Badge";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import { getStoredSessionUser } from "../../../lib/session";
import {
  createCaseStream,
  createFinancialCategory,
  fetchCaseStreams,
  fetchFinancialCategories,
  updateCaseStream,
  updateFinancialCategory,
} from "../../../lib/clinical-api";
import type { CaseStream, FinancialCategory } from "../../../lib/clinical-data";

export default function SettingsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";
  const session = getStoredSessionUser();
  const isAdmin = (session?.role ?? "ADMIN") === "ADMIN";

  const [activeTab, setActiveTab] = useState("account");
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [streams, setStreams] = useState<CaseStream[]>([]);
  const [catType, setCatType] = useState<"REVENUE" | "EXPENSE">("EXPENSE");
  const [catNameEn, setCatNameEn] = useState("");
  const [catNameAr, setCatNameAr] = useState("");
  const [streamNameEn, setStreamNameEn] = useState("");
  const [streamNameAr, setStreamNameAr] = useState("");
  const [streamReferralPercent, setStreamReferralPercent] = useState(0);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);
  const [taxonomyBusy, setTaxonomyBusy] = useState(false);

  const tabs = [
    { id: "account", label: dict.settings.tabs.account },
    { id: "clinic", label: dict.settings.tabs.clinic },
    ...(isAdmin
      ? [
          { id: "categories", label: dict.settings.tabs.categories },
          { id: "streams", label: dict.settings.tabs.streams },
        ]
      : []),
    { id: "appearance", label: dict.settings.tabs.appearance },
    { id: "notifications", label: dict.settings.tabs.notifications },
  ];

  const loadTaxonomies = async () => {
    if (!isAdmin) return;
    try {
      const [cats, caseStreams] = await Promise.all([
        fetchFinancialCategories(undefined, true),
        fetchCaseStreams(true),
      ]);
      setCategories(cats);
      setStreams(caseStreams);
    } catch {
      // ignore offline
    }
  };

  useEffect(() => {
    void loadTaxonomies();
  }, [isAdmin]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameEn.trim()) return;
    setTaxonomyBusy(true);
    setTaxonomyError(null);
    try {
      await createFinancialCategory({
        transactionType: catType,
        nameEn: catNameEn.trim(),
        nameAr: catNameAr.trim() || undefined,
      });
      setCatNameEn("");
      setCatNameAr("");
      await loadTaxonomies();
    } catch {
      setTaxonomyError(isAr ? "تعذر إضافة الفئة." : "Could not add category.");
    } finally {
      setTaxonomyBusy(false);
    }
  };

  const handleAddStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamNameEn.trim()) return;
    setTaxonomyBusy(true);
    setTaxonomyError(null);
    try {
      await createCaseStream({
        nameEn: streamNameEn.trim(),
        nameAr: streamNameAr.trim() || undefined,
        referralPercent: Math.max(0, Math.min(50, streamReferralPercent || 0)),
      });
      setStreamNameEn("");
      setStreamNameAr("");
      setStreamReferralPercent(0);
      await loadTaxonomies();
    } catch {
      setTaxonomyError(isAr ? "تعذر إضافة قناة الحالات." : "Could not add case stream.");
    } finally {
      setTaxonomyBusy(false);
    }
  };

  return (
    <AppShell locale={locale}>
      <div className="max-w-4xl mx-auto space-y-6">
        <PageHeader title={dict.settings.title} subtitle={dict.settings.subtitle} />

        <Tabs items={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {savedSuccess && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-50 p-3 text-xs text-emerald-700">
            ✓ {isAr ? "تم حفظ التفضيلات بنجاح." : "Preferences updated successfully."}
          </div>
        )}

        {taxonomyError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-50 p-3 text-xs text-rose-700">
            {taxonomyError}
          </div>
        )}

        {activeTab === "categories" && isAdmin ? (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-primary">{dict.settings.categoriesTitle}</h3>
                <p className="text-[11px] text-muted mt-1">{dict.settings.categoriesHelp}</p>
              </div>

              <form onSubmit={handleAddCategory} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium text-secondary mb-1">
                    {isAr ? "النوع" : "Type"}
                  </label>
                  <select
                    value={catType}
                    onChange={(e) => setCatType(e.target.value as "REVENUE" | "EXPENSE")}
                    className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
                  >
                    <option value="EXPENSE">{isAr ? "مصروف" : "Expense"}</option>
                    <option value="REVENUE">{isAr ? "إيراد" : "Revenue"}</option>
                  </select>
                </div>
                <Input
                  label={isAr ? "الاسم (إنجليزي)" : "Name (English)"}
                  value={catNameEn}
                  onChange={(e) => setCatNameEn(e.target.value)}
                  placeholder="e.g. Social Media Ads"
                  required
                />
                <Input
                  label={isAr ? "الاسم (عربي)" : "Name (Arabic)"}
                  value={catNameAr}
                  onChange={(e) => setCatNameAr(e.target.value)}
                  placeholder="مثل: إعلانات وسائل التواصل"
                />
                <Button type="submit" variant="primary" disabled={taxonomyBusy}>
                  {isAr ? "إضافة فئة" : "Add Category"}
                </Button>
              </form>
            </div>

            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="p-4 border-b glass-divider">
                <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide">
                  {isAr ? "الفئات الحالية" : "Current Categories"}
                </h4>
              </div>
              <ul className="divide-y divide-slate-200">
                {categories.length === 0 ? (
                  <li className="p-4 text-xs text-muted">{isAr ? "لا توجد فئات بعد." : "No categories yet."}</li>
                ) : (
                  categories.map((cat) => (
                    <li key={cat.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-primary truncate">
                          {isAr && cat.nameAr ? cat.nameAr : cat.nameEn}
                        </div>
                        {cat.nameAr && !isAr && (
                          <div className="text-[10px] text-muted">{cat.nameAr}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={cat.transactionType === "REVENUE" ? "green" : "blue"} size="sm">
                          {cat.transactionType}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            await updateFinancialCategory(cat.id, { isActive: !cat.isActive });
                            await loadTaxonomies();
                          }}
                        >
                          {cat.isActive ? (isAr ? "تعطيل" : "Deactivate") : isAr ? "تفعيل" : "Activate"}
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : activeTab === "streams" && isAdmin ? (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-primary">{dict.settings.streamsTitle}</h3>
                <p className="text-[11px] text-muted mt-1">{dict.settings.streamsHelp}</p>
              </div>

              <form onSubmit={handleAddStream} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <Input
                  label={isAr ? "الاسم (إنجليزي)" : "Name (English)"}
                  value={streamNameEn}
                  onChange={(e) => setStreamNameEn(e.target.value)}
                  placeholder="e.g. Partnership Clinics"
                  required
                />
                <Input
                  label={isAr ? "الاسم (عربي)" : "Name (Arabic)"}
                  value={streamNameAr}
                  onChange={(e) => setStreamNameAr(e.target.value)}
                  placeholder="مثل: عيادات شريكة"
                />
                <Input
                  label={dict.settings.referralPercent}
                  type="number"
                  min={0}
                  max={50}
                  value={streamReferralPercent}
                  onChange={(e) => setStreamReferralPercent(Number(e.target.value) || 0)}
                  placeholder="0"
                />
                <Button type="submit" variant="primary" disabled={taxonomyBusy}>
                  {isAr ? "إضافة قناة" : "Add Stream"}
                </Button>
              </form>
              <p className="text-[10px] text-muted">{dict.settings.referralPercentHelp}</p>
            </div>

            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="p-4 border-b glass-divider">
                <h4 className="text-xs font-semibold text-secondary uppercase tracking-wide">
                  {isAr ? "قنوات الحالات الحالية" : "Current Case Streams"}
                </h4>
              </div>
              <ul className="divide-y divide-slate-200">
                {streams.length === 0 ? (
                  <li className="p-4 text-xs text-muted">{isAr ? "لا توجد قنوات بعد." : "No case streams yet."}</li>
                ) : (
                  streams.map((stream) => (
                    <li key={stream.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-primary truncate">
                          {isAr && stream.nameAr ? stream.nameAr : stream.nameEn}
                        </div>
                        {stream.nameAr && !isAr && (
                          <div className="text-[10px] text-muted">{stream.nameAr}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <label className="flex items-center gap-1.5 text-[11px] text-secondary">
                          <span>{dict.settings.referralPercent}</span>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            defaultValue={stream.referralPercent ?? 0}
                            key={`${stream.id}-${stream.referralPercent}`}
                            className="w-16 glass rounded-lg px-2 py-1 font-mono text-primary focus:border-[#caa95a] focus:outline-none"
                            onBlur={async (e) => {
                              const next = Math.max(0, Math.min(50, Number(e.target.value) || 0));
                              if (next === (stream.referralPercent ?? 0)) return;
                              await updateCaseStream(stream.id, { referralPercent: next });
                              await loadTaxonomies();
                            }}
                          />
                        </label>
                        <Badge variant={stream.isActive ? "green" : "blue"} size="sm">
                          {stream.isActive ? (isAr ? "نشط" : "Active") : isAr ? "معطل" : "Inactive"}
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={async () => {
                            await updateCaseStream(stream.id, { isActive: !stream.isActive });
                            await loadTaxonomies();
                          }}
                        >
                          {stream.isActive ? (isAr ? "تعطيل" : "Deactivate") : isAr ? "تفعيل" : "Activate"}
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            {activeTab === "account" && (
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                <h3 className="text-sm font-semibold text-primary">
                  {isAr ? "بيانات الحساب" : "Account Credentials"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label={isAr ? "الاسم المعروض" : "Display Name"} defaultValue="Clinic Administrator" />
                  <Input label={dict.auth.emailLabel} type="email" defaultValue="admin@dentistoncall.eg" disabled />
                  <Input label={isAr ? "كلمة المرور الحالية" : "Current Password"} type="password" placeholder="••••••••••••" />
                  <Input label={isAr ? "كلمة المرور الجديدة" : "New Password"} type="password" placeholder="••••••••••••" />
                </div>
              </div>
            )}

            {activeTab === "clinic" && (
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                <h3 className="text-sm font-semibold text-primary">
                  {isAr ? "ملف العيادة" : "Clinic Organization Profile"}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label={dict.settings.clinicName} defaultValue="Dentist on Call Cairo" />
                  <Input label={isAr ? "السجل التجاري" : "Commercial Registration #"} defaultValue="CR-EG-2026-9912" />
                  <Input label={dict.settings.timezone} defaultValue="Africa/Cairo (UTC+2)" disabled />
                  <Input label={dict.settings.currency} defaultValue="EGP (Egyptian Pound)" disabled />
                  <div className="sm:col-span-2">
                    <Input
                      label={isAr ? "عنوان العيادة" : "Clinic Main Address"}
                      defaultValue="New Cairo Operations Center, Cairo, Egypt"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
                <h3 className="text-sm font-semibold text-primary">
                  {isAr ? "المظهر واللغة" : "Appearance & Localization"}
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
                <h3 className="text-sm font-semibold text-primary">{dict.settings.tabs.notifications}</h3>
                <div className="space-y-3 text-xs">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-slate-200 text-gold focus:ring-[#caa95a]" />
                    <span className="text-primary">
                      {isAr
                        ? "تنبيه بالموعد قبل 30 دقيقة من وقت الكرسي"
                        : "Upcoming appointment alert 30 minutes before chair time"}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-slate-200 text-gold focus:ring-[#caa95a]" />
                    <span className="text-primary">
                      {isAr ? "إشعار وصول مريض طوارئ" : "Emergency triage patient arrival notification"}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" defaultChecked className="rounded border-slate-200 text-gold focus:ring-[#caa95a]" />
                    <span className="text-primary">
                      {isAr
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
        )}
      </div>
    </AppShell>
  );
}
