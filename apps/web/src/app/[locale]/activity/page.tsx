"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { fetchAuditLogs } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { AuditLogRecord } from "../../../lib/clinical-data";
import { getStoredSessionUser } from "../../../lib/session";
import { getDashboardHref } from "../../../components/layout/nav-config";

export default function ActivityPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const role = getStoredSessionUser()?.role ?? "DOCTOR";
    if (role !== "ADMIN") {
      router.replace(getDashboardHref(locale, "DOCTOR"));
    }
  }, [locale, router]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const data = await fetchAuditLogs();
        setLogs(data);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader
          title={dict.activity.title}
          subtitle={dict.activity.subtitle}
          actions={
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 font-medium">
              ● {locale === "ar" ? "دفتر التدقيق المشفر نشط" : "Immutable Ledger Active"}
            </span>
          }
        />

        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="divide-y divide-slate-200">
            {isLoading ? (
              <div className="space-y-1 py-2" role="status">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2 py-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-5 w-14 rounded-md" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                ))}
              </div>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="py-4 space-y-1.5 first:pt-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary">{log.user}</span>
                      <Badge variant={log.role === "ADMIN" ? "gold" : "blue"} size="sm">
                        {log.role === "ADMIN" ? dict.roles.admin : dict.roles.doctor}
                      </Badge>
                      <span className="text-secondary">—</span>
                      <span className="font-medium text-gold">{log.action}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted">{log.time}</span>
                  </div>

                  <p className="text-xs text-secondary">{log.description}</p>
                  <div className="text-[11px] font-mono text-muted">
                    {locale === "ar" ? "الهدف" : "Target"}:{" "}
                    <span className="text-secondary">{log.target}</span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState
                title={locale === "ar" ? "لا توجد نشاطات مسجلة" : "No audit activity yet"}
                description={
                  locale === "ar"
                    ? "ستظهر هنا عمليات النظام عند بدء الاستخدام."
                    : "Clinical and security events will appear here as the team uses the portal."
                }
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
