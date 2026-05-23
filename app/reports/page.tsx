"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import { lkr } from "@/lib/data";
import { supabase } from "@/lib/supabase";

type RangeKey = "month" | "quarter" | "year";

// ── Date helpers ────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthLastDay(y: number, m: number): Date {
  return new Date(y, m + 1, 0); // day-0 of next month = last day of this month
}

function getRangeBounds(range: RangeKey) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  if (range === "month") {
    start = new Date(y, m, 1);
    end = monthLastDay(y, m);
    prevStart = new Date(y, m - 1, 1);
    prevEnd = monthLastDay(y, m - 1);
  } else if (range === "quarter") {
    start = new Date(y, m - 2, 1);       // 3 months ago, first day
    end = monthLastDay(y, m);
    prevStart = new Date(y, m - 5, 1);   // 6 months ago, first day
    prevEnd = monthLastDay(y, m - 3);    // 3 months ago, last day
  } else {
    start = new Date(y, 0, 1);
    end = new Date(y, 11, 31);
    prevStart = new Date(y - 1, 0, 1);
    prevEnd = new Date(y - 1, 11, 31);
  }

  return {
    start: isoDate(start),
    end: isoDate(end),
    prevStart: isoDate(prevStart),
    prevEnd: isoDate(prevEnd),
  };
}

const MON_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Returns the chart buckets that match the selected report range. */
function getTrendBuckets(range: RangeKey): { label: string; key: string }[] {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth(); // 0-indexed

  if (range === "month") {
    return [
      { label: "Wk 1", key: "week1" },
      { label: "Wk 2", key: "week2" },
      { label: "Wk 3", key: "week3" },
      { label: "Wk 4", key: "week4" },
    ];
  } else if (range === "quarter") {
    return Array.from({ length: 3 }, (_, i) => {
      const d = new Date(y, m - 2 + i, 1);
      return {
        label: MON_SHORT[d.getMonth()],
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      };
    });
  } else {
    // year: all 12 months of the current year
    return Array.from({ length: 12 }, (_, i) => ({
      label: MON_SHORT[i],
      key: `${y}-${String(i + 1).padStart(2, "0")}`,
    }));
  }
}

/** Maps a date string ("YYYY-MM-DD") to its week bucket key for the month view. */
function weekKeyFromDate(dateStr: string): string {
  const day = parseInt(dateStr.slice(8), 10);
  if (day <= 7)  return "week1";
  if (day <= 14) return "week2";
  if (day <= 21) return "week3";
  return "week4";
}

// ── Data types ──────────────────────────────────────────────────────────────

type TopService    = { name: string; bookings: number; revenue: number };
type TopCustomer   = { id: string; name: string; visits: number; spend: number };
type StaffCommission = { id: number; name: string; bookings: number; commission: number };
type PaymentBreakdown = { cash: number; card: number; transfer: number; unrecorded: number };

type ReportData = {
  revenue: number;
  prevRevenue: number;
  totalApts: number;
  completedApts: number;
  cancelledApts: number;
  newCustomers: number;
  cancelledRevenue: number;
  topServices: TopService[];
  topCustomers: TopCustomer[];
  revenueByMonth: { label: string; value: number }[];
  staffCommissions: StaffCommission[];
  paymentBreakdown: PaymentBreakdown;
};

// ── Fetch ───────────────────────────────────────────────────────────────────

async function fetchReports(range: RangeKey): Promise<ReportData> {
  const { start, end, prevStart, prevEnd } = getRangeBounds(range);

  // Run all queries; some may fail if optional migrations haven't been applied yet.
  const [currRes, prevRes, priorRes, commRes] = await Promise.all([
    // Current period — use * so missing columns (payment_method, discount_amount) don't break the query
    supabase
      .from("appointments")
      .select("*, customers(name), services(name, price)")
      .gte("date", start)
      .lte("date", end),

    // Previous period — just service price for revenue delta
    supabase
      .from("appointments")
      .select("status, services(price)")
      .gte("date", prevStart)
      .lte("date", prevEnd),

    // All appointments before current period — customer_ids only (new customer calc)
    supabase
      .from("appointments")
      .select("customer_id")
      .lt("date", start),

    // Commission: completed appointments with staff + service commission_rate
    // May fail pre-migration — handled gracefully below
    supabase
      .from("appointments")
      .select("*, staff(id, name), services(price, commission_rate)")
      .eq("status", "completed")
      .gte("date", start)
      .lte("date", end),
  ]);

  const currRaw  = currRes.data;
  const prevRaw  = prevRes.data;
  const priorRaw = priorRes.data;
  // For commissions, only use rows that actually have a non-null staff_id
  const commRaw  = commRes.error ? null : (commRes.data ?? []).filter(
    (r: Record<string, unknown>) => r.staff_id != null,
  );

  const curr  = currRaw  ?? [];
  const prev  = prevRaw  ?? [];
  const prior = priorRaw ?? [];
  const comm  = commRaw  ?? [];

  // ── Revenue ──
  type AptRow = { status: string; customer_id?: string; customers?: unknown; services?: unknown };

  const completed = (curr as AptRow[]).filter((a) => a.status === "completed");

  const price = (a: AptRow) =>
    ((a.services as { price?: number } | null)?.price ?? 0);

  const revenue     = completed.reduce((s, a) => s + price(a), 0);
  const prevRevenue = (prev as AptRow[])
    .filter((a) => a.status === "completed")
    .reduce((s, a) => s + price(a), 0);

  // ── Counts ──
  const totalApts     = curr.length;
  const completedApts = completed.length;
  const cancelledApts = (curr as AptRow[]).filter((a) => a.status === "cancelled").length;
  const cancelledRevenue = (curr as AptRow[])
    .filter((a) => a.status === "cancelled")
    .reduce((s, a) => s + price(a), 0);

  // ── New customers ──
  const priorIds = new Set((prior as AptRow[]).map((a) => a.customer_id));
  const currIds  = new Set((curr  as AptRow[]).map((a) => a.customer_id));
  const newCustomers = [...currIds].filter((id) => !priorIds.has(id)).length;

  // ── Top services ──
  const svcMap = new Map<string, TopService>();
  for (const a of completed) {
    const svc  = a.services as { name?: string; price?: number } | null;
    const name = svc?.name  ?? "Unknown";
    const p    = svc?.price ?? 0;
    const ex   = svcMap.get(name) ?? { name, bookings: 0, revenue: 0 };
    svcMap.set(name, { name, bookings: ex.bookings + 1, revenue: ex.revenue + p });
  }
  const topServices = [...svcMap.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // ── Top customers ──
  const custMap = new Map<string, TopCustomer>();
  for (const a of completed) {
    const id   = a.customer_id ?? "";
    const name = (a.customers as { name?: string } | null)?.name ?? "Customer";
    const p    = price(a);
    const ex   = custMap.get(id) ?? { id, name, visits: 0, spend: 0 };
    custMap.set(id, { id, name, visits: ex.visits + 1, spend: ex.spend + p });
  }
  const topCustomers = [...custMap.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  // ── Revenue trend — uses the same completed set as the selected period ──
  const trendBuckets = getTrendBuckets(range);
  const trendRevMap  = new Map<string, number>();
  for (const a of completed as (AptRow & { date?: string })[]) {
    if (!a.date) continue;
    const key = range === "month" ? weekKeyFromDate(a.date) : a.date.slice(0, 7);
    const p   = price(a);
    trendRevMap.set(key, (trendRevMap.get(key) ?? 0) + p);
  }
  const revenueByMonth = trendBuckets.map(({ label, key }) => ({
    label,
    value: trendRevMap.get(key) ?? 0,
  }));

  // ── Staff commissions ──
  const commMap = new Map<number, StaffCommission>();
  for (const a of comm as { staff_id: number; staff?: unknown; services?: unknown }[]) {
    const staffRow = a.staff as { id?: number; name?: string } | null;
    const svcRow   = a.services as { price?: number; commission_rate?: number } | null;
    const staffId  = staffRow?.id ?? a.staff_id;
    const name     = staffRow?.name ?? "Unknown";
    const price    = svcRow?.price ?? 0;
    const rate     = svcRow?.commission_rate ?? 0;
    const earned   = price * rate / 100;
    if (earned <= 0) continue;
    const ex = commMap.get(staffId) ?? { id: staffId, name, bookings: 0, commission: 0 };
    commMap.set(staffId, { ...ex, bookings: ex.bookings + 1, commission: ex.commission + earned });
  }
  const staffCommissions = [...commMap.values()].sort((a, b) => b.commission - a.commission);

  // ── Payment breakdown ──
  type CurrRow = { status: string; payment_method?: string | null; discount_amount?: number; services?: unknown };
  const breakdown: PaymentBreakdown = { cash: 0, card: 0, transfer: 0, unrecorded: 0 };
  for (const a of completed as CurrRow[]) {
    const net = price(a as AptRow) - (a.discount_amount ?? 0);
    const key = (a.payment_method ?? "unrecorded") as keyof PaymentBreakdown;
    breakdown[key] = (breakdown[key] ?? 0) + net;
  }

  return {
    revenue, prevRevenue, totalApts, completedApts, cancelledApts,
    newCustomers, cancelledRevenue, topServices, topCustomers, revenueByMonth,
    staffCommissions, paymentBreakdown: breakdown,
  };
}

// ── SVG bar chart ───────────────────────────────────────────────────────────

function RevenueBars({ data }: { data: { label: string; value: number }[] }) {
  const W = 720, H = 240, PAD_L = 56, PAD_R = 16, PAD_T = 16, PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const max = Math.max(...data.map((d) => d.value), 1); // floor at 1 to avoid /0
  const niceMax = Math.max(Math.ceil(max / 50000) * 50000, 50000);
  const barW = innerW / data.length - 18;

  return (
    <svg className="rep-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = PAD_T + innerH * (1 - t);
        const value = Math.round(niceMax * t);
        return (
          <g key={t}>
            <line className="axis-line" x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} />
            <text className="axis-label" x={PAD_L - 8} y={y + 4} textAnchor="end">
              {value === 0 ? "0" : `${Math.round(value / 1000)}K`}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const slot = innerW / data.length;
        const x = PAD_L + slot * i + (slot - barW) / 2;
        const h = (d.value / niceMax) * innerH;
        const y = PAD_T + innerH - h;
        return (
          <g key={d.label}>
            <rect className="bar" x={x} y={y} width={barW} height={Math.max(h, 0)} rx={6} />
            {d.value > 0 && (
              <text className="value-label" x={x + barW / 2} y={y - 6} textAnchor="middle">
                {Math.round(d.value / 1000)}K
              </text>
            )}
            <text className="axis-label" x={x + barW / 2} y={H - 10} textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

const RANGE_LABEL: Record<RangeKey, string> = {
  month:   "This month",
  quarter: "Last 3 months",
  year:    "This year",
};

const TREND_META: Record<RangeKey, string> = {
  month:   "Week by week · this month · LKR",
  quarter: "Month by month · last 3 months · LKR",
  year:    "Month by month · this year · LKR",
};

export default function ReportsPage() {
  const [range, setRange]   = useState<RangeKey>("month");
  const [data, setData]     = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchReports(range).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [range]);

  const revenueDelta =
    data && data.prevRevenue > 0
      ? Math.round(((data.revenue - data.prevRevenue) / data.prevRevenue) * 100)
      : null;

  const hasRevenueTrend = data?.revenueByMonth.some((m) => m.value > 0) ?? false;
  const cancellationRate =
    data && data.totalApts > 0
      ? Math.round((data.cancelledApts / data.totalApts) * 100)
      : 0;

  return (
    <div className="page-app page-reports">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">Numbers, told quietly</div>
              <h1 className="page-title">Reports</h1>
              <p className="page-sub">
                Revenue, retention, and the story of how your salon is running —
                updated every time you mark an appointment complete.
              </p>
            </div>
            <div className="header-actions">
              <div className="seg-toggle">
                {(["month", "quarter", "year"] as RangeKey[]).map((r) => (
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
            </div>
          </div>
        </div>

        {/* ── Stat band ── */}
        <div className="stat-band">
          <div className="stat">
            <div className="stat-label">{RANGE_LABEL[range]} · Revenue</div>
            <div className="stat-value">
              {loading ? "—" : data!.revenue > 0 ? lkr(data!.revenue) : "—"}
            </div>
            <div className="stat-meta">
              {loading ? (
                "Loading…"
              ) : revenueDelta !== null ? (
                <>
                  <span className={revenueDelta >= 0 ? "delta-up" : "delta-down"}>
                    {revenueDelta >= 0 ? "↑" : "↓"} {Math.abs(revenueDelta)}%
                  </span>{" "}
                  vs previous period
                </>
              ) : data!.revenue === 0 ? (
                "No completed appointments yet"
              ) : (
                "No previous period to compare"
              )}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">Appointments</div>
            <div className="stat-value">{loading ? "—" : data!.totalApts}</div>
            <div className="stat-meta">
              {loading
                ? "Loading…"
                : `${data!.completedApts} completed · ${data!.cancelledApts} cancelled`}
            </div>
          </div>

          <div className="stat">
            <div className="stat-label">New customers</div>
            <div className="stat-value">{loading ? "—" : data!.newCustomers}</div>
            <div className="stat-meta">
              {loading
                ? "Loading…"
                : data!.newCustomers === 0
                ? "No first-time customers this period"
                : `First visit${data!.newCustomers !== 1 ? "s" : ""} this period`}
            </div>
          </div>
        </div>

        {/* ── Revenue trend chart ── */}
        <div className="rep-card">
          <div className="rep-card-head">
            <div className="rep-card-title">Revenue trend</div>
            <div className="rep-card-meta">{TREND_META[range]}</div>
          </div>
          {loading ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-400)", fontSize: 13 }}>
              Loading…
            </div>
          ) : !hasRevenueTrend ? (
            <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-400)", fontSize: 13 }}>
              No completed appointments yet — mark appointments done to see revenue here.
            </div>
          ) : (
            <RevenueBars data={data!.revenueByMonth} />
          )}
        </div>

        {/* ── Top services + top customers ── */}
        <div className="rep-grid">
          <div className="rep-card">
            <div className="rep-card-head">
              <div className="rep-card-title">Top services</div>
              <div className="rep-card-meta">By revenue · {RANGE_LABEL[range].toLowerCase()}</div>
            </div>

            {loading ? (
              <div style={emptyStyle}>Loading…</div>
            ) : data!.topServices.length === 0 ? (
              <div style={emptyStyle}>No completed appointments this period.</div>
            ) : (
              <div className="rep-top-list">
                {(() => {
                  const max = Math.max(...data!.topServices.map((s) => s.revenue), 1);
                  return data!.topServices.map((s) => (
                    <div className="rep-top-item" key={s.name}>
                      <div style={{ flex: 1 }}>
                        <div className="rep-top-name">{s.name}</div>
                        <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 8 }}>
                          {s.bookings} booking{s.bookings !== 1 ? "s" : ""}
                        </div>
                        <div className="rep-top-bar-wrap">
                          <div
                            className="rep-top-bar"
                            style={{ width: `${Math.round((s.revenue / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="rep-top-value">{lkr(s.revenue)}</div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          <div className="rep-card">
            <div className="rep-card-head">
              <div className="rep-card-title">Top customers</div>
              <div className="rep-card-meta">By spend · {RANGE_LABEL[range].toLowerCase()}</div>
            </div>

            {loading ? (
              <div style={emptyStyle}>Loading…</div>
            ) : data!.topCustomers.length === 0 ? (
              <div style={emptyStyle}>No completed appointments this period.</div>
            ) : (
              <div className="rep-top-list">
                {data!.topCustomers.map((c) => (
                  <div className="rep-top-item" key={c.id}>
                    <div style={{ flex: 1 }}>
                      <div className="rep-top-name">
                        <Link
                          href={`/customers/${c.id}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {c.name}
                        </Link>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        {c.visits} visit{c.visits !== 1 ? "s" : ""} this period
                      </div>
                    </div>
                    <div className="rep-top-value">{lkr(c.spend)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Payment breakdown ── */}
        {!loading && data && data.completedApts > 0 && (
          <div className="rep-card" style={{ marginBottom: 32 }}>
            <div className="rep-card-head">
              <div className="rep-card-title">Payment methods</div>
              <div className="rep-card-meta">Completed appointments · net of discounts</div>
            </div>
            <div style={{ display: "flex", gap: 0 }}>
              {(["cash", "card", "transfer", "unrecorded"] as const).map((key) => {
                const labels: Record<string, string> = {
                  cash: "Cash", card: "Card", transfer: "Transfer", unrecorded: "Unrecorded",
                };
                const val = data.paymentBreakdown[key];
                if (val <= 0 && key !== "unrecorded") return null;
                return (
                  <div
                    key={key}
                    style={{
                      flex: 1,
                      padding: "18px 20px",
                      borderRight: key !== "unrecorded" ? "1px solid var(--ink-100)" : "none",
                    }}
                  >
                    <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-400)", marginBottom: 6 }}>
                      {labels[key]}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: val > 0 ? "var(--ink-900)" : "var(--ink-300)" }}>
                      {val > 0 ? lkr(Math.round(val)) : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Staff commissions ── */}
        {!loading && data && data.staffCommissions.length > 0 && (
          <div className="rep-card" style={{ marginBottom: 32 }}>
            <div className="rep-card-head">
              <div className="rep-card-title">Staff commissions</div>
              <div className="rep-card-meta">Owed for completed appointments · {RANGE_LABEL[range].toLowerCase()}</div>
            </div>
            <div className="rep-top-list">
              {data.staffCommissions.map((s) => (
                <div className="rep-top-item" key={s.id}>
                  <div style={{ flex: 1 }}>
                    <div className="rep-top-name">{s.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                      {s.bookings} appointment{s.bookings !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="rep-top-value">{lkr(Math.round(s.commission))}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Cancellations summary ── */}
        {!loading && data && (
          <div className="rep-prevented">
            <div className="rep-prevented-body">
              <div className="rep-prevented-eyebrow">
                {data.cancelledApts === 0
                  ? "No cancellations"
                  : `${data.cancelledApts} cancellation${data.cancelledApts !== 1 ? "s" : ""} this period`}
              </div>
              <div className="rep-prevented-title">
                {data.cancelledApts === 0 ? (
                  <>Every appointment <em>showed up</em>.</>
                ) : (
                  <>
                    {cancellationRate}% cancellation rate —
                    {cancellationRate <= 10 ? (
                      <> well within the industry average.</>
                    ) : (
                      <> worth keeping an eye on.</>
                    )}
                  </>
                )}
              </div>
              <div className="rep-prevented-sub">
                {data.cancelledApts === 0
                  ? `${data.completedApts} completed appointment${data.completedApts !== 1 ? "s" : ""} this period — a clean run.`
                  : `${data.cancelledRevenue > 0 ? `${lkr(data.cancelledRevenue)} in missed revenue. ` : ""}Turn on reminders in Settings to reduce future cancellations.`}
              </div>
            </div>
            {data.cancelledRevenue > 0 && (
              <div className="rep-prevented-amount">
                <span className="rep-prevented-amount-currency">LKR</span>
                {data.cancelledRevenue.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </main>

      <MobileTabBar active="more" />
    </div>
  );
}

const emptyStyle: React.CSSProperties = {
  padding: "32px 0",
  textAlign: "center",
  color: "var(--ink-400)",
  fontSize: 13,
};
