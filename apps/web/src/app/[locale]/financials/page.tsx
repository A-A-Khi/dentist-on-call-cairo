"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "../../../components/layout/AppShell";
import { PageHeader } from "../../../components/layout/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import {
  DataTable,
  TableActions,
  TableAmount,
  TableText,
  dash,
  useTableDensity,
  type DataColumn,
  type SortState,
} from "../../../components/ui/DataTable";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import {
  fetchFinancialCategories,
  fetchFinancialSummary,
  fetchFinancialTransactions,
  fetchOutstandingVisits,
  postFinancialTransaction,
  recordVisitPayment,
  updateFinancialTransaction,
} from "../../../lib/clinical-api";
import { getDictionarySync } from "../../../i18n/get-dictionary";
import type {
  FinancialCategory,
  FinancialSummary,
  FinancialTransaction,
  Visit,
} from "../../../lib/clinical-data";
import { getStoredSessionUser } from "../../../lib/session";
import { getDashboardHref } from "../../../components/layout/nav-config";

function visitMoney(v: Visit) {
  const total =
    v.totalCostEGP ?? v.procedures.reduce((sum, p) => sum + (p.costEGP || 0), 0);
  const paid = v.paidAmountEGP ?? total;
  const remaining = v.remainingEGP ?? Math.max(total - paid, 0);
  return { total, paid, remaining };
}

export default function FinancialsPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) || "en";
  const dict = getDictionarySync(locale);
  const isAr = locale === "ar";
  const currency = isAr ? "ج.م" : "EGP";

  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [outstanding, setOutstanding] = useState<Visit[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPostOpen, setIsPostOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinancialTransaction | null>(null);
  const [txType, setTxType] = useState<"REVENUE" | "EXPENSE">("EXPENSE");
  const [categoryId, setCategoryId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const role = getStoredSessionUser()?.role ?? "DOCTOR";
    if (role !== "ADMIN") {
      router.replace(getDashboardHref(locale, "DOCTOR"));
    }
  }, [locale, router]);
  const [postError, setPostError] = useState<string | null>(null);
  const [payingVisitId, setPayingVisitId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [density, setDensity] = useTableDensity("compact");
  const [sort, setSort] = useState<SortState>({ id: "date", dir: "desc" });

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.transactionType === txType && c.isActive),
    [categories, txType]
  );

  const isEditModalOpen = editingTx !== null;
  const isTxFormOpen = isPostOpen || isEditModalOpen;

  const canEditTx = (tx: FinancialTransaction) =>
    tx.status === "POSTED" && (tx.isManual !== false) && !tx.visitId;

  const openEditTx = (tx: FinancialTransaction) => {
    if (!canEditTx(tx)) return;
    setPostError(null);
    setEditingTx(tx);
    setTxType(tx.type);
    setCategoryId(tx.categoryId || "");
    setEditAmount(String(tx.amountEGP));
    setEditDescription(tx.description || "");
    setEditDate(tx.date);
    setIsPostOpen(false);
  };

  const closeTxForm = () => {
    setIsPostOpen(false);
    setEditingTx(null);
    setPostError(null);
    setIsSaving(false);
  };

  const sortedTransactions = useMemo(() => {
    if (!sort) return transactions;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...transactions].sort((a, b) => {
      if (sort.id === "amount") return (a.amountEGP - b.amountEGP) * dir;
      if (sort.id === "date") return String(a.date).localeCompare(String(b.date)) * dir;
      if (sort.id === "ref") return a.id.localeCompare(b.id) * dir;
      if (sort.id === "category") return String(a.category).localeCompare(String(b.category)) * dir;
      return 0;
    });
  }, [transactions, sort]);

  const ledgerColumns: DataColumn<FinancialTransaction>[] = [
    {
      id: "ref",
      header: isAr ? "رقم القيد" : "Ref",
      sortable: true,
      minWidth: 96,
      cardRole: "id",
      cardLabel: isAr ? "رقم القيد" : "Entry ID",
      truncate: false,
      cell: (tx) => (
        <span className="font-mono font-medium text-[var(--gold-primary)]">
          {dash(tx.id.slice(0, 8).toUpperCase())}
        </span>
      ),
    },
    {
      id: "date",
      header: dict.financials.table.date,
      sortable: true,
      numeric: true,
      cardRole: "meta",
      cardLabel: isAr ? "بتاريخ" : "Posted",
      cell: (tx) => dash(tx.date),
    },
    {
      id: "category",
      header: dict.financials.table.category,
      sortable: true,
      truncate: false,
      cardRole: "detail",
      cardLabel: isAr ? "الفئة" : "Category",
      cell: (tx) =>
        tx.category ? (
          <Badge variant={tx.type === "REVENUE" ? "green" : "blue"} size="sm">
            {tx.category}
          </Badge>
        ) : (
          "–"
        ),
    },
    {
      id: "description",
      header: dict.financials.table.description,
      minWidth: 180,
      cardRole: "detail",
      cardLabel: isAr ? "البيان" : "Notes",
      cell: (tx) => <TableText className="text-secondary">{dash(tx.description)}</TableText>,
      truncate: false,
    },
    {
      id: "party",
      header: dict.financials.table.patientDoctor,
      pin: true,
      cardRole: "identity",
      truncate: false,
      cardCell: (tx) =>
        dash(tx.patientName) !== "–"
          ? tx.patientName
          : isAr
            ? "مصروفات عامة"
            : "General clinic",
      cell: (tx) =>
        tx.patientName ? (
          <div className="min-w-0 max-w-[12rem]">
            <TableText className="font-semibold text-primary">{tx.patientName}</TableText>
            <TableText className="text-[10px] text-muted">{dash(tx.doctorName)}</TableText>
          </div>
        ) : (
          <span className="text-muted">{isAr ? "مصروفات عامة" : "General clinic"}</span>
        ),
    },
    {
      id: "amount",
      header: dict.financials.table.amount,
      sortable: true,
      numeric: true,
      cardRole: "value",
      cell: (tx) => (
        <TableAmount
          value={tx.type === "EXPENSE" ? -Math.abs(tx.amountEGP) : tx.amountEGP}
          currency={currency}
          signed="auto"
          className="font-semibold"
        />
      ),
    },
    {
      id: "status",
      header: dict.financials.table.status,
      align: "end",
      cardRole: "state",
      cell: (tx) =>
        tx.status ? (
          <Badge variant={tx.type === "REVENUE" ? "green" : "neutral"} size="sm">
            {tx.status}
          </Badge>
        ) : (
          "–"
        ),
      truncate: false,
    },
    {
      id: "actions",
      header: dict.common.actions,
      actions: true,
      cardRole: "actions",
      truncate: false,
      cell: (tx) =>
        canEditTx(tx) ? (
          <TableActions
            items={[
              {
                id: "edit",
                label: dict.financials.table.edit,
                tone: "accent",
                onClick: () => openEditTx(tx),
              },
            ]}
          />
        ) : (
          <span className="text-[10px] text-muted" title={dict.financials.editLockedHint}>
            –
          </span>
        ),
    },
  ];

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [txData, catData, outstandingData, summaryData] = await Promise.all([
        fetchFinancialTransactions(),
        fetchFinancialCategories(),
        fetchOutstandingVisits(),
        fetchFinancialSummary(),
      ]);
      setTransactions(txData);
      setCategories(catData);
      setOutstanding(outstandingData);
      setSummary(summaryData);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!isTxFormOpen) return;
    const stillValid = filteredCategories.some((c) => c.id === categoryId);
    if (stillValid) return;
    const preferred =
      (editingTx?.categoryId &&
        filteredCategories.find((c) => c.id === editingTx.categoryId)?.id) ||
      filteredCategories[0]?.id ||
      "";
    setCategoryId(preferred);
  }, [isTxFormOpen, filteredCategories, categoryId, editingTx]);

  const totalRevenue = summary?.grossCollectedEGP ?? transactions
    .filter((t) => t.type === "REVENUE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const totalExpense = summary?.totalExpensesEGP ?? transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amountEGP, 0);

  const doctorShare = summary?.doctorShareEGP ?? 0;
  const assistantShare = summary?.assistantShareEGP ?? 0;
  const referralShare = summary?.referralShareEGP ?? 0;
  const caseCosts = summary?.caseCostsEGP ?? 0;
  const clinicShare = summary?.clinicShareEGP ?? totalRevenue;
  const avgCase = summary?.avgCaseEGP ?? 0;
  const netProfit = summary?.netClinicProfitEGP ?? clinicShare - totalExpense;
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
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => {
                setPostError(null);
                setEditingTx(null);
                setTxType("EXPENSE");
                setEditAmount("");
                setEditDescription("");
                setEditDate("");
                setIsPostOpen(true);
              }}
            >
              + {dict.financials.postTransaction}
            </Button>
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
            <span className="text-xs font-semibold text-secondary">{dict.financials.stats.clinicShare}</span>
            <div className="font-mono text-xl font-bold text-primary">
              {clinicShare.toLocaleString()} {currency}
            </div>
            <span className="text-[10px] text-muted">{isAr ? "بعد تكاليف الحالة ونسب الفريق" : "After case costs & team cuts"}</span>
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
            <span className="text-[10px] text-gold/80">{isAr ? "حصة العيادة − المصروفات" : "Clinic share − expenses"}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="glass-card rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-secondary">{dict.financials.stats.caseCosts}</span>
            <div className="font-mono text-lg font-bold text-rose-500">
              {caseCosts.toLocaleString()} {currency}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-secondary">{dict.financials.stats.doctorShare}</span>
            <div className="font-mono text-lg font-bold text-primary">
              {doctorShare.toLocaleString()} {currency}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-secondary">{dict.financials.stats.assistantShare}</span>
            <div className="font-mono text-lg font-bold text-primary">
              {assistantShare.toLocaleString()} {currency}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-secondary">{dict.financials.stats.referralShare}</span>
            <div className="font-mono text-lg font-bold text-primary">
              {referralShare.toLocaleString()} {currency}
            </div>
          </div>
          <div className="glass-card rounded-2xl p-4 space-y-1">
            <span className="text-[11px] font-semibold text-secondary">{dict.financials.stats.avgCase}</span>
            <div className="font-mono text-lg font-bold text-primary">
              {avgCase.toLocaleString()} {currency}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted -mt-2">{dict.financials.splitHelp}</p>

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
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          disabled={isPaying}
                          onClick={() => void handleRecordPayment(visit)}
                        >
                          {dict.financials.confirmPayment}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            setPayingVisitId(null);
                            setPaymentAmount("");
                            setPaymentError(null);
                          }}
                        >
                          {dict.patientProfile.cancel}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="danger-soft"
                        size="xs"
                        onClick={() => {
                          setPayingVisitId(visit.id);
                          setPaymentAmount(String(money.remaining));
                          setPaymentError(null);
                        }}
                      >
                        {dict.financials.recordPayment}
                      </Button>
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

        <DataTable
            columns={ledgerColumns}
            rows={sortedTransactions}
            getRowId={(tx) => tx.id}
            density={density}
            onDensityChange={setDensity}
            densityLabels={{
              compact: dict.common.densityCompact,
              default: dict.common.densityDefault,
              comfortable: dict.common.densityComfortable,
            }}
            sort={sort}
            onSortChange={setSort}
            sortControlLabel={dict.common.sort}
            loading={isLoading}
            loadingMessage={dict.common.loading}
            emptyMessage={
              isAr ? "لا توجد معاملات مالية مسجلة حتى الآن." : "No financial ledger transactions posted yet."
            }
            sheetTitle={(tx) =>
              tx.patientName || (isAr ? "مصروفات عامة" : "General clinic")
            }
            sheetDescription={(tx) => tx.id.slice(0, 8).toUpperCase()}
            toolbar={
              <div className="flex items-center gap-3 min-w-0">
                <h3 className="text-sm font-semibold text-primary truncate">
                  {dict.financials.transactionRegister}
                </h3>
                <span className="text-[11px] text-muted tabular-nums shrink-0">
                  {transactions.length} {isAr ? "حركات" : "entries"}
                </span>
              </div>
            }
          />
      </div>

      <Modal
        isOpen={isTxFormOpen}
        onClose={closeTxForm}
        title={editingTx ? dict.financials.editTransaction : dict.financials.postTransaction}
        description={
          editingTx
            ? isAr
              ? "تعديل مبلغ أو فئة أو بيان القيد المالي"
              : "Update amount, category, or description for this ledger entry"
            : isAr
              ? "تسجيل مقبوضات علاجية أو دفع مصروف حسب الفئة"
              : "Record collection or categorized clinic expense"
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setPostError(null);
            const formData = new FormData(e.currentTarget);
            const amountEGP = parseInt(
              editingTx
                ? editAmount
                : ((formData.get("amount") as string) || "0"),
              10
            );
            const description = editingTx
              ? editDescription
              : ((formData.get("description") as string) || "");
            const selected = filteredCategories.find((c) => c.id === categoryId);

            if (!selected) {
              setPostError(isAr ? "اختر فئة أو أضف فئة جديدة من الإعدادات." : "Choose a category, or add one in Settings.");
              return;
            }

            if (!(amountEGP > 0)) {
              setPostError(isAr ? "أدخل مبلغاً صالحاً أكبر من صفر." : "Enter a valid amount greater than zero.");
              return;
            }

            setIsSaving(true);
            try {
              if (editingTx) {
                await updateFinancialTransaction(editingTx.id, {
                  type: txType,
                  amountEGP,
                  description,
                  categoryId: selected.id,
                  categoryName: selected.nameEn,
                  effectiveOn: editDate || editingTx.date,
                });
              } else {
                await postFinancialTransaction({
                  type: txType,
                  amountEGP,
                  description,
                  categoryId: selected.id,
                  categoryName: selected.nameEn,
                });
              }
              await loadData();
              closeTxForm();
            } catch {
              setPostError(
                editingTx
                  ? isAr
                    ? "تعذر حفظ التعديلات. تحقق من الفئة وحاول مجددًا."
                    : "Could not save changes. Check the category and try again."
                  : isAr
                    ? "تعذر ترحيل الحركة. تحقق من الفئة وحاول مجددًا."
                    : "Could not post transaction. Check the category and try again."
              );
            } finally {
              setIsSaving(false);
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

          {editingTx ? (
            <>
              <Input
                name="amount"
                label={isAr ? "المبلغ (ج.م)" : "Amount (EGP)"}
                type="number"
                min={1}
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
              <Input
                name="effectiveOn"
                label={isAr ? "التاريخ الفعلي" : "Effective date"}
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </>
          ) : (
            <Input name="amount" label={isAr ? "المبلغ (ج.م)" : "Amount (EGP)"} type="number" placeholder="e.g. 1500" required />
          )}

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

          {editingTx ? (
            <Input
              name="description"
              label={isAr ? "البيان / الوصف" : "Description"}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              required
            />
          ) : (
            <Input
              name="description"
              label={isAr ? "البيان / الوصف" : "Description"}
              placeholder={isAr ? "مثل: حملة فيسبوك أو شراء مواد حشو" : "e.g. Facebook campaign or composite materials"}
              required
            />
          )}

          {postError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {postError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t glass-divider/60">
            <Button variant="outline" size="sm" type="button" onClick={closeTxForm}>
              {dict.patientNew.cancelButton}
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={!categoryId || isSaving}>
              {editingTx
                ? dict.financials.saveTransaction
                : isAr
                  ? "ترحيل إلى الدفتر"
                  : "Post to Ledger"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
