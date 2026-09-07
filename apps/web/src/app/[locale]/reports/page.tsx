import React from "react";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
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
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader
          title={dict.reports.title}
          subtitle={dict.reports.subtitle}
          actions={
            <>
              <button
                type="button"
                className="glass rounded-xl px-3.5 py-2 text-xs font-medium text-primary glass-hover transition-colors"
              >
                {dict.reports.exportCSV}
              </button>
              <button
                type="button"
                className="btn-gold"
              >
                {dict.reports.exportPDF}
              </button>
            </>
          }
        />

        {/* Date Filter Strip */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 glass-card rounded-2xl p-4 text-xs">
          <span className="text-secondary font-medium">Reporting Interval:</span>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="rounded-lg bg-[#caa95a] px-3 py-1 font-bold text-on-gold">
              This Month (September 2026)
            </button>
            <button className="rounded-lg glass px-3 py-1 text-secondary hover:text-primary">
              Last Quarter
            </button>
            <button className="rounded-lg glass px-3 py-1 text-secondary hover:text-primary">
              Year to Date
            </button>
          </div>
        </div>

        {/* Breakdown Card: Revenue by Clinical Procedure */}
        <div className="glass-card rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">
              {dict.reports.revenueReport}
            </h3>
            <span className="font-mono text-xs font-bold text-gold">
              {totalRevenue.toLocaleString()} EGP Total
            </span>
          </div>

          <div className="space-y-3">
            {procedureBreakdown.length > 0 ? (
              procedureBreakdown.map((proc, i) => (
                <div key={i} className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-primary">{proc.name}</span>
                    <span className="font-mono text-gold">
                      {proc.revenue.toLocaleString()} EGP ({proc.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full glass overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#caa95a] to-[#dfbf70] rounded-full"
                      style={{ width: `${proc.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-muted">
                No clinical procedure data recorded for this reporting period yet.
              </div>
            )}
          </div>
        </div>

        {/* Throughput Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5 text-center space-y-1">
            <span className="text-xs text-secondary">Completed Clinical Visits</span>
            <span className="block text-2xl font-bold font-mono text-primary">0</span>
            <span className="text-[10px] text-muted">0 visits logged</span>
          </div>
          <div className="glass-card rounded-2xl p-5 text-center space-y-1">
            <span className="text-xs text-secondary">New Patient Registrations</span>
            <span className="block text-2xl font-bold font-mono text-gold">0</span>
            <span className="text-[10px] text-muted">0 new registrations</span>
          </div>
          <div className="glass-card rounded-2xl p-5 text-center space-y-1">
            <span className="text-xs text-secondary">Treatment Plan Acceptance</span>
            <span className="block text-2xl font-bold font-mono text-primary">0.0%</span>
            <span className="text-[10px] text-muted">Awaiting case closures</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
