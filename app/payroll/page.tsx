"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import { lkr, formatTime12 } from "@/lib/data";
import { supabase } from "@/lib/supabase";

// ── helpers ───────────────────────────────────────────────────────────────────

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function monthRange(y: number, m: number): { start: string; end: string; label: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(y, m, 0).getDate();
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return {
    start: `${y}-${pad(m)}-01`,
    end:   `${y}-${pad(m)}-${last}`,
    label: `${MONTHS[m - 1]} ${y}`,
  };
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash", card: "Card", transfer: "Transfer",
};

// ── types ─────────────────────────────────────────────────────────────────────

type TxRow = {
  id: number;
  time: string;
  customerName: string;
  serviceName: string;
  servicePrice: number;
  staffName: string | null;
  paymentMethod: string | null;
  discountAmount: number;
  net: number;
};

type StaffPayRow = {
  id: number;
  name: string;
  role: string | null;
  salary: number;
  appointments: number;
  commission: number;
  total: number;
};

// ── component ─────────────────────────────────────────────────────────────────

export default function PayrollPage() {
  const [view, setView] = useState<"reconciliation" | "payroll">("reconciliation");

  // ── Reconciliation state ───────────────────────────────────────────────────
  const [recoDate, setRecoDate] = useState(isoToday());
  const [txRows,   setTxRows]   = useState<TxRow[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);

  // ── Payroll state ──────────────────────────────────────────────────────────
  const today = new Date();
  const [payYear,  setPayYear]  = useState(today.getFullYear());
  const [payMonth, setPayMonth] = useState(today.getMonth() + 1);
  const [staffRows, setStaffRows] = useState<StaffPayRow[]>([]);
  const [ownerApts,  setOwnerApts]  = useState(0);
  const [ownerComm,  setOwnerComm]  = useState(0);
  const [payLoading, setPayLoading] = useState(false);

  // ── Fetch reconciliation ───────────────────────────────────────────────────

  const fetchReco = useCallback(async (date: string) => {
    setRecoLoading(true);
    const { data } = await supabase
      .from("appointments")
      .select("*, customers(name), services(name, price), staff(name)")
      .eq("date", date)
      .eq("status", "completed")
      .order("time");

    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const price    = (r.services as { price?: number } | null)?.price ?? 0;
      const discount = (r.discount_amount as number) ?? 0;
      return {
        id:            r.id as number,
        time:          ((r.time as string) ?? "").slice(0, 5),
        customerName:  (r.customers as { name?: string } | null)?.name ?? "Customer",
        serviceName:   (r.services as { name?: string } | null)?.name ?? "Service",
        servicePrice:  price,
        staffName:     (r.staff as { name?: string } | null)?.name ?? null,
        paymentMethod: (r.payment_method as string | null) ?? null,
        discountAmount: discount,
        net:           Math.max(0, price - discount),
      };
    });
    setTxRows(rows);
    setRecoLoading(false);
  }, []);

  useEffect(() => { fetchReco(recoDate); }, [recoDate, fetchReco]);

  // ── Fetch payroll ──────────────────────────────────────────────────────────

  const fetchPayroll = useCallback(async (y: number, m: number) => {
    setPayLoading(true);
    const { start, end } = monthRange(y, m);

    const [staffRes, aptRes] = await Promise.all([
      supabase.from("staff").select("id, name, role, salary").eq("active", true).order("name"),
      supabase
        .from("appointments")
        .select("*, staff_id, staff(id, name), services(price, commission_rate)")
        .eq("status", "completed")
        .gte("date", start)
        .lte("date", end),
    ]);

    const allStaff = (staffRes.data ?? []) as { id: number; name: string; role: string | null; salary: number | null }[];
    const apts     = ((aptRes.data  ?? []) as Record<string, unknown>[]);

    // Build commission map: staffId → { count, commission }
    const commMap = new Map<number, { count: number; commission: number }>();
    let ownerCount = 0, ownerCommTotal = 0;

    for (const a of apts) {
      const sid     = (a.staff_id as number | null) ?? null;
      const price   = (a.services as { price?: number; commission_rate?: number } | null)?.price ?? 0;
      const rate    = (a.services as { price?: number; commission_rate?: number } | null)?.commission_rate ?? 0;
      const earned  = price * rate / 100;

      if (sid == null) {
        ownerCount++;
        ownerCommTotal += earned;
      } else {
        const ex = commMap.get(sid) ?? { count: 0, commission: 0 };
        commMap.set(sid, { count: ex.count + 1, commission: ex.commission + earned });
      }
    }

    const rows: StaffPayRow[] = allStaff.map((s) => {
      const stats = commMap.get(s.id) ?? { count: 0, commission: 0 };
      const salary = s.salary ?? 0;
      return {
        id:           s.id,
        name:         s.name,
        role:         s.role,
        salary,
        appointments: stats.count,
        commission:   stats.commission,
        total:        salary + stats.commission,
      };
    });

    setStaffRows(rows);
    setOwnerApts(ownerCount);
    setOwnerComm(ownerCommTotal);
    setPayLoading(false);
  }, []);

  useEffect(() => { fetchPayroll(payYear, payMonth); }, [payYear, payMonth, fetchPayroll]);

  // ── Reconciliation derived values ──────────────────────────────────────────

  const totals = { cash: 0, card: 0, transfer: 0, unrecorded: 0, gross: 0, discounts: 0 };
  for (const tx of txRows) {
    totals.gross    += tx.servicePrice;
    totals.discounts += tx.discountAmount;
    const key = (tx.paymentMethod ?? "unrecorded") as keyof typeof totals;
    if (key in totals) totals[key] += tx.net;
    else               totals.unrecorded += tx.net;
  }
  const totalNet = totals.cash + totals.card + totals.transfer + totals.unrecorded;
  const unrecordedCount = txRows.filter((t) => !t.paymentMethod).length;

  // ── Payroll derived values ─────────────────────────────────────────────────

  const totalSalaries    = staffRows.reduce((s, r) => s + r.salary,     0);
  const totalCommissions = staffRows.reduce((s, r) => s + r.commission, 0) + ownerComm;
  const grandPayroll     = totalSalaries + totalCommissions;
  const { label: monthLabel } = monthRange(payYear, payMonth);

  const shiftMonth = (delta: number) => {
    let m = payMonth + delta, y = payYear;
    if (m > 12) { m = 1;  y++; }
    if (m < 1)  { m = 12; y--; }
    setPayMonth(m);
    setPayYear(y);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-app page-payroll">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">Finance</div>
              <h1 className="page-title">Payroll &amp; Reconciliation</h1>
              <p className="page-sub">
                Daily payment summaries for closing the till, and monthly payroll
                breakdowns to know exactly what each staff member is owed.
              </p>
            </div>
            <div className="header-actions">
              <div className="seg-toggle">
                <button
                  type="button"
                  className={`seg-btn ${view === "reconciliation" ? "active" : ""}`}
                  onClick={() => setView("reconciliation")}
                >
                  Daily reconciliation
                </button>
                <button
                  type="button"
                  className={`seg-btn ${view === "payroll" ? "active" : ""}`}
                  onClick={() => setView("payroll")}
                >
                  Staff payroll
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════
            DAILY RECONCILIATION
        ════════════════════════════════════ */}
        {view === "reconciliation" && (
          <>
            {/* Date navigator */}
            <div className="pay-toolbar">
              <button
                type="button" className="cal-nav-btn"
                aria-label="Previous day"
                onClick={() => setRecoDate((d) => shiftDate(d, -1))}
              >
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <input
                type="date"
                value={recoDate}
                onChange={(e) => setRecoDate(e.target.value)}
                className="pay-date-input"
              />
              <button
                type="button" className="cal-nav-btn"
                aria-label="Next day"
                onClick={() => setRecoDate((d) => shiftDate(d, 1))}
              >
                <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <button
                type="button" className="btn btn-secondary"
                style={{ fontSize: 12, padding: "7px 16px" }}
                onClick={() => setRecoDate(isoToday())}
              >
                Today
              </button>
              <span className="pay-date-label">{formatDateLong(recoDate)}</span>
            </div>

            {recoLoading ? (
              <div className="pay-loading">Loading transactions…</div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="pay-summary-grid">
                  {[
                    { label: "Cash",         value: totals.cash,       accent: "var(--plum-700)" },
                    { label: "Card",          value: totals.card,       accent: "var(--plum-700)" },
                    { label: "Bank transfer", value: totals.transfer,   accent: "var(--plum-700)" },
                    { label: "Net revenue",   value: totalNet,          accent: "var(--plum-900)", bold: true },
                  ].map((c) => (
                    <div key={c.label} className={`pay-card ${c.bold ? "pay-card-total" : ""}`}>
                      <div className="pay-card-label">{c.label}</div>
                      <div className="pay-card-value" style={{ color: c.accent }}>
                        {c.value > 0 ? lkr(Math.round(c.value)) : <span style={{ color: "var(--ink-300)" }}>—</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Discounts + gross callout */}
                {totals.discounts > 0 && (
                  <div className="pay-callout">
                    Gross before discounts: {lkr(Math.round(totals.gross))}
                    <span style={{ marginLeft: 16, color: "var(--ink-400)" }}>
                      Total discounts given: {lkr(Math.round(totals.discounts))}
                    </span>
                  </div>
                )}

                {/* Unrecorded warning */}
                {unrecordedCount > 0 && (
                  <div className="pay-warning">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {unrecordedCount} appointment{unrecordedCount > 1 ? "s" : ""} completed without a recorded payment
                    method — these are included in the totals above as unrecorded.
                  </div>
                )}

                {/* Transaction table */}
                {txRows.length === 0 ? (
                  <div className="pay-empty">No completed appointments on {formatDateLong(recoDate)}.</div>
                ) : (
                  <div className="pay-table-wrap">
                    <table className="pay-table">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Customer</th>
                          <th>Service</th>
                          <th>Staff</th>
                          <th style={{ textAlign: "right" }}>Price</th>
                          <th style={{ textAlign: "right" }}>Discount</th>
                          <th style={{ textAlign: "right" }}>Net</th>
                          <th>Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {txRows.map((tx) => (
                          <tr key={tx.id} className={!tx.paymentMethod ? "pay-row-warn" : ""}>
                            <td className="pay-time">{formatTime12(tx.time)}</td>
                            <td>{tx.customerName}</td>
                            <td>{tx.serviceName}</td>
                            <td style={{ color: "var(--ink-500)" }}>{tx.staffName ?? "Owner"}</td>
                            <td style={{ textAlign: "right" }}>{lkr(tx.servicePrice)}</td>
                            <td style={{ textAlign: "right", color: "var(--ink-400)" }}>
                              {tx.discountAmount > 0 ? `− ${lkr(tx.discountAmount)}` : "—"}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 500 }}>{lkr(tx.net)}</td>
                            <td>
                              {tx.paymentMethod ? (
                                <span className={`chip chip-sm ${tx.paymentMethod === "cash" ? "chip-success" : tx.paymentMethod === "card" ? "chip-plum" : "chip-warning"}`}>
                                  {PAYMENT_LABELS[tx.paymentMethod] ?? tx.paymentMethod}
                                </span>
                              ) : (
                                <span className="chip chip-sm chip-gray">Unrecorded</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={4} style={{ fontWeight: 500, color: "var(--ink-700)" }}>
                            {txRows.length} transaction{txRows.length !== 1 ? "s" : ""}
                          </td>
                          <td style={{ textAlign: "right", color: "var(--ink-500)" }}>
                            {lkr(Math.round(totals.gross))}
                          </td>
                          <td style={{ textAlign: "right", color: "var(--ink-400)" }}>
                            {totals.discounts > 0 ? `− ${lkr(Math.round(totals.discounts))}` : "—"}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "var(--plum-800)" }}>
                            {lkr(Math.round(totalNet))}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ════════════════════════════════════
            STAFF PAYROLL
        ════════════════════════════════════ */}
        {view === "payroll" && (
          <>
            {/* Month navigator */}
            <div className="pay-toolbar">
              <button
                type="button" className="cal-nav-btn"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <span className="pay-date-label" style={{ minWidth: 160, textAlign: "center" }}>
                {monthLabel}
              </span>
              <button
                type="button" className="cal-nav-btn"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
              >
                <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>

            {payLoading ? (
              <div className="pay-loading">Loading payroll data…</div>
            ) : (
              <>
                {/* Payroll summary cards */}
                <div className="pay-summary-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <div className="pay-card">
                    <div className="pay-card-label">Total salaries</div>
                    <div className="pay-card-value">{totalSalaries > 0 ? lkr(Math.round(totalSalaries)) : <span style={{ color: "var(--ink-300)" }}>—</span>}</div>
                  </div>
                  <div className="pay-card">
                    <div className="pay-card-label">Total commissions</div>
                    <div className="pay-card-value">{totalCommissions > 0 ? lkr(Math.round(totalCommissions)) : <span style={{ color: "var(--ink-300)" }}>—</span>}</div>
                  </div>
                  <div className="pay-card pay-card-total">
                    <div className="pay-card-label">Total payroll</div>
                    <div className="pay-card-value" style={{ color: "var(--plum-900)" }}>
                      {grandPayroll > 0 ? lkr(Math.round(grandPayroll)) : <span style={{ color: "var(--ink-300)" }}>—</span>}
                    </div>
                  </div>
                </div>

                {staffRows.length === 0 && ownerApts === 0 ? (
                  <div className="pay-empty">No completed appointments in {monthLabel}.</div>
                ) : (
                  <div className="pay-table-wrap">
                    <table className="pay-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Role</th>
                          <th style={{ textAlign: "right" }}>Appointments</th>
                          <th style={{ textAlign: "right" }}>Monthly salary</th>
                          <th style={{ textAlign: "right" }}>Commission earned</th>
                          <th style={{ textAlign: "right" }}>Total payable</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffRows.map((s) => (
                          <tr key={s.id}>
                            <td style={{ fontWeight: 500 }}>{s.name}</td>
                            <td style={{ color: "var(--ink-500)" }}>{s.role ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{s.appointments}</td>
                            <td style={{ textAlign: "right" }}>
                              {s.salary > 0 ? lkr(Math.round(s.salary)) : <span style={{ color: "var(--ink-300)" }}>—</span>}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {s.commission > 0
                                ? <span style={{ color: "var(--plum-700)", fontWeight: 500 }}>{lkr(Math.round(s.commission))}</span>
                                : <span style={{ color: "var(--ink-300)" }}>—</span>}
                            </td>
                            <td style={{ textAlign: "right", fontWeight: 600, color: "var(--plum-800)" }}>
                              {lkr(Math.round(s.total))}
                            </td>
                          </tr>
                        ))}

                        {/* Owner row — appointments done without staff assigned */}
                        {(ownerApts > 0 || ownerComm > 0) && (
                          <tr style={{ background: "var(--cream)" }}>
                            <td style={{ fontWeight: 500, color: "var(--ink-600)" }}>Owner (unassigned)</td>
                            <td style={{ color: "var(--ink-400)" }}>—</td>
                            <td style={{ textAlign: "right" }}>{ownerApts}</td>
                            <td style={{ textAlign: "right", color: "var(--ink-300)" }}>—</td>
                            <td style={{ textAlign: "right" }}>
                              {ownerComm > 0
                                ? <span style={{ color: "var(--plum-700)", fontWeight: 500 }}>{lkr(Math.round(ownerComm))}</span>
                                : <span style={{ color: "var(--ink-300)" }}>—</span>}
                            </td>
                            <td style={{ textAlign: "right", color: "var(--ink-400)" }}>—</td>
                          </tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ fontWeight: 500, color: "var(--ink-700)" }}>
                            {staffRows.length} staff member{staffRows.length !== 1 ? "s" : ""}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 500 }}>{lkr(Math.round(totalSalaries))}</td>
                          <td style={{ textAlign: "right", fontWeight: 500, color: "var(--plum-700)" }}>
                            {totalCommissions > 0 ? lkr(Math.round(totalCommissions)) : "—"}
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "var(--plum-800)" }}>
                            {lkr(Math.round(grandPayroll))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-400)", lineHeight: 1.6 }}>
                  Commissions are calculated from service price × commission rate for each completed appointment.
                  Salary figures are monthly fixed amounts — prorate manually if staff joined or left mid-month.
                </div>
              </>
            )}
          </>
        )}
      </main>

      <MobileTabBar active="more" />
    </div>
  );
}
