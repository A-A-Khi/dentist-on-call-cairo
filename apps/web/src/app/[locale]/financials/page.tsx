"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { Badge } from "../../../components/ui/Badge";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { fetchFinancialTransactions, postFinancialTransaction } from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { FinancialTransaction } from "../../../lib/clinical-data";

export default function FinancialsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPostOpen, setIsPostOpen] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchFinancialTransactions();
      setTransactions(data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalRevenue = transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const revenueCount = transactions.filter((t) => t.type === "REVENUE").length;
  const avgCase = revenueCount > 0 ? Math.round(totalRevenue / revenueCount) : 0;
  const netProfit = totalRevenue - totalExpense;

  return (
    <AppShell locale={locale} role="ADMIN">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#f8fafc] sm:text-2xl">
              {dict.financials.title}
            </h1>
            <p className="mt-1 text-xs text-[#94a3b8]">
              {dict.financials.subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsPostOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-4 py-2 text-xs font-semibold text-[#0a0d14] hover:opacity-95 shadow-lg shadow-[#caa95a]/20"
          >
            + {dict.financials.postTransaction}
          </button>
        </div>

        {/* Top Financial KPI Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5 space-y-1">
            <span className="text-xs font-semibold text-[#94a3b8]">{dict.financials.stats.revenue}</span>
            <div className="font-mono text-xl font-bold text-emerald-400">
              +{totalRevenue.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
            </div>
            <span className="text-[10px] text-emerald-500/80">{locale === "ar" ? "مقبوضات مسجلة" : "Collections recorded"}</span>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-1">
            <span className="text-xs font-semibold text-[#94a3b8]">{dict.financials.stats.expenses}</span>
            <div className="font-mono text-xl font-bold text-rose-400">
              -{totalExpense.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
            </div>
            <span className="text-[10px] text-rose-500/80">{locale === "ar" ? "مستلزمات ومختبرات" : "Supplies & lab invoices"}</span>
          </div>

          <div className="glass-active rounded-2xl p-5 space-y-1 shadow-lg shadow-[#caa95a]/10">
            <span className="text-xs font-semibold text-[#caa95a]">{dict.financials.stats.profit}</span>
            <div className="font-mono text-xl font-bold text-[#f5e8c7]">
              {netProfit.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
            </div>
            <span className="text-[10px] text-[#caa95a]/80">{locale === "ar" ? "هامش الفترة الحالية" : "Current period margin"}</span>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-1">
            <span className="text-xs font-semibold text-[#94a3b8]">{dict.financials.stats.avgCase}</span>
            <div className="font-mono text-xl font-bold text-[#f8fafc]">
              {avgCase.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
            </div>
            <span className="text-[10px] text-[#64748b]">{locale === "ar" ? "لكل زيارة علاجية" : "Per treatment visit"}</span>
          </div>
        </div>

        {/* Immutable Transaction Register */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b glass-divider flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#f8fafc]">
              {dict.financials.transactionRegister}
            </h3>
            <span className="text-xs text-[#94a3b8] font-mono">{transactions.length} {locale === "ar" ? "حركات مسجلة" : "entries posted"}</span>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="glass-table-header text-[#94a3b8]">
                <tr>
                  <th className="px-4 py-3.5 font-medium">{locale === "ar" ? "رقم القيد" : "Ref"}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.date}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.category}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.description}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.patientDoctor}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.amount}</th>
                  <th className="px-4 py-3.5 font-medium text-end">{dict.financials.table.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#24314c]/50 text-[#f8fafc]">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[#94a3b8]">
                      {locale === "ar" ? "جاري تحميل الدفتر المالي..." : "Loading transactions..."}
                    </td>
                  </tr>
                ) : transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="glass-hover transition-colors">
                      <td className="px-4 py-3.5 font-mono text-[#caa95a]">{tx.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3.5 text-[#94a3b8] font-mono">{tx.date}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={tx.type === "REVENUE" ? "green" : "blue"} size="sm">
                          {tx.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-[#cbd5e1] max-w-xs truncate">{tx.description}</td>
                      <td className="px-4 py-3.5">
                        {tx.patientName ? (
                          <div>
                            <span className="font-semibold text-[#f8fafc]">{tx.patientName}</span>
                            <span className="text-[10px] text-[#64748b] block">{tx.doctorName}</span>
                          </div>
                        ) : (
                          <span className="text-[#64748b]">{locale === "ar" ? "مصروفات عامة" : "General Clinic"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold">
                        <span className={tx.type === "REVENUE" ? "text-emerald-400" : "text-rose-400"}>
                          {tx.type === "REVENUE" ? "+" : "-"}{tx.amountEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-end">
                        <span className="text-[11px] text-[#64748b]">{tx.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-[#64748b]">
                      {locale === "ar" ? "لا توجد معاملات مالية مسجلة حتى الآن." : "No financial ledger transactions posted yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Card View */}
          <div className="md:hidden divide-y divide-[#24314c]/50 p-3 space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-[#94a3b8]">
                {locale === "ar" ? "جاري تحميل الدفتر المالي..." : "Loading transactions..."}
              </div>
            ) : transactions.length > 0 ? (
              transactions.map((tx) => (
                <div key={tx.id} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={tx.type === "REVENUE" ? "green" : "blue"} size="sm">
                        {tx.category}
                      </Badge>
                      <span className="font-mono text-[10px] text-[#caa95a]">{tx.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <span className="font-mono text-xs font-bold">
                      <span className={tx.type === "REVENUE" ? "text-emerald-400" : "text-rose-400"}>
                        {tx.type === "REVENUE" ? "+" : "-"}{tx.amountEGP.toLocaleString()} {locale === "ar" ? "ج.م" : "EGP"}
                      </span>
                    </span>
                  </div>

                  <p className="text-xs text-[#cbd5e1] font-medium">{tx.description}</p>

                  <div className="flex items-center justify-between text-[11px] text-[#94a3b8] pt-1">
                    <span>{tx.patientName ? `${tx.patientName} (${tx.doctorName})` : locale === "ar" ? "مصروفات عامة" : "General Clinic"}</span>
                    <span className="font-mono text-[10px] text-[#64748b]">{tx.date}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-[#64748b]">
                {locale === "ar" ? "لا توجد معاملات مسجلة." : "No transactions posted yet."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Post Transaction Modal */}
      <Modal
        isOpen={isPostOpen}
        onClose={() => setIsPostOpen(false)}
        title={dict.financials.postTransaction}
        description={locale === "ar" ? "تسجيل مقبوضات علاجية أو دفع مصروف تشغيلي" : "Record collection or clinic operating expense"}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const type = (formData.get("type") as "REVENUE" | "EXPENSE") || "REVENUE";
            const amountEGP = parseInt((formData.get("amount") as string) || "0", 10);
            const description = (formData.get("description") as string) || "";
            const categoryName = (formData.get("category") as string) || "";

            if (amountEGP > 0) {
              await postFinancialTransaction({
                type,
                amountEGP,
                description,
                categoryName,
              });
              await loadData();
            }
            setIsPostOpen(false);
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block text-xs font-medium text-[#94a3b8] mb-1">
              {locale === "ar" ? "نوع الحركة المالية" : "Transaction Type"}
            </label>
            <select name="type" className="w-full glass rounded-xl px-3.5 py-2 text-xs text-[#f8fafc] focus:border-[#caa95a] focus:outline-none">
              <option value="REVENUE">{locale === "ar" ? "إيراد / دفعة مريض (+)" : "Revenue / Patient Payment (+)"}</option>
              <option value="EXPENSE">{locale === "ar" ? "مصروف / تكلفة تشغيلية (-)" : "Expense / Operational (-)"}</option>
            </select>
          </div>

          <Input name="amount" label={locale === "ar" ? "المبلغ (ج.م)" : "Amount (EGP)"} type="number" placeholder="e.g. 1500" required />
          <Input name="category" label={locale === "ar" ? "البند" : "Category"} placeholder={locale === "ar" ? "مثل: علاج أسنان، معمل، مستلزمات" : "e.g. Clinical Treatment, Lab Fees, Dental Supplies"} required />
          <Input name="description" label={locale === "ar" ? "البيان / الوصف" : "Description"} placeholder={locale === "ar" ? "مثل: دفعة تركيبة أو صيانة أجهزة" : "e.g. Crown restoration fee or autoclave maintenance"} required />

          <div className="flex items-center justify-end gap-2 pt-3 border-t glass-divider/60">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsPostOpen(false)}
            >
              {dict.patientNew.cancelButton}
            </Button>
            <Button variant="primary" size="sm" type="submit">
              {locale === "ar" ? "ترحيل إلى الدفتر" : "Post to Ledger"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
