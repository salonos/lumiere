"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import AppointmentFormModal from "@/components/AppointmentFormModal";
import { appointmentBase, addonTotalsByAppointment } from "@/lib/data";
import { supabase } from "@/lib/supabase";

// ── helpers ────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatLongDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d} ${months[mo - 1]} ${y}`;
}

function timeAgo(iso: string): string {
  const date = new Date(iso.slice(0, 10));
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

function formatLkr(amount: number): string {
  return `LKR ${amount.toLocaleString()}`;
}

function formatMonthYear(iso: string): string {
  const [y, mo] = iso.slice(0, 7).split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[mo - 1]} ${y}`;
}

// ── types ──────────────────────────────────────────────────────────────────

type DbCustomer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  visits?: number;
  total_spend?: number;
  created_at?: string;
};

type DbAppointment = {
  id: number | string;
  date?: string;
  time?: string;
  status?: string;
  notes?: string;
  payment_method?: string | null;
  discount_amount?: number;
  quantity?: number | null;
  variant_price?: number | null;
  variant_name?: string | null;
  services?: { name?: string; price?: number; duration?: number } | null;
  staff?: { name?: string } | null;
};

// ── component ──────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const params = useParams();
  const slug = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<DbCustomer | null>(null);
  const [history, setHistory] = useState<DbAppointment[]>([]);
  const [addonMap, setAddonMap] = useState<Map<number, number>>(new Map());
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  const fetchData = async () => {
    if (!slug) return;

    // id IS the slug — it's the text primary key
    const { data: cust } = await supabase
      .from("customers")
      .select("*")
      .eq("id", slug)
      .maybeSingle();

    if (!cust) {
      setLoading(false);
      return;
    }

    setCustomer(cust as DbCustomer);
    setNotes((cust as DbCustomer).notes ?? "");

    const { data: hist } = await supabase
      .from("appointments")
      .select("*, services(*), staff(name)")
      .eq("customer_id", cust.id)
      .neq("status", "cancelled")
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(10);

    const histRows = (hist ?? []) as DbAppointment[];
    setHistory(histRows);

    // Add-on charges for these visits, so per-visit totals match what was paid
    const ids = histRows.map((h) => Number(h.id)).filter((n) => !Number.isNaN(n));
    if (ids.length > 0) {
      const { data: addonRows } = await supabase
        .from("appointment_addons")
        .select("appointment_id, price, quantity")
        .in("appointment_id", ids);
      setAddonMap(addonTotalsByAppointment(addonRows));
    } else {
      setAddonMap(new Map());
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const saveNotes = async () => {
    if (!customer) return;
    setNotesSaving(true);
    await supabase.from("customers").update({ notes }).eq("id", customer.id);
    setNotesSaving(false);
    setNotesDirty(false);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2500);
  };

  const openWhatsApp = () => {
    if (!customer?.phone) return;
    window.open(`https://wa.me/${customer.phone.replace(/\D/g, "")}`, "_blank");
  };

  // ── derived display values ───────────────────────────────────────────────

  const customerName = customer?.name ?? "";
  const initials = customerName ? getInitials(customerName) : "—";
  const visits: number = customer?.visits ?? 0;
  const totalSpend: number = customer?.total_spend ?? 0;
  const tags: string[] = Array.isArray(customer?.tags) ? (customer!.tags as string[]) : [];

  const mostRecentApt = history[0];
  const lastVisitDisplay = mostRecentApt?.date ? timeAgo(mostRecentApt.date) : "—";
  const lastVisitDate = mostRecentApt?.date ? formatLongDate(mostRecentApt.date) : "";
  const usualService = mostRecentApt?.services?.name ?? "—";

  const customerSince = customer?.created_at
    ? formatMonthYear(customer.created_at)
    : "";

  // ── render ───────────────────────────────────────────────────────────────

  if (!loading && !customer) {
    return (
      <div className="page-app page-customer">
        <Sidebar />
        <MobileTopBar />
        <main className="main">
          <div className="breadcrumb">
            <Link href="/customers">Customers</Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">Not found</span>
          </div>
          <p style={{ padding: "48px 0", opacity: 0.5 }}>Customer not found.</p>
        </main>
        <MobileTabBar active="customers" />
      </div>
    );
  }

  return (
    <div className="page-app page-customer">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="breadcrumb">
          <Link href="/customers">Customers</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">
            {loading ? "Loading…" : customerName}
          </span>
        </div>

        <section className="profile-header">
          <div className="header-content">
            <div className="header-top">
              <div className="profile-avatar">{initials}</div>
              <div className="profile-info">
                {customerSince && (
                  <div className="profile-eyebrow">Customer since {customerSince}</div>
                )}
                <h1 className="profile-name">
                  {loading ? "Loading…" : customerName}
                </h1>
                <div className="profile-tags">
                  {visits > 1 && (
                    <span className="chip chip-plum">Regular · {visits} visits</span>
                  )}
                  {tags.includes("VIP") && (
                    <span className="chip chip-champagne">VIP</span>
                  )}
                  {tags.includes("Sensitive / Allergic") && (
                    <span className="chip chip-pink">Sensitive / Allergic</span>
                  )}
                </div>
              </div>
              <div className="profile-actions">
                {/* Call button — links to tel: */}
                <a
                  href={customer?.phone ? `tel:${customer.phone}` : undefined}
                  className="btn btn-icon"
                  aria-label="Call"
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </a>

                {/* Message button — opens WhatsApp */}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={openWhatsApp}
                  disabled={!customer?.phone}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  Message
                </button>

                {/* Book again — opens appointment modal pre-filled with this customer */}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setBookOpen(true)}
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
                  Book again
                </button>
              </div>
            </div>

            <div className="quick-stats">
              <div className="quick-stat">
                <div className="quick-stat-label">Total visits</div>
                <div className="quick-stat-value">{loading ? "—" : visits}</div>
                {customerSince && (
                  <div className="quick-stat-sub">Since {customerSince}</div>
                )}
              </div>
              <div className="quick-stat">
                <div className="quick-stat-label">Lifetime value</div>
                <div className="quick-stat-value">
                  {loading ? "—" : formatLkr(totalSpend)}
                </div>
                {visits > 0 && totalSpend > 0 && (
                  <div className="quick-stat-sub">
                    Avg {formatLkr(Math.round(totalSpend / visits))} / visit
                  </div>
                )}
              </div>
              <div className="quick-stat">
                <div className="quick-stat-label">Last visit</div>
                <div className="quick-stat-value">
                  {loading ? "—" : lastVisitDisplay}
                </div>
                {lastVisitDate && (
                  <div className="quick-stat-sub">{lastVisitDate}</div>
                )}
              </div>
              <div className="quick-stat">
                <div className="quick-stat-label">Usual service</div>
                <div className="quick-stat-value">
                  {loading ? "—" : usualService}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="content-grid">
          <div>
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">Visit history</h2>
                {visits > 0 && (
                  <span className="section-aside">{visits} total visits</span>
                )}
              </div>

              <div className="history-list">
                {loading ? (
                  <p style={{ opacity: 0.5, fontSize: 14 }}>Loading…</p>
                ) : history.length === 0 ? (
                  <p style={{ opacity: 0.5, fontSize: 14 }}>No visits yet.</p>
                ) : (
                  history.map((item) => {
                    const dateStr = item.date ? formatLongDate(item.date) : "Unknown date";
                    const agoStr = item.date ? timeAgo(item.date) : "";
                    const svcName = item.variant_name
                      ? `${item.services?.name ?? "Service"} · ${item.variant_name}`
                      : item.services?.name ?? "Service";
                    const gross = appointmentBase(item) + (addonMap.get(Number(item.id)) ?? 0);
                    const discount = item.discount_amount ?? 0;
                    const net = Math.max(0, gross - discount);
                    const staffName = item.staff?.name ?? null;
                    const PAYMENT_LABEL: Record<string, string> = {
                      cash: "Cash", card: "Card", transfer: "Bank transfer",
                    };
                    const payLabel = item.payment_method
                      ? PAYMENT_LABEL[item.payment_method] ?? item.payment_method
                      : null;

                    return (
                      <div className="history-item" key={String(item.id)}>
                        <div className="history-item-head">
                          <div className="history-date">{dateStr}</div>
                          <div className="history-ago">{agoStr}</div>
                        </div>
                        <div className="history-service">{svcName}</div>
                        {staffName && (
                          <div className="history-note" style={{ color: "var(--ink-500)" }}>
                            with {staffName}
                          </div>
                        )}
                        {item.notes ? (
                          <div className="history-note">{item.notes}</div>
                        ) : null}
                        <div className="history-meta">
                          {gross > 0 && (
                            <div className="history-price">
                              {formatLkr(net)}
                              {discount > 0 && (
                                <span style={{ fontSize: 11, color: "var(--ink-400)", marginLeft: 5 }}>
                                  ({formatLkr(discount)} off)
                                </span>
                              )}
                            </div>
                          )}
                          {payLabel && (
                            <div style={{ fontSize: 11, color: "var(--ink-400)", letterSpacing: "0.02em" }}>
                              {payLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div>
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">
                  Notes{customerName ? ` about ${customerName.split(" ")[0]}` : ""}
                </h2>
              </div>
              <div className="notes-card">
                <textarea
                  className="notes-textarea"
                  rows={6}
                  placeholder="What should we remember?"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesDirty(true);
                    setNotesSaved(false);
                  }}
                />
                <div className="notes-meta">
                  <span>
                    {notesSaving
                      ? "Saving…"
                      : notesSaved
                      ? "Saved"
                      : notesDirty
                      ? "Unsaved changes"
                      : "Notes saved automatically"}
                  </span>
                  {notesDirty && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "5px 14px", fontSize: 12 }}
                      onClick={saveNotes}
                      disabled={notesSaving}
                    >
                      Save
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="section">
              <div className="contact-card">
                <div className="contact-eyebrow">
                  Reach {customerName ? customerName.split(" ")[0] : "customer"}
                </div>
                {customer?.phone && (
                  <div className="contact-row">
                    <svg className="contact-icon" viewBox="0 0 24 24">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                    <div className="contact-text">{customer.phone}</div>
                    <a href={`tel:${customer.phone}`} className="contact-action">
                      Call
                    </a>
                  </div>
                )}
                {customer?.phone && (
                  <div className="contact-row">
                    <svg className="contact-icon" viewBox="0 0 24 24">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                    <div className="contact-text">WhatsApp</div>
                    <a
                      href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`}
                      className="contact-action"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </div>
                )}
                {customer?.email && (
                  <div className="contact-row">
                    <svg className="contact-icon" viewBox="0 0 24 24">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <div className="contact-text">{customer.email}</div>
                    <a href={`mailto:${customer.email}`} className="contact-action">
                      Email
                    </a>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>

      <MobileTabBar active="customers" />

      <AppointmentFormModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        defaultCustomerId={customer?.id}
        onSave={() => {
          fetchData();
        }}
      />
    </div>
  );
}
