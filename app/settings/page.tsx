"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import Toast, { type ToastTone } from "@/components/Toast";
import { humanError, slugify } from "@/lib/data";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────

type DayKey =
  | "monday" | "tuesday" | "wednesday" | "thursday"
  | "friday" | "saturday" | "sunday";

type Hours = { open: string; close: string; on: boolean };

type SalonProfile = {
  name: string;
  tagline: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  bookingSlug: string;
};

type ReminderKey = "confirmation" | "day" | "miss" | "birthday";

const EMPTY_SALON: SalonProfile = {
  name: "",
  tagline: "",
  phone: "",
  whatsapp: "",
  address: "",
  city: "",
  bookingSlug: "",
};

const DEFAULT_HOURS: Record<DayKey, Hours> = {
  monday:    { open: "09:00", close: "19:00", on: true  },
  tuesday:   { open: "09:00", close: "19:00", on: true  },
  wednesday: { open: "09:00", close: "19:00", on: true  },
  thursday:  { open: "09:00", close: "19:00", on: true  },
  friday:    { open: "09:00", close: "20:00", on: true  },
  saturday:  { open: "09:00", close: "20:00", on: true  },
  sunday:    { open: "",      close: "",       on: false },
};

const DEFAULT_REMINDERS: Record<ReminderKey, boolean> = {
  confirmation: true,
  day:          true,
  miss:         true,
  birthday:     false,
};

const dayOrder: { key: DayKey; label: string }[] = [
  { key: "monday",    label: "Monday"    },
  { key: "tuesday",   label: "Tuesday"   },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday",  label: "Thursday"  },
  { key: "friday",    label: "Friday"    },
  { key: "saturday",  label: "Saturday"  },
  { key: "sunday",    label: "Sunday"    },
];

const reminderCards: { key: ReminderKey; title: string; desc: string }[] = [
  { key: "confirmation", title: "Booking confirmation", desc: "Sent the moment a customer books online. Includes appointment time and salon location." },
  { key: "day",          title: "24-hour reminder",     desc: "A friendly reminder the day before. Reduces no-shows by 60%." },
  { key: "miss",         title: `"We miss you" message`,desc: "Sent to customers we haven't seen in 8 weeks. Quiet, never pushy." },
  { key: "birthday",     title: "Birthday wish",        desc: "A simple birthday message on the morning of." },
];

const tabs = [
  { id: "salon",    label: "Salon profile"  },
  { id: "hours",    label: "Opening hours"  },
  { id: "reminders",label: "Reminders"      },
  { id: "account",  label: "Your account"   },
];

function countDirtyFields<T extends Record<string, unknown>>(
  current: T,
  saved: T,
): number {
  return (Object.keys(saved) as (keyof T)[]).filter(
    (k) => current[k] !== saved[k],
  ).length;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("salon");
  const [toast,     setToast]     = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<ToastTone>("info");
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  const showError   = (msg: string) => { setToastTone("error"); setToast(msg); };
  const showSuccess = (msg: string) => { setToastTone("success"); setToast(msg); };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Identity (read-only — sourced from auth + salon_users)
  const [accountEmail, setAccountEmail]   = useState<string>("");
  const [ownerName, setOwnerName]         = useState<string>("");
  const [salonId, setSalonId]             = useState<string | null>(null);

  // Editable state
  const [salon, setSalon]         = useState<SalonProfile>(EMPTY_SALON);
  const [hours, setHours]         = useState<Record<DayKey, Hours>>(DEFAULT_HOURS);
  const [reminders, setReminders] = useState<Record<ReminderKey, boolean>>(DEFAULT_REMINDERS);

  // Last-saved (for dirty diff + discard)
  const [savedSalon, setSavedSalon]         = useState<SalonProfile>(EMPTY_SALON);
  const [savedHours, setSavedHours]         = useState<Record<DayKey, Hours>>(DEFAULT_HOURS);
  const [savedReminders, setSavedReminders] = useState<Record<ReminderKey, boolean>>(DEFAULT_REMINDERS);

  // ── Load the current salon on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      if (!cancelled) setAccountEmail(user.email ?? "");

      // Step 1 — simple query, no join, guaranteed to work if salon_users row exists
      const { data: linkRow } = await supabase
        .from("salon_users")
        .select("full_name, salon_id")
        .eq("user_id", user.id)
        .single();

      if (cancelled || !linkRow) { setLoading(false); return; }

      const sid      = (linkRow as { salon_id?: string }).salon_id ?? null;
      const fullName = (linkRow as { full_name?: string }).full_name ?? "";
      setOwnerName(fullName);
      setSalonId(sid);

      if (!sid) { setLoading(false); return; }

      // Step 2 — fetch salon profile separately. Try with opening_hours first;
      // if that fails (column missing on older DBs), retry without and surface
      // a banner so the user knows to run the migration.
      let { data: s, error: salonErr } = await supabase
        .from("salons")
        .select("name, tagline, phone, whatsapp, address, city, booking_slug, opening_hours")
        .eq("id", sid)
        .single();

      if (salonErr && (salonErr.code === "42703" || salonErr.message?.includes("opening_hours"))) {
        console.warn("[settings] opening_hours column missing — falling back", salonErr);
        if (!cancelled) {
          setSchemaWarning(
            "Your database is missing the opening_hours column. " +
            "Run db/opening_hours.sql in your Supabase SQL Editor to enable opening hours."
          );
        }
        ({ data: s, error: salonErr } = await supabase
          .from("salons")
          .select("name, tagline, phone, whatsapp, address, city, booking_slug")
          .eq("id", sid)
          .single());
      }

      if (salonErr) {
        console.error("[settings] could not load salon profile:", salonErr);
        if (!cancelled) showError(humanError(salonErr, "We couldn't load your salon details."));
      }

      if (!cancelled && s) {
        const r = s as Record<string, unknown>;
        const profile: SalonProfile = {
          name:        (r.name        as string) ?? "",
          tagline:     (r.tagline     as string) ?? "",
          phone:       (r.phone       as string) ?? "",
          whatsapp:    (r.whatsapp    as string) ?? "",
          address:     (r.address     as string) ?? "",
          city:        (r.city        as string) ?? "",
          bookingSlug: (r.booking_slug as string) ?? "",
        };
        setSalon(profile);
        setSavedSalon(profile);

        const oh = r.opening_hours as Record<string, unknown> | null;
        if (oh && Object.keys(oh).length > 0) {
          const loaded = oh as Record<DayKey, Hours>;
          setHours(loaded);
          setSavedHours(loaded);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Count changed fields across all sections
  const dirtyCount =
    countDirtyFields(salon, savedSalon) +
    (JSON.stringify(hours) !== JSON.stringify(savedHours) ? 1 : 0) +
    (JSON.stringify(reminders) !== JSON.stringify(savedReminders) ? 1 : 0);

  const save = async () => {
    if (saving) return;
    if (!salonId) {
      showError("We couldn't find your salon — please refresh the page and try again.");
      return;
    }

    // ── Per-field validation (NOT NULL columns in the DB) ──
    const cleanName    = salon.name.trim();
    const cleanTagline = salon.tagline.trim();
    const cleanPhone   = salon.phone.trim();
    const cleanWhats   = salon.whatsapp.trim();
    const cleanAddr    = salon.address.trim();
    const cleanCity    = salon.city.trim();

    if (!cleanName) {
      showError("Your salon needs a name before you can save.");
      return;
    }

    // booking_slug is NOT NULL UNIQUE in the DB. Auto-generate it from the
    // salon name if the user left the field blank — much friendlier than
    // failing with a NOT NULL violation.
    let cleanSlug = slugify(salon.bookingSlug);
    if (!cleanSlug) cleanSlug = slugify(cleanName);
    if (!cleanSlug) {
      showError("Add a booking link slug or use letters in your salon name (we use it to make a link).");
      return;
    }
    // Reflect the cleaned slug back to the UI so the user sees what we're saving
    if (cleanSlug !== salon.bookingSlug) {
      setSalon((s) => ({ ...s, bookingSlug: cleanSlug }));
    }

    setSaving(true);

    const fullPayload = {
      name:          cleanName,
      tagline:       cleanTagline || null,
      phone:         cleanPhone   || null,
      whatsapp:      cleanWhats   || null,
      address:       cleanAddr    || null,
      city:          cleanCity    || null,
      booking_slug:  cleanSlug,
      opening_hours: hours,
    };

    let { data: updated, error } = await supabase
      .from("salons")
      .update(fullPayload)
      .eq("id", salonId)
      .select("id");

    // If opening_hours column is missing, retry without it so other settings
    // can still be saved, and surface a banner about the migration.
    if (error?.code === "42703" || error?.message?.includes("opening_hours")) {
      console.warn("[settings save] opening_hours column missing — retrying without", error);
      setSchemaWarning(
        "Your database is missing the opening_hours column. " +
        "Run db/opening_hours.sql in your Supabase SQL Editor to enable opening hours."
      );
      const { opening_hours, ...partialPayload } = fullPayload;
      void opening_hours;
      ({ data: updated, error } = await supabase
        .from("salons")
        .update(partialPayload)
        .eq("id", salonId)
        .select("id"));
    }

    setSaving(false);

    // ── Specific error handling, in priority order ────────────────────────

    // 1) Unique constraint on booking_slug → the slug is taken
    if (error?.code === "23505" || error?.message?.toLowerCase().includes("duplicate key")) {
      console.error("[settings save] duplicate slug:", error);
      showError(
        `The booking link "${cleanSlug}" is already taken by another salon. ` +
        "Try a different one (e.g. add your city or a number)."
      );
      return;
    }

    // 2) Permission error OR 0 rows updated → the UPDATE RLS policy is missing
    const noPermission =
      error?.code === "42501" ||
      error?.message?.toLowerCase().includes("permission") ||
      error?.message?.toLowerCase().includes("policy");
    const noRowsUpdated = !error && (!updated || updated.length === 0);

    if (noPermission || noRowsUpdated) {
      console.error("[settings save] RLS / 0-row failure:", error, "updated:", updated);
      showError(
        "Your database is missing a one-time update — saves won't work until you run it. " +
        "Open db/salons_update_policy.sql in your project and paste it into Supabase → SQL Editor."
      );
      return;
    }

    // 3) Any other error — log the FULL error so we can see code, message,
    // details, and hint in the browser console for debugging
    if (error) {
      console.error("[settings save] FAILED", {
        code:    error.code,
        message: error.message,
        details: error.details,
        hint:    error.hint,
        full:    error,
      });
      showError(humanError(error, "We couldn't save those changes. Please try again in a moment."));
      return;
    }

    // ── Success ───────────────────────────────────────────────────────────
    const savedProfile = {
      ...salon,
      name:        cleanName,
      tagline:     cleanTagline,
      phone:       cleanPhone,
      whatsapp:    cleanWhats,
      address:     cleanAddr,
      city:        cleanCity,
      bookingSlug: cleanSlug,
    };
    setSalon(savedProfile);
    setSavedSalon(savedProfile);
    setSavedHours(hours);
    setSavedReminders(reminders);
    showSuccess("Changes saved");
  };

  const discard = () => {
    setSalon(savedSalon);
    setHours(savedHours);
    setReminders(savedReminders);
  };

  const toggleDay = (key: DayKey) =>
    setHours((h) => ({ ...h, [key]: { ...h[key], on: !h[key].on } }));

  const toggleReminder = (key: ReminderKey) =>
    setReminders((r) => ({ ...r, [key]: !r[key] }));

  const logoChar = salon.name?.[0]?.toUpperCase() ?? "—";

  if (loading) {
    return (
      <div className="page-app page-settings">
        <Sidebar />
        <MobileTopBar />
        <main className="main">
          <div style={{ padding: "64px 0", textAlign: "center", color: "var(--ink-400)", fontSize: 14 }}>
            Loading your settings…
          </div>
        </main>
        <MobileTabBar />
      </div>
    );
  }

  return (
    <div className="page-app page-settings">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <header className="page-header">
          <div className="eyebrow">Setup</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">
            The quiet decisions that shape how your salon runs. Change anything
            — we&rsquo;ll remember it.
          </p>
        </header>

        {schemaWarning && (
          <div style={{
            marginBottom: 24,
            padding: "14px 18px",
            background: "#FFF4E5",
            border: "1px solid #F4C77A",
            borderRadius: 12,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A55A00" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#7A4400", marginBottom: 2 }}>
                One-time database update needed
              </div>
              <div style={{ fontSize: 13, color: "#7A4400", lineHeight: 1.5 }}>
                {schemaWarning}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSchemaWarning(null)}
              aria-label="Dismiss"
              style={{ background: "none", border: "none", color: "#7A4400", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
            >
              ×
            </button>
          </div>
        )}

        <div className="settings-layout">
          <nav className="tabs-nav">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={`#${tab.id}`}
                className={`tab-link${activeTab === tab.id ? " active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </a>
            ))}
          </nav>

          <div className="settings-content">

            {/* ── Salon profile ── */}
            <section className="section" id="salon">
              <div className="section-head">
                <h2 className="section-title">Salon profile</h2>
                <p className="section-tag">
                  How your salon appears to customers on your booking page.
                </p>
              </div>

              <div className="logo-row">
                <div className="logo-preview">{logoChar}</div>
                <div className="logo-meta">
                  <div className="logo-name">{salon.name || "Your salon"}</div>
                  <div className="logo-hint">
                    Logo upload coming soon. Your salon&rsquo;s initial is used until then.
                  </div>
                </div>
              </div>

              <div className="field-grid">
                <div className="field field-full">
                  <label>Salon name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. Pastel 93"
                    value={salon.name}
                    onChange={(e) => setSalon({ ...salon, name: e.target.value })}
                  />
                  {!salon.name.trim() && (
                    <div className="field-hint" style={{ color: "#A53A2C" }}>
                      Required — your salon needs a name to be saved.
                    </div>
                  )}
                </div>
                <div className="field field-full">
                  <label>Tagline</label>
                  <input
                    className="input"
                    type="text"
                    value={salon.tagline}
                    onChange={(e) => setSalon({ ...salon, tagline: e.target.value })}
                  />
                  <div className="field-hint">
                    Shown beneath your salon name on the booking page.
                  </div>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input
                    className="input"
                    type="text"
                    value={salon.phone}
                    onChange={(e) => setSalon({ ...salon, phone: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>WhatsApp</label>
                  <input
                    className="input"
                    type="text"
                    value={salon.whatsapp}
                    onChange={(e) => setSalon({ ...salon, whatsapp: e.target.value })}
                  />
                </div>
                <div className="field field-full">
                  <label>Address</label>
                  <input
                    className="input"
                    type="text"
                    value={salon.address}
                    onChange={(e) => setSalon({ ...salon, address: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <input
                    className="input"
                    type="text"
                    value={salon.city}
                    onChange={(e) => setSalon({ ...salon, city: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Booking page link</label>
                  <input
                    className="input"
                    type="text"
                    placeholder={salon.name ? slugify(salon.name) || "your-salon" : "your-salon"}
                    value={salon.bookingSlug}
                    onChange={(e) => setSalon({ ...salon, bookingSlug: e.target.value })}
                    onBlur={(e) => setSalon({ ...salon, bookingSlug: slugify(e.target.value) })}
                  />
                  <div className="field-hint">
                    {salon.bookingSlug ? (
                      <>Your link: <code>/book/{slugify(salon.bookingSlug)}</code></>
                    ) : (
                      <>Leave blank and we&rsquo;ll make one from your salon name. Only letters, numbers and hyphens.</>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ── Opening hours ── */}
            <section className="section" id="hours">
              <div className="section-head">
                <h2 className="section-title">Opening hours</h2>
                <p className="section-tag">
                  When customers can book with you. We&rsquo;ll never let them
                  book outside these hours.
                </p>
              </div>

              <div className="hours-list">
                {dayOrder.map(({ key, label }) => {
                  const day = hours[key];
                  return (
                    <div className={`hours-row${day.on ? "" : " closed"}`} key={key}>
                      <div className="hours-day">{label}</div>
                      <input
                        className="time-input"
                        type="time"
                        value={day.open}
                        disabled={!day.on}
                        onChange={(e) =>
                          setHours((h) => ({ ...h, [key]: { ...h[key], open: e.target.value } }))
                        }
                      />
                      <input
                        className="time-input"
                        type="time"
                        value={day.close}
                        disabled={!day.on}
                        onChange={(e) =>
                          setHours((h) => ({ ...h, [key]: { ...h[key], close: e.target.value } }))
                        }
                      />
                      <div
                        role="switch"
                        aria-checked={day.on}
                        tabIndex={0}
                        className={`toggle${day.on ? " on" : ""}`}
                        onClick={() => toggleDay(key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleDay(key);
                          }
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Reminders ── */}
            <section className="section" id="reminders">
              <div className="section-head">
                <h2 className="section-title">Reminders</h2>
                <p className="section-tag">
                  Which messages we&rsquo;ll send on your behalf once the
                  delivery integration is connected.
                </p>
              </div>

              {reminderCards.map((card) => (
                <div className="reminder-card" key={card.key}>
                  <div className="reminder-head">
                    <div className="reminder-title">{card.title}</div>
                    <div
                      role="switch"
                      aria-checked={reminders[card.key]}
                      tabIndex={0}
                      className={`toggle${reminders[card.key] ? " on" : ""}`}
                      onClick={() => toggleReminder(card.key)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleReminder(card.key);
                        }
                      }}
                    />
                  </div>
                  <div className="reminder-desc">{card.desc}</div>
                </div>
              ))}
            </section>

            {/* ── Your account ── */}
            <section className="section" id="account">
              <div className="section-head">
                <h2 className="section-title">Your account</h2>
                <p className="section-tag">
                  Your personal details. Only you see these.
                </p>
              </div>

              <div className="field-grid">
                <div className="field">
                  <label>Your name</label>
                  <input
                    className="input"
                    type="text"
                    value={ownerName}
                    disabled
                    readOnly
                  />
                  <div className="field-hint">Edit in your profile (coming soon).</div>
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    className="input"
                    type="email"
                    value={accountEmail}
                    disabled
                    readOnly
                  />
                  <div className="field-hint">Sign-in email — change via support.</div>
                </div>
                <div className="field field-full">
                  <label>Password</label>
                  <div style={{ fontSize: 13, color: "var(--ink-500)", padding: "10px 0" }}>
                    To change your password, sign out and use{" "}
                    <Link href="/login" style={{ color: "var(--plum-700)" }}>
                      &ldquo;Forgot password?&rdquo;
                    </Link>{" "}
                    on the login screen.
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 32,
                  paddingTop: 24,
                  borderTop: "1px solid var(--ink-100)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: 18,
                      color: "var(--plum-900)",
                      fontWeight: 500,
                      marginBottom: 4,
                    }}
                  >
                    Close your account
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
                    Cancel your subscription and remove your data. This cannot
                    be undone.
                  </div>
                </div>
                <button type="button" className="btn btn-danger">
                  Close account
                </button>
              </div>
            </section>

            {/* ── Save bar ── */}
            <div className="save-bar">
              <div className="save-bar-text">
                {!salon.name.trim()
                  ? <span style={{ color: "#A53A2C" }}>Your salon needs a name before you can save</span>
                  : dirtyCount > 0
                    ? `${dirtyCount} unsaved change${dirtyCount !== 1 ? "s" : ""}`
                    : "All changes saved"}
              </div>
              <div className="save-bar-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={discard}
                  disabled={dirtyCount === 0 || saving}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={dirtyCount === 0 || saving || !salon.name.trim()}
                  title={!salon.name.trim() ? "Add a salon name first" : undefined}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>

      <MobileTabBar />
      <Toast message={toast} tone={toastTone} onDone={() => setToast(null)} />
    </div>
  );
}
