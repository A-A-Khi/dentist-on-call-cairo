"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { Badge } from "../../../components/ui/Badge";
import { fetchAuditLogs } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { AuditLogRecord } from "../../../lib/clinical-data";

export default function ActivityPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    <AppShell locale={locale} role="ADMIN">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl">
              {dict.activity.title}
            </h1>
            <p className="mt-1 text-xs text-[#94a3b8]">
              {dict.activity.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-300 font-medium">
              ● {locale === "ar" ? "دفتر التدقيق المشفر نشط" : "Immutable Ledger Active"}
            </span>
          </div>
        </div>

        {/* Audit Log Timeline */}
        <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
          <div className="divide-y divide-[#24314c]/50">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-[#94a3b8]">
                {locale === "ar" ? "جاري تحميل سجل التدقيق والنشاط..." : "Loading audit trail events..."}
              </div>
            ) : logs.length > 0 ? (
              logs.map((log) => (
                <div key={log.id} className="py-4 space-y-1.5 first:pt-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#f8fafc]">{log.user}</span>
                      <Badge variant={log.role === "ADMIN" ? "gold" : "blue"} size="sm">
                        {log.role === "ADMIN" ? dict.roles.admin : dict.roles.doctor}
                      </Badge>
                      <span className="text-[#94a3b8]">—</span>
                      <span className="font-medium text-[#caa95a]">{log.action}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#64748b]">{log.time}</span>
                  </div>

                  <p className="text-xs text-[#cbd5e1]">{log.description}</p>
                  <div className="text-[11px] font-mono text-[#64748b]">
                    {locale === "ar" ? "الهدف" : "Target"}: <span className="text-[#94a3b8]">{log.target}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-[#64748b]">
                {locale === "ar" ? "لا توجد نشاطات مسجلة." : "No audit activity recorded."}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
