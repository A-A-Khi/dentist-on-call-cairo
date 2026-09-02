"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
import { AppNavbar } from "../../../components/layout/AppNavbar";
import { AppSidebar } from "../../../components/layout/AppSidebar";
import { MobileNav } from "../../../components/layout/MobileNav";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Tabs } from "../../../components/ui/Tabs";

export default function SettingsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";

  const [activeTab, setActiveTab] = useState("account");
  const [savedSuccess, setSavedSuccess] = useState(false);

  const tabs = [
    { id: "account", label: "Account & Security" },
    { id: "clinic", label: "Clinic Profile" },
    { id: "appearance", label: "Appearance & Language" },
    { id: "notifications", label: "Notifications" },
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#080a0f] text-[#f8fafc]">
      <AppNavbar
        locale={locale}
        userName="Operations Director"
        userRole="ADMIN"
        brandName="Dentist on Call"
        brandTag="Cairo Emergency & Clinical Dental Operations"
        logoutText="Sign Out"
        adminLabel="Administrator"
        doctorLabel="Dental Specialist"
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:flex">
          <AppSidebar
            locale={locale}
            role="ADMIN"
            dict={{
              dashboard: "Dashboard",
              patients: "Patients",
              calendar: "Calendar",
              reservations: "Reservations",
              doctors: "Doctors",
              financials: "Financials",
              reports: "Reports",
              activity: "Audit Activity",
              settings: "Settings",
            }}
          />
        </div>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl">
                Platform Settings
              </h1>
              <p className="mt-1 text-xs text-[#94a3b8]">
                Manage clinical defaults, account credentials, and clinic configurations
              </p>
            </div>

            {/* Tabs */}
            <Tabs items={tabs} activeTab={activeTab} onChange={setActiveTab} />

            {savedSuccess && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-300">
                ✓ Preferences updated successfully.
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              {activeTab === "account" && (
                <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f8fafc]">Account Credentials</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Display Name" defaultValue="Clinic Administrator" />
                    <Input label="Email Address" type="email" defaultValue="admin@dentistoncall.eg" disabled />
                    <Input label="Current Password" type="password" placeholder="••••••••••••" />
                    <Input label="New Password" type="password" placeholder="••••••••••••" />
                  </div>
                </div>
              )}

              {activeTab === "clinic" && (
                <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f8fafc]">Clinic Organization Profile</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Clinic Legal Name" defaultValue="Dentist on Call Cairo" />
                    <Input label="Commercial Registration #" defaultValue="CR-EG-2026-9912" />
                    <Input label="Operational Timezone" defaultValue="Africa/Cairo (UTC+2)" disabled />
                    <Input label="Currency" defaultValue="EGP (Egyptian Pound)" disabled />
                    <div className="sm:col-span-2">
                      <Input label="Clinic Main Address" defaultValue="New Cairo Operations Center, Cairo, Egypt" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "appearance" && (
                <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f8fafc]">Appearance & Localization</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Theme Palette</label>
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl border-2 border-[#caa95a] bg-[#0a0d14] p-3 text-xs font-semibold text-[#caa95a]">
                          Obsidian & Gold (Clinical Dark)
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">Default Language</label>
                      <select className="rounded-xl border border-[#24314c] bg-[#151d2c] px-3.5 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none">
                        <option>English (LTR)</option>
                        <option>العربية (Arabic RTL)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-[#f8fafc]">Notification Preferences</h3>
                  <div className="space-y-3 text-xs">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-[#24314c] text-[#caa95a] focus:ring-[#caa95a]" />
                      <span className="text-[#f8fafc]">Upcoming appointment alert 30 minutes before chair time</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-[#24314c] text-[#caa95a] focus:ring-[#caa95a]" />
                      <span className="text-[#f8fafc]">Emergency triage patient arrival notification</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" defaultChecked className="rounded border-[#24314c] text-[#caa95a] focus:ring-[#caa95a]" />
                      <span className="text-[#f8fafc]">Daily financial reconciliation summary at 09:00 PM</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button type="submit" variant="primary">
                  Save Preferences
                </Button>
              </div>
            </form>
          </div>
        </main>
      </div>

      <MobileNav locale={locale} role="ADMIN" />
    </div>
  );
}
