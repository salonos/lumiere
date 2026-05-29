"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import Modal from "@/components/Modal";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastTone } from "@/components/Toast";
import { lkr, humanError, appointmentBase, addonTotalsByAppointment } from "@/lib/data";
import { supabase } from "@/lib/supabase";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

type RangeKey = "month" | "quarter" | "year" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  month:   "Month",
  quarter: "Last 3 months",
  year:    "This year",
  all:     "All time",
};

const EXPENSE_CATEGORIES = [
  "Supplies",
  "Rent",
  "Utilities",
  "Staff Wages",
  "Equipment",
  "Marketing",
  "Cleaning",
  "Professional Services",
  "Other",
] as const;

const PAYMENT_METHODS = [
  { value: "cash",     label: "Cash" },
  { value: "card",     label: "Card" },
  { value: "transfer", label: "Bank transfer" },
] as const;

// Soft colour chips per category
const CAT_COLOR: Record<string, { bg: string; text: string }> = {
  "Supplies":              { bg: "var(--plum-100)",  text: "var(--plum-800)" },
  "Rent":                  { bg: "#FEF3C7",           text: "#92400E" },
  "Utilities":             { bg: "#DBEAFE",           text: "#1E40AF" },
  "Staff Wages":           { bg: "#D1FAE5",           text: "#065F46" },
  "Equipment":             { bg: "#FEE2E2",           text: "#991B1B" },
  "Marketing":             { bg: "#EDE9FE",           text: "#5B21B6" },
  "Cleaning":              { bg: "#CFFAFE",           text: "#164E63" },
  "Professional Services": { bg: "#FEF9C3",           text: "#713F12" },
  "Other":                 { bg: "var(--ink-100)",    text: "var(--ink-700)" },
};

const METHOD_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  cash:     { bg: "#D1FAE5", text: "#065F46", label: "Cash" },
  card:     { bg: "#DBEAFE", text: "#1E40AF", label: "Card" },
  transfer: { bg: "#FEF3C7", text: "#92400E", label: "Transfer" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Expense = {
  id: number;
  date: string;
  description: string;
  category: string;
  amount: number;
  payment_method: "cash" | "card" | "transfer";
  bill_number: string | null;
  vendor: string | null;
  notes: string | null;
  source?: "manual" | "payroll" | null;
  period_year?: number | null;
  period_month?: number | null;
};

type IncomeBreakdown = {
  total: number;
  cash: number;
  card: number;
  transfer: number;
  unrecorded: number;
};

type ExpenseBreakdown = {
  total: number;
  cash: number;
  card: number;
  transfer: number;
};

type FormState = {
  date:           string;
  description:    string;
  category:       string;
  amount:         string;
  payment_method: "cash" | "card" | "transfer" | "";
  bill_number:    string;
  vendor:         string;
  notes:          string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

function blankForm(): FormState {
  return {
    date: todayIso(), description: "", category: "Supplies",
    amount: "", payment_method: "",
    bill_number: "", vendor: "", notes: "",
  };
}

function formFromExpense(e: Expense): FormState {
  return {
    date:           e.date,
    description:    e.description,
    category:       e.category,
    amount:         String(e.amount),
    payment_method: e.payment_method,
    bill_number:    e.bill_number ?? "",
    vendor:         e.vendor ?? "",
    notes:          e.notes ?? "",
  };
}

function buildExpenseBreakdown(expenses: Expense[]): ExpenseBreakdown {
  return expenses.reduce(
    (acc, e) => ({
      total: acc.total + e.amount,
      cash:     acc.cash     + (e.payment_method === "cash"     ? e.amount : 0),
      card:     acc.card     + (e.payment_method === "card"     ? e.amount : 0),
      transfer: acc.transfer + (e.payment_method === "transfer" ? e.amount : 0),
    }),
    { total: 0, cash: 0, card: 0, transfer: 0 },
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const today = new Date();

  // Period range: month (with month nav) / quarter / year / all time
  const [range, setRange] = useState<RangeKey>("month");

  // Current month in view (only used when range === "month")
  const [MY, setMY] = useState<{ year: number; month: number }>({
    year:  today.getFullYear(),
    month: today.getMonth(), // 0-indexed
  });

  // Data
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [income,   setIncome]   = useState<IncomeBreakdown | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Expense form modal
  const [formOpen,   setFormOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [form,       setForm]       = useState<FormState>(blankForm());
  const [touched,    setTouched]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  // Toast
  const [toast,     setToast]     = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<ToastTone>("info");
  const showError   = (msg: string) => { setToastTone("error");   setToast(msg); };
  const showSuccess = (msg: string) => { setToastTone("success"); setToast(msg); };

  // ── Period bounds ──────────────────────────────────────────────────────────
  //  start/end are null for "all time" (no date filter). periodLabel is the
  //  long label for card metas; periodNoun is the short label for stat headers.

  const pad = (n: number) => String(n).padStart(2, "0");
  let rangeStart: string | null;
  let rangeEnd:   string | null;
  let periodLabel: string;
  let periodNoun:  string;

  if (range === "month") {
    rangeStart = `${MY.year}-${pad(MY.month + 1)}-01`;
    const lastDay = new Date(MY.year, MY.month + 1, 0).getDate();
    rangeEnd   = `${MY.year}-${pad(MY.month + 1)}-${pad(lastDay)}`;
    periodLabel = `${MONTHS[MY.month]} ${MY.year}`;
    periodNoun  = MONTHS[MY.month];
  } else if (range === "quarter") {
    const y = today.getFullYear();
    const m = today.getMonth();
    const s = new Date(y, m - 2, 1);
    rangeStart = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    rangeEnd   = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    periodLabel = "Last 3 months";
    periodNoun  = "last 3 months";
  } else if (range === "year") {
    const y = today.getFullYear();
    rangeStart = `${y}-01-01`;
    rangeEnd   = `${y}-12-31`;
    periodLabel = String(y);
    periodNoun  = String(y);
  } else {
    rangeStart = null;
    rangeEnd   = null;
    periodLabel = "All time";
    periodNoun  = "all time";
  }

  // ── Fetch data ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Apply the date window only when a bounded range is selected ("all" = no filter)
    let expQuery = supabase
      .from("expenses")
      .select("*")
      .order("date",       { ascending: false })
      .order("created_at", { ascending: false });
    let aptQuery = supabase
      .from("appointments")
      .select("id, quantity, variant_price, services(price), payment_method, discount_amount")
      .eq("status", "completed");

    if (rangeStart && rangeEnd) {
      expQuery = expQuery.gte("date", rangeStart).lte("date", rangeEnd);
      aptQuery = aptQuery.gte("date", rangeStart).lte("date", rangeEnd);
    }

    const [expRes, aptRes] = await Promise.all([expQuery, aptQuery]);

    // Expenses
    if (expRes.error) showError(humanError(expRes.error, "Couldn't load expenses."));
    setExpenses((expRes.data ?? []) as Expense[]);

    // Add-on charges for the completed appointments, so income matches what was paid
    const apts = (aptRes.data ?? []) as Record<string, unknown>[];
    const ids  = apts.map((a) => a.id as number).filter(Boolean);
    let addonMap = new Map<number, number>();
    if (ids.length > 0) {
      const { data: addonRows } = await supabase
        .from("appointment_addons")
        .select("appointment_id, price, quantity")
        .in("appointment_id", ids);
      addonMap = addonTotalsByAppointment(addonRows);
    }

    // Income breakdown from completed appointments (effective price, net of discounts)
    const inc: IncomeBreakdown = { total: 0, cash: 0, card: 0, transfer: 0, unrecorded: 0 };
    for (const row of apts) {
      const gross    = appointmentBase(row as Parameters<typeof appointmentBase>[0]) + (addonMap.get(row.id as number) ?? 0);
      const discount = (row.discount_amount as number) ?? 0;
      const net      = Math.max(0, gross - discount);
      inc.total += net;
      const method = ((row.payment_method as string | null) ?? "unrecorded") as keyof IncomeBreakdown;
      if (method in inc) inc[method] += net;
    }
    setIncome(inc);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Month navigation ──────────────────────────────────────────────────────────

  const prevMonth = () => setMY(({ year, month }) =>
    month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
  );
  const nextMonth = () => setMY(({ year, month }) =>
    month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
  );

  const isFutureMonth =
    MY.year > today.getFullYear() ||
    (MY.year === today.getFullYear() && MY.month > today.getMonth());

  // ── Open form ─────────────────────────────────────────────────────────────────

  const openAdd = () => {
    setEditTarget(null);
    setForm(blankForm());
    setTouched(false);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (e: Expense) => {
    setEditTarget(e);
    setForm(formFromExpense(e));
    setTouched(false);
    setFormError(null);
    setFormOpen(true);
  };

  const setF = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Save ──────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setTouched(true);

    const amount = parseFloat(form.amount);
    if (!form.description.trim() || !form.date || !form.payment_method || isNaN(amount) || amount <= 0) {
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      date:           form.date,
      description:    form.description.trim(),
      category:       form.category,
      amount,
      payment_method: form.payment_method as "cash" | "card" | "transfer",
      bill_number:    form.bill_number.trim() || null,
      vendor:         form.vendor.trim()      || null,
      notes:          form.notes.trim()       || null,
    };

    const { error } = editTarget
      ? await supabase.from("expenses").update(payload).eq("id", editTarget.id)
      : await supabase.from("expenses").insert(payload);

    setSaving(false);

    if (error) {
      setFormError(humanError(error, "We couldn't save that expense. Try again in a moment."));
      return;
    }

    setFormOpen(false);
    fetchData();
    showSuccess(editTarget ? "Expense updated" : "Expense added");
  };

  // ── Delete ─────────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;

    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", deleteTarget.id);

    if (error) {
      showError(humanError(error, "We couldn't delete that expense."));
    } else {
      fetchData();
      showSuccess("Expense deleted");
    }
    setDeleteTarget(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const expBreakdown = buildExpenseBreakdown(expenses);
  const net          = (income?.total ?? 0) - expBreakdown.total;

  const formValid =
    form.description.trim().length > 0 &&
    form.date.length > 0 &&
    form.payment_method !== "" &&
    parseFloat(form.amount) > 0;

  const hasData    = !loading && ((income?.total ?? 0) > 0 || expBreakdown.total > 0);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="page-app page-reports">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        {/* ── Header ── */}
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">Every penny accounted for</div>
              <h1 className="page-title">Expenses</h1>
              <p className="page-sub">
                Record outgoings with payment method and receipt details.
                Compare against income to see your monthly net profit at a glance.
              </p>
            </div>
            <div className="header-actions" style={{ flexWrap: "wrap", gap: 10 }}>
              {/* Range selector */}
              <div className="seg-toggle">
                {(["month", "quarter", "year", "all"] as RangeKey[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`seg-btn ${range === r ? "active" : ""}`}
                    onClick={() => setRange(r)}
                  >
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </div>

              {/* Month navigator — only in month mode */}
              {range === "month" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    className="cal-nav-btn"
                    onClick={prevMonth}
                    aria-label="Previous month"
                  >
                    <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <span style={{
                    minWidth: 140, textAlign: "center",
                    fontSize: 13, fontWeight: 600,
                    color: "var(--ink-800)", letterSpacing: "0.01em",
                  }}>
                    {periodLabel}
                  </span>
                  <button
                    type="button"
                    className="cal-nav-btn"
                    onClick={nextMonth}
                    disabled={isFutureMonth}
                    aria-label="Next month"
                  >
                    <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              )}
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add expense
              </button>
            </div>
          </div>
        </div>

        {/* ── Summary band ── */}
        <div className="stat-band">
          <div className="stat">
            <div className="stat-label">Income · {periodNoun}</div>
            <div className="stat-value">
              {loading ? "—" : (income?.total ?? 0) > 0 ? lkr(Math.round(income!.total)) : "—"}
            </div>
            <div className="stat-meta">
              {loading
                ? "Loading…"
                : (income?.total ?? 0) === 0
                ? "No completed appointments"
                : "Net of discounts · completed appointments"}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Expenses · {periodNoun}</div>
            <div className="stat-value">
              {loading ? "—" : expBreakdown.total > 0 ? lkr(Math.round(expBreakdown.total)) : "—"}
            </div>
            <div className="stat-meta">
              {loading
                ? "Loading…"
                : expenses.length === 0
                ? "No expenses recorded"
                : `${expenses.length} expense record${expenses.length !== 1 ? "s" : ""}`}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Net profit · {periodNoun}</div>
            <div
              className="stat-value"
              style={{
                color: !hasData
                  ? undefined
                  : net >= 0 ? "#1F6B3A" : "#A53A2C",
              }}
            >
              {loading
                ? "—"
                : !hasData
                ? "—"
                : `${net < 0 ? "−" : ""}${lkr(Math.round(Math.abs(net)))}`}
            </div>
            <div className="stat-meta">
              {loading
                ? "Loading…"
                : !hasData
                ? "Add expenses and complete appointments to see this"
                : net >= 0
                ? "Profit — income exceeds expenses"
                : "Loss — expenses exceed income"}
            </div>
          </div>
        </div>

        {/* ── Income vs Expense breakdown table ── */}
        {hasData && (
          <div className="rep-card" style={{ marginBottom: 24 }}>
            <div className="rep-card-head">
              <div className="rep-card-title">Income vs Expenses — by payment method</div>
              <div className="rep-card-meta">{periodLabel} · net of discounts</div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Method</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      <span style={{ color: "#1F6B3A" }}>Income</span>
                    </th>
                    <th style={{ ...thStyle, textAlign: "right" }}>
                      <span style={{ color: "#A53A2C" }}>Expenses</span>
                    </th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {(["cash", "card", "transfer"] as const).map((method) => {
                    const inc = (income?.[method] ?? 0);
                    const exp = expBreakdown[method];
                    const rowNet = inc - exp;
                    if (inc === 0 && exp === 0) return null;
                    return (
                      <tr key={method} style={{ borderTop: "1px solid var(--ink-100)" }}>
                        <td style={tdStyle}>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 9px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                            background: METHOD_STYLE[method].bg,
                            color:      METHOD_STYLE[method].text,
                          }}>
                            {METHOD_STYLE[method].label}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {inc > 0
                            ? <span style={{ color: "#1F6B3A", fontWeight: 500 }}>{lkr(Math.round(inc))}</span>
                            : <span style={{ color: "var(--ink-300)" }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>
                          {exp > 0
                            ? <span style={{ color: "#A53A2C", fontWeight: 500 }}>{lkr(Math.round(exp))}</span>
                            : <span style={{ color: "var(--ink-300)" }}>—</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                          <span style={{ color: rowNet >= 0 ? "#1F6B3A" : "#A53A2C" }}>
                            {rowNet !== 0
                              ? `${rowNet < 0 ? "−" : ""}${lkr(Math.round(Math.abs(rowNet)))}`
                              : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Unrecorded income row */}
                  {(income?.unrecorded ?? 0) > 0 && (
                    <tr style={{ borderTop: "1px solid var(--ink-100)" }}>
                      <td style={{ ...tdStyle, color: "var(--ink-400)", fontStyle: "italic" }}>
                        Unrecorded
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={{ color: "var(--ink-400)" }}>{lkr(Math.round(income!.unrecorded))}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={{ color: "var(--ink-300)" }}>—</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <span style={{ color: "var(--ink-400)" }}>{lkr(Math.round(income!.unrecorded))}</span>
                      </td>
                    </tr>
                  )}

                  {/* Total row */}
                  <tr style={{ borderTop: "2px solid var(--ink-200)", background: "var(--cream)" }}>
                    <td style={{ ...tdStyle, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", fontSize: 11 }}>
                      Total
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#1F6B3A", fontSize: 15 }}>
                      {(income?.total ?? 0) > 0 ? lkr(Math.round(income!.total)) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#A53A2C", fontSize: 15 }}>
                      {expBreakdown.total > 0 ? lkr(Math.round(expBreakdown.total)) : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: 15 }}>
                      <span style={{ color: net >= 0 ? "#1F6B3A" : "#A53A2C" }}>
                        {net !== 0
                          ? `${net < 0 ? "−" : ""}${lkr(Math.round(Math.abs(net)))}`
                          : "—"}
                      </span>
                      {net !== 0 && (
                        <div style={{ fontSize: 10, fontWeight: 400, color: net >= 0 ? "#1F6B3A" : "#A53A2C", letterSpacing: "0.04em", textTransform: "uppercase", marginTop: 2 }}>
                          {net >= 0 ? "Profit" : "Loss"}
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Expense records ── */}
        <div className="rep-card" style={{ marginBottom: 32 }}>
          <div className="rep-card-head">
            <div className="rep-card-title">Expense records</div>
            <div className="rep-card-meta">
              {periodLabel} · {expenses.length} record{expenses.length !== 1 ? "s" : ""}
              {expBreakdown.total > 0 && ` · ${lkr(Math.round(expBreakdown.total))} total`}
            </div>
          </div>

          {loading ? (
            <div style={emptyStyle}>Loading…</div>
          ) : expenses.length === 0 ? (
            <div style={{ padding: "44px 24px", textAlign: "center" }}>
              <div style={{
                fontFamily: "var(--font-serif)", fontSize: 18,
                color: "var(--ink-700)", marginBottom: 8,
              }}>
                No expenses for {periodLabel}
              </div>
              <div style={{ fontSize: 13, color: "var(--ink-400)", marginBottom: 20 }}>
                Record your first outgoing — supplies, rent, utilities, and more.
              </div>
              <button type="button" className="btn btn-secondary" onClick={openAdd}>
                Add first expense
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Category</th>
                    <th style={thStyle}>Vendor · Receipt #</th>
                    <th style={thStyle}>Method</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={{ ...thStyle, width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr
                      key={e.id}
                      style={{ borderTop: "1px solid var(--ink-100)" }}
                    >
                      {/* Date */}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "var(--ink-500)" }}>
                        {formatDate(e.date)}
                      </td>

                      {/* Description + notes */}
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500, color: "var(--ink-900)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          {e.description}
                          {e.source === "payroll" && (
                            <span style={{
                              display: "inline-block",
                              padding: "1px 7px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                              letterSpacing: "0.04em", textTransform: "uppercase",
                              background: "var(--plum-100)", color: "var(--plum-800)",
                            }}>
                              Payroll
                            </span>
                          )}
                        </div>
                        {e.notes && (
                          <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2, lineHeight: 1.5 }}>
                            {e.notes}
                          </div>
                        )}
                      </td>

                      {/* Category chip */}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 9px", borderRadius: 6,
                          fontSize: 11, fontWeight: 500,
                          background: (CAT_COLOR[e.category] ?? CAT_COLOR["Other"]).bg,
                          color:      (CAT_COLOR[e.category] ?? CAT_COLOR["Other"]).text,
                        }}>
                          {e.category}
                        </span>
                      </td>

                      {/* Vendor + bill number */}
                      <td style={tdStyle}>
                        {e.vendor && (
                          <div style={{ fontWeight: 500, color: "var(--ink-800)" }}>{e.vendor}</div>
                        )}
                        {e.bill_number && (
                          <div style={{
                            fontSize: 11, color: "var(--ink-400)",
                            fontFamily: "monospace", marginTop: e.vendor ? 2 : 0,
                          }}>
                            #{e.bill_number}
                          </div>
                        )}
                        {!e.vendor && !e.bill_number && (
                          <span style={{ color: "var(--ink-300)" }}>—</span>
                        )}
                      </td>

                      {/* Payment method chip */}
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 9px", borderRadius: 6,
                          fontSize: 11, fontWeight: 500,
                          background: (METHOD_STYLE[e.payment_method] ?? METHOD_STYLE.cash).bg,
                          color:      (METHOD_STYLE[e.payment_method] ?? METHOD_STYLE.cash).text,
                        }}>
                          {(METHOD_STYLE[e.payment_method] ?? METHOD_STYLE.cash).label}
                        </span>
                      </td>

                      {/* Amount */}
                      <td style={{
                        ...tdStyle, textAlign: "right",
                        fontWeight: 600, color: "var(--ink-900)", whiteSpace: "nowrap",
                      }}>
                        {lkr(e.amount)}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => openEdit(e)}
                            style={iconBtnStyle}
                            title="Edit expense"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(e)}
                            style={{ ...iconBtnStyle, color: "#A53A2C", borderColor: "rgba(165,58,44,0.2)" }}
                            title="Delete expense"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Subtotal row */}
                  {expenses.length > 1 && (
                    <tr style={{ borderTop: "2px solid var(--ink-200)", background: "var(--cream)" }}>
                      <td colSpan={5} style={{ ...tdStyle, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-600)" }}>
                        Total
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, fontSize: 15, color: "var(--ink-900)" }}>
                        {lkr(Math.round(expBreakdown.total))}
                      </td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <MobileTabBar active="more" />

      {/* ── Add / Edit expense modal ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        eyebrow={editTarget ? "Edit expense" : "New expense"}
        title={editTarget ? "Edit expense" : "Add an expense"}
        subtitle="Record an outgoing with payment method and receipt details."
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || (touched && !formValid)}
            >
              {saving ? "Saving…" : editTarget ? "Save changes" : "Add expense"}
            </button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          {formError && (
            <div style={{
              marginBottom: 16, padding: "10px 14px",
              background: "#FEF2F2", borderRadius: 8,
              fontSize: 13, color: "#A53A2C",
            }}>
              {formError}
            </div>
          )}

          {/* Date + Amount */}
          <div className="field-row">
            <div className="field">
              <label htmlFor="exp-date">Date</label>
              <input
                id="exp-date"
                type="date"
                value={form.date}
                onChange={(e) => setF("date", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="exp-amount">Amount (LKR)</label>
              <input
                id="exp-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setF("amount", e.target.value)}
              />
              {touched && (!form.amount || parseFloat(form.amount) <= 0) && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#A53A2C" }}>
                  Enter a valid amount.
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="field">
            <label htmlFor="exp-desc">Description</label>
            <input
              id="exp-desc"
              type="text"
              placeholder="What was this expense for?"
              value={form.description}
              onChange={(e) => setF("description", e.target.value)}
            />
            {touched && !form.description.trim() && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#A53A2C" }}>
                A description is required.
              </div>
            )}
          </div>

          {/* Category */}
          <div className="field">
            <label htmlFor="exp-cat">Category</label>
            <select
              id="exp-cat"
              value={form.category}
              onChange={(e) => setF("category", e.target.value)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Payment method */}
          <div className="field">
            <label>
              Payment method <span style={{ color: "#A53A2C" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              {PAYMENT_METHODS.map((pm) => {
                const selected = form.payment_method === pm.value;
                return (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => setF("payment_method", pm.value)}
                    style={{
                      flex: 1, padding: "11px 6px", borderRadius: 10,
                      border: `1.5px solid ${selected ? "var(--plum-500)" : "var(--ink-200)"}`,
                      background: selected ? "var(--plum-50)" : "var(--white)",
                      color: selected ? "var(--plum-800)" : "var(--ink-700)",
                      fontSize: 13, fontWeight: selected ? 600 : 500,
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.12s",
                      boxShadow: selected ? "0 0 0 3px rgba(165,38,104,0.08)" : "none",
                    }}
                  >
                    {pm.label}
                  </button>
                );
              })}
            </div>
            {touched && !form.payment_method && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C" }}>
                Select a payment method.
              </div>
            )}
          </div>

          {/* Vendor + Bill number */}
          <div className="field-row">
            <div className="field">
              <label htmlFor="exp-vendor">
                Vendor / Purchase place{" "}
                <span style={{ fontWeight: 400, color: "var(--ink-500)", textTransform: "none", letterSpacing: 0 }}>
                  (optional)
                </span>
              </label>
              <input
                id="exp-vendor"
                type="text"
                placeholder="e.g. Keells, Abans, Glomark"
                value={form.vendor}
                onChange={(e) => setF("vendor", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="exp-bill">
                Bill / Receipt #
                <span style={{ fontWeight: 400, color: "var(--ink-500)", textTransform: "none", letterSpacing: 0 }}>
                  {" "}(optional)
                </span>
              </label>
              <input
                id="exp-bill"
                type="text"
                placeholder="e.g. INV-00123"
                value={form.bill_number}
                onChange={(e) => setF("bill_number", e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="field">
            <label htmlFor="exp-notes">
              Notes{" "}
              <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>(optional)</span>
            </label>
            <textarea
              id="exp-notes"
              placeholder="Any additional details…"
              value={form.notes}
              onChange={(e) => setF("notes", e.target.value)}
              rows={2}
            />
          </div>
        </form>
      </Modal>

      {/* ── Delete confirmation ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        eyebrow="Delete expense"
        title="Delete this expense?"
        body={
          deleteTarget
            ? `"${deleteTarget.description}" — ${lkr(deleteTarget.amount)} on ${formatDate(deleteTarget.date)}. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete expense"
        cancelLabel="Keep"
      />

      <Toast message={toast} tone={toastTone} onDone={() => setToast(null)} />
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const emptyStyle: React.CSSProperties = {
  padding: "32px 0",
  textAlign: "center",
  color: "var(--ink-400)",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-500)",
  borderBottom: "1px solid var(--ink-200)",
  background: "var(--cream)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  verticalAlign: "top",
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--ink-200)",
  borderRadius: 6,
  cursor: "pointer",
  padding: "5px 6px",
  color: "var(--ink-500)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
