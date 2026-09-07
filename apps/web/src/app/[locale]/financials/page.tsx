"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  fetchFinancialCategories,
  fetchFinancialTransactions,
  fetchOutstandingVisits,
  postFinancialTransaction,
  recordVisitPayment,
} from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type { FinancialCategory, FinancialTransaction, Visit } from "../../../lib/clinical-data";

function visitMoney(v: Visit) {
  const total =
    v.totalCostEGP ?? v.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
  const paid = v.paidAmountEGP ?? total;
  const remaining = v.remainingEGP ?? Math.max(total - paid, 0);
  return { total, paid, remaining };
}

export default function FinancialsPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";
  const currency = isAr ? "ج.م" : "EGP";

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [outstanding, setOutstanding] = useState<Visit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [txType, setTxType] = useState<"REVENUE" | "EXPENSE">("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.transactionType === txType && c.isActive),
    [categories, txType]
  );

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [txData, catData, outstandingData] = await Promise.all([
        fetchFinancialTransactions(),
        fetchFinancialCategories(),
        fetchOutstandingVisits(),
      ]);
      setTransactions(txData);
      setCategories(catData);
      setOutstanding(outstandingData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!isPostOpen) return;
    const first = filteredCategories[0];
    setCategoryId(first?.id || "");
  }, [isPostOpen, filteredCategories]);

  const totalRevenue = transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const revenueCount = transactions.filter((t) => t.type === "REVENUE").length;
  const avgCase = revenueCount > 0 ? Math.round(totalRevenue / revenueCount) : 0;
  const netProfit = totalRevenue - totalExpense;
  const totalOutstanding = outstanding.reduce((sum, v) => sum + visitMoney(v).remaining, 0);

  const categoryLabel = (cat: FinancialCategory) =>
    isAr && cat.nameAr ? cat.nameAr : cat.nameEn;

  const handleRecordPayment = async (visit: Visit) => {
    const { remaining } = visitMoney(visit);
    const amount = parseInt(paymentAmount, 10);
    if (!amount || amount <= 0 || amount > remaining) {
      setPaymentError(dict.financials.paymentError);
      return;
    }
    setIsPaying(true);
    setPaymentError(null);
    try {
      await recordVisitPayment(visit.id, amount);
      setPayingVisitId(null);
      setPaymentAmount("");
      await loadData();
    } catch {
      setPaymentError(dict.financials.paymentError);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <AppShell locale={locale}>
      <div className="space-y-6">
        <PageHeader
          title={dict.financials.title}
          subtitle={dict.financials.subtitle}
          actions={
            <button
              type="button"
              onClick={() => {
                setPostError(null);
                setTxType("EXPENSE");
                setIsPostOpen(true);
              }}
              className="btn-gold"
            >
              + {dict.financials.postTransaction}
            </button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5 space-y-1">
            <span className="text-xs font-semibold text-secondary">{dict.financials.stats.revenue}</span>
            <div className="font-mono text-xl font-bold text-emerald-400">
              +{totalRevenue.toLocaleString()} {currency}
            </div>
            <span className="text-[10px] text-emerald-500/80">{isAr ? "مقبوضات مسجلة" : "Collections recorded"}</span>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-1">
            <span className="text-xs font-semibold text-secondary">{dict.financials.stats.expenses}</span>
            <div className="font-mono text-xl font-bold text-rose-400">
              -{totalExpense.toLocaleString()} {currency}
            </div>
            <span className="text-[10px] text-rose-500/80">{isAr ? "مصروفات حسب الفئة" : "Categorized expenses"}</span>
          </div>

          <div className="glass-active rounded-2xl p-5 space-y-1 shadow-lg shadow-[#caa95a]/10">
            <span className="text-xs font-semibold text-gold">{dict.financials.stats.profit}</span>
            <div className="font-mono text-xl font-bold text-gold-light">
              {netProfit.toLocaleString()} {currency}
            </div>
            <span className="text-[10px] text-gold/80">{isAr ? "هامش الفترة الحالية" : "Current period margin"}</span>
          </div>

          <div className="glass-card rounded-2xl p-5 space-y-1">
            <span className="text-xs font-semibold text-secondary">{dict.financials.stats.avgCase}</span>
            <div className="font-mono text-xl font-bold text-primary">
              {avgCase.toLocaleString()} {currency}
            </div>
            <span className="text-[10px] text-muted">{isAr ? "لكل زيارة علاجية" : "Per treatment visit"}</span>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-primary">{dict.financials.outstandingTitle}</h3>
            {totalOutstanding > 0 && (
              <span className="font-mono text-xs font-bold text-rose-500">
                {totalOutstanding.toLocaleString()} {currency}
              </span>
            )}
          </div>

          {outstanding.length === 0 ? (
            <p className="text-xs text-secondary">{dict.financials.outstandingEmpty}</p>
          ) : (
            <div className="space-y-3">
              {outstanding.map((visit) => {
                const money = visitMoney(visit);
                return (
                  <div
                    key={visit.id}
                    className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3 space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <Link
                          href={`/${locale}/patients/${visit.patientId}`}
                          className="text-sm font-semibold text-primary hover:text-gold"
                        >
                          {visit.patientName || visit.patientId}
                        </Link>
                        <p className="text-[11px] text-secondary">
                          {visit.date}
                          {visit.doctorName ? ` • ${visit.doctorName}` : ""}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-[11px] text-end sm:text-start">
                        <div>
                          <span className="text-muted block">{dict.patientProfile.totalCost}</span>
                          <span className="font-mono font-bold">{money.total.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted block">{dict.patientProfile.amountPaid}</span>
                          <span className="font-mono font-bold text-emerald-600">
                            {money.paid.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted block">{dict.patientProfile.remainingBalance}</span>
                          <span className="font-mono font-bold text-rose-500">
                            {money.remaining.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {payingVisitId === visit.id ? (
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                        <input
                          type="number"
                          min={1}
                          max={money.remaining}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder={dict.financials.paymentAmount}
                          className="w-full sm:w-40 glass rounded-xl px-3 py-2 text-xs font-mono focus:border-[#caa95a] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isPaying}
                          onClick={() => void handleRecordPayment(visit)}
                          className="rounded-xl bg-gradient-to-r from-[#dfbf70] via-[#caa95a] to-[#99782a] px-3 py-2 text-[11px] font-semibold text-on-gold"
                        >
                          {dict.financials.confirmPayment}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPayingVisitId(null);
                            setPaymentAmount("");
                            setPaymentError(null);
                          }}
                          className="glass rounded-xl px-3 py-2 text-[11px] text-secondary"
                        >
                          {dict.patientProfile.cancel}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPayingVisitId(visit.id);
                          setPaymentAmount(String(money.remaining));
                          setPaymentError(null);
                        }}
                        className="rounded-xl border border-rose-400/40 bg-white px-3 py-1.5 text-[11px] font-semibold text-rose-700"
                      >
                        {dict.financials.recordPayment}
                      </button>
                    )}
                    {payingVisitId === visit.id && paymentError && (
                      <p className="text-[11px] text-rose-600">{paymentError}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b glass-divider flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary">
              {dict.financials.transactionRegister}
            </h3>
            <span className="text-xs text-secondary font-mono">
              {transactions.length} {isAr ? "حركات مسجلة" : "entries posted"}
            </span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left rtl:text-right text-xs">
              <thead className="glass-table-header text-secondary">
                <tr>
                  <th className="px-4 py-3.5 font-medium">{isAr ? "رقم القيد" : "Ref"}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.date}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.category}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.description}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.patientDoctor}</th>
                  <th className="px-4 py-3.5 font-medium">{dict.financials.table.amount}</th>
                  <th className="px-4 py-3.5 font-medium text-end">{dict.financials.table.status}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-primary">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-secondary">
                      {isAr ? "جاري تحميل الدفتر المالي..." : "Loading transactions..."}
                    </td>
                  </tr>
                ) : transactions.length > 0 ? (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="glass-hover transition-colors">
                      <td className="px-4 py-3.5 font-mono text-gold">{tx.id.slice(0, 8).toUpperCase()}</td>
                      <td className="px-4 py-3.5 text-secondary font-mono">{tx.date}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={tx.type === "REVENUE" ? "green" : "blue"} size="sm">
                          {tx.category}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-[#cbd5e1] max-w-xs truncate">{tx.description}</td>
                      <td className="px-4 py-3.5">
                        {tx.patientName ? (
                          <div>
                            <span className="font-semibold text-primary">{tx.patientName}</span>
                            <span className="text-[10px] text-muted block">{tx.doctorName}</span>
                          </div>
                        ) : (
                          <span className="text-muted">{isAr ? "مصروفات عامة" : "General Clinic"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold">
                        <span className={tx.type === "REVENUE" ? "text-emerald-400" : "text-rose-400"}>
                          {tx.type === "REVENUE" ? "+" : "-"}
                          {tx.amountEGP.toLocaleString()} {currency}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-end">
                        <span className="text-[11px] text-muted">{tx.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-muted">
                      {isAr ? "لا توجد معاملات مالية مسجلة حتى الآن." : "No financial ledger transactions posted yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-slate-200 p-3 space-y-3">
            {isLoading ? (
              <div className="py-12 text-center text-xs text-secondary">
                {isAr ? "جاري تحميل الدفتر المالي..." : "Loading transactions..."}
              </div>
            ) : transactions.length > 0 ? (
              transactions.map((tx) => (
                <div key={tx.id} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={tx.type === "REVENUE" ? "green" : "blue"} size="sm">
                        {tx.category}
                      </Badge>
                      <span className="font-mono text-[10px] text-gold">{tx.id.slice(0, 8).toUpperCase()}</span>
                    </div>
                    <span className="font-mono text-xs font-bold">
                      <span className={tx.type === "REVENUE" ? "text-emerald-400" : "text-rose-400"}>
                        {tx.type === "REVENUE" ? "+" : "-"}
                        {tx.amountEGP.toLocaleString()} {currency}
                      </span>
                    </span>
                  </div>
                  <p className="text-xs text-[#cbd5e1] font-medium">{tx.description}</p>
                  <div className="flex items-center justify-between text-[11px] text-secondary pt-1">
                    <span>
                      {tx.patientName
                        ? `${tx.patientName} (${tx.doctorName})`
                        : isAr
                          ? "مصروفات عامة"
                          : "General Clinic"}
                    </span>
                    <span className="font-mono text-[10px] text-muted">{tx.date}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-muted">
                {isAr ? "لا توجد معاملات مسجلة." : "No transactions posted yet."}
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={isPostOpen}
        onClose={() => setIsPostOpen(false)}
        title={dict.financials.postTransaction}
        description={isAr ? "تسجيل مقبوضات علاجية أو دفع مصروف حسب الفئة" : "Record collection or categorized clinic expense"}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPostError(null);
            const formData = new FormData(e.currentTarget);
            const amountEGP = parseInt((formData.get("amount") as string) || "0", 10);
            const description = (formData.get("description") as string) || "";
            const selected = filteredCategories.find((c) => c.id === categoryId);

            if (!selected) {
              setPostError(isAr ? "اختر فئة أو أضف فئة جديدة من الإعدادات." : "Choose a category, or add one in Settings.");
              return;
            }

            if (amountEGP > 0) {
              try {
                await postFinancialTransaction({
                  type: txType,
                  amountEGP,
                  description,
                  categoryId: selected.id,
                  categoryName: selected.nameEn,
                });
                await loadData();
                setIsPostOpen(false);
              } catch {
                setPostError(
                  isAr
                    ? "تعذر ترحيل الحركة. تحقق من الفئة وحاول مجددًا."
                    : "Could not post transaction. Check the category and try again."
                );
              }
            }
          }}
          className="space-y-4 text-xs"
        >
          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              {isAr ? "نوع الحركة المالية" : "Transaction Type"}
            </label>
            <select
              name="type"
              value={txType}
              onChange={(e) => setTxType(e.target.value as "REVENUE" | "EXPENSE")}
              className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
            >
              <option value="REVENUE">{isAr ? "إيراد / دفعة مريض (+)" : "Revenue / Patient Payment (+)"}</option>
              <option value="EXPENSE">{isAr ? "مصروف / تكلفة تشغيلية (-)" : "Expense / Operational (-)"}</option>
            </select>
          </div>

          <Input name="amount" label={isAr ? "المبلغ (ج.م)" : "Amount (EGP)"} type="number" placeholder="e.g. 1500" required />

          <div>
            <label className="block text-xs font-medium text-secondary mb-1">
              {isAr ? "فئة المصروف / الإيراد" : "Category"}
            </label>
            <select
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="w-full glass rounded-xl px-3.5 py-2 text-xs text-primary focus:border-[#caa95a] focus:outline-none"
            >
              {filteredCategories.length === 0 ? (
                <option value="">{isAr ? "لا توجد فئات — أضف من الإعدادات" : "No categories — add in Settings"}</option>
              ) : (
                filteredCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {categoryLabel(cat)}
                  </option>
                ))
              )}
            </select>
          </div>

          <Input
            name="description"
            label={isAr ? "البيان / الوصف" : "Description"}
            placeholder={isAr ? "مثل: حملة فيسبوك أو شراء مواد حشو" : "e.g. Facebook campaign or composite materials"}
            required
          />

          {postError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {postError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t glass-divider/60">
            <Button variant="outline" size="sm" type="button" onClick={() => setIsPostOpen(false)}>
              {dict.patientNew.cancelButton}
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={!categoryId}>
              {isAr ? "ترحيل إلى الدفتر" : "Post to Ledger"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
