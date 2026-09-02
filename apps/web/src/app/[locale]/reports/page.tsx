import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { getDictionary } from "../../../i18n/get-dictionary";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale);

  const procedureBreakdown: {
    name: string;
    count: number;
    revenue: number;
    percentage: number;
  }[] = [];

  const totalRevenue = procedureBreakdown.reduce((sum, p) => sum + p.revenue, 0);

  return (
    <AppShell locale={locale} role="ADMIN">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl">
              {dict.reports.title}
            </h1>
            <p className="mt-1 text-xs text-[#94a3b8]">
              {dict.reports.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-[#24314c] bg-[#101622] px-3.5 py-2 text-xs font-medium text-[#f8fafc] hover:bg-[#151d2c] transition-colors"
            >
              {dict.reports.exportCSV}
            </button>
            <button
              type="button"
              className="rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-3.5 py-2 text-xs font-semibold text-[#0a0d14] hover:opacity-95 shadow-lg shadow-[#caa95a]/20"
            >
              {dict.reports.exportPDF}
            </button>
          </div>
        </div>

        {/* Date Filter Strip */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-[#24314c] bg-[#101622] p-4 text-xs">
          <span className="text-[#94a3b8] font-medium">Reporting Interval:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="rounded-lg bg-[#caa95a] px-3 py-1 font-bold text-[#0a0d14]">
              This Month (September 2026)
            </button>
            <button className="rounded-lg border border-[#24314c] bg-[#151d2c] px-3 py-1 text-[#94a3b8] hover:text-[#f8fafc]">
              Last Quarter
            </button>
            <button className="rounded-lg border border-[#24314c] bg-[#151d2c] px-3 py-1 text-[#94a3b8] hover:text-[#f8fafc]">
              Year to Date
            </button>
          </div>
        </div>

        {/* Breakdown Card: Revenue by Clinical Procedure */}
        <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#f8fafc]">
              {dict.reports.revenueReport}
            </h3>
            <span className="font-mono text-xs font-bold text-[#caa95a]">
              {totalRevenue.toLocaleString()} EGP Total
            </span>
          </div>

          <div className="space-y-3">
            {procedureBreakdown.length > 0 ? (
              procedureBreakdown.map((proc, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[#f8fafc]">{proc.name}</span>
                    <span className="font-mono text-[#caa95a]">
                      {proc.revenue.toLocaleString()} EGP ({proc.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#151d2c] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#caa95a] to-[#dfbf70] rounded-full"
                      style={{ width: `${proc.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-[#64748b]">
                No clinical procedure data recorded for this reporting period yet.
              </div>
            )}
          </div>
        </div>

        {/* Throughput Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 text-center space-y-1">
            <span className="text-xs text-[#94a3b8]">Completed Clinical Visits</span>
            <span className="block text-2xl font-bold font-mono text-[#f8fafc]">0</span>
            <span className="text-[10px] text-[#64748b]">0 visits logged</span>
          </div>
          <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 text-center space-y-1">
            <span className="text-xs text-[#94a3b8]">New Patient Registrations</span>
            <span className="block text-2xl font-bold font-mono text-[#caa95a]">0</span>
            <span className="text-[10px] text-[#64748b]">0 new registrations</span>
          </div>
          <div className="rounded-2xl border border-[#24314c] bg-[#101622] p-5 text-center space-y-1">
            <span className="text-xs text-[#94a3b8]">Treatment Plan Acceptance</span>
            <span className="block text-2xl font-bold font-mono text-[#f8fafc]">0.0%</span>
            <span className="text-[10px] text-[#64748b]">Awaiting case closures</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
