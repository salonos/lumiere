"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import CustomerFormModal from "@/components/CustomerFormModal";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabase";

type Filter = "all" | "regulars" | "new" | "quiet";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all",      label: "All customers" },
  { id: "regulars", label: "Regulars" },
  { id: "new",      label: "New this month" },
  { id: "quiet",    label: "Haven't seen in a while" },
];

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  visits: number;
  last_visit_date: string | null;
  total_spend: number;
  tags: string[] | null;
};

function initialsOf(name: string): string {
  return name.split(/\s+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function lkr(amount: number): string {
  return `LKR ${amount.toLocaleString()}`;
}

function timeAgo(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function avatarTone(visits: number): string {
  return visits >= 8 ? "tone-warm" : "";
}

// 8 weeks ago, expressed as a YYYY-MM-DD string (local timezone)
const EIGHT_WEEKS_AGO_ISO = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 56);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

function filterMatch(c: CustomerRow, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "regulars") return c.visits >= 6;
  if (filter === "new") return c.visits <= 1;
  // "Quiet" = has been here before, but not in the last 8 weeks
  if (filter === "quiet") {
    if (c.visits === 0) return false;
    if (!c.last_visit_date) return true; // came in but no visit logged yet
    return c.last_visit_date < EIGHT_WEEKS_AGO_ISO;
  }
  return true;
}

export default function CustomersListPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone, visits, last_visit_date, total_spend, tags")
      .order("name");
    setCustomers((data as CustomerRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers
      .filter((c) => filterMatch(c, filter))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q),
      );
  }, [customers, query, filter]);

  return (
    <div className="page-app page-customers-list">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">The people who return</div>
              <h1 className="page-title">Customers</h1>
              <p className="page-sub">
                Every face, every preference, every quiet detail — kept in one
                place, never lost.
              </p>

              {/* Avatar colour legend */}
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-500)" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "linear-gradient(135deg, var(--plum-700), var(--plum-500))", flexShrink: 0 }} />
                  Dark avatar — loyal customer (8+ visits)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-500)" }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--plum-50)", border: "1px solid var(--plum-200, #d4b8c7)", flexShrink: 0 }} />
                  Light avatar — newer or growing customer
                </span>
              </div>
            </div>
            <div className="header-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setFormOpen(true)}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add customer
              </button>
            </div>
          </div>
        </div>

        <div className="cust-toolbar">
          <div className="cust-search">
            <svg className="cust-search-icon" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              className="cust-search-input"
              placeholder="Search by name, phone, or note…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`filter-chip ${filter === f.id ? "active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="cust-list">
          {loading ? (
            <div
              style={{
                padding: "64px 28px",
                textAlign: "center",
                color: "var(--ink-500)",
                fontSize: 14,
              }}
            >
              Loading customers…
            </div>
          ) : visible.length === 0 ? (
            <div
              style={{
                padding: "64px 28px",
                textAlign: "center",
                color: "var(--ink-500)",
                fontSize: 14,
              }}
            >
              {customers.length === 0
                ? "No customers yet. Add your first one above."
                : "No customers match that search."}
            </div>
          ) : (
            visible.map((c) => (
              <Link key={c.id} href={`/customers/${c.id}`} className="cust-row">
                <div className={`cust-avatar ${avatarTone(c.visits)}`}>
                  {initialsOf(c.name)}
                </div>
                <div>
                  <div className="cust-name">{c.name}</div>
                  <div className="cust-sub">
                    {c.phone ?? "No phone on file"}
                    {c.tags && c.tags.length > 0 ? (
                      <> · {c.tags.slice(0, 2).join(" · ")}</>
                    ) : null}
                  </div>
                </div>
                <div className="cust-col-hide-md">
                  <div className="cust-col-label">Last visit</div>
                  <div className="cust-col-value small">
                    {c.last_visit_date ? timeAgo(c.last_visit_date) : "—"}
                  </div>
                </div>
                <div>
                  <div className="cust-col-label">Visits</div>
                  <div className="cust-col-value">{c.visits}</div>
                </div>
                <div className="cust-col-hide-sm">
                  <div className="cust-col-label">Spend</div>
                  <div className="cust-col-value">{lkr(c.total_spend)}</div>
                </div>
                <div className="cust-chevron" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>
            ))
          )}
        </div>

        <div
          style={{
            marginTop: 20,
            fontSize: 12,
            color: "var(--ink-500)",
            letterSpacing: "0.04em",
          }}
        >
          Showing {visible.length} of {customers.length} customers
        </div>
      </main>

      <MobileTabBar active="customers" />

      <CustomerFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={({ name }) => {
          fetchCustomers();
          setToast(`${name} added`);
        }}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
