"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import Toast from "@/components/Toast";
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
  const [toast, setToast] = useState<string | null>(null);
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
      if (!user) {
        setLoading(false);
        return;
      }
      if (!cancelled) setAccountEmail(user.email ?? "");

      const { data: link } = await supabase
        .from("salon_users")
        .select("full_name, salon_id, salons(id, name, tagline, phone, whatsapp, address, city, booking_slug, opening_hours)")
        .eq("user_id", user.id)
        .single();

      if (cancelled || !link) {
        setLoading(false);
        return;
      }

      // Supabase typings represent the joined row as an array of one even though it's a single FK.
      // Cast through unknown so we can read the fields regardless of shape.
      const raw = link as unknown as {
        full_name?: string;
        salon_id?: string;
        salons?:
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null;
      };
      const fullName = raw.full_name ?? "";
      const s = Array.isArray(raw.salons) ? raw.salons[0] : raw.salons;

      setOwnerName(fullName);
      setSalonId(raw.salon_id ?? null);

      if (s) {
        const profile: SalonProfile = {
          name:        (s.name        as string) ?? "",
          tagline:     (s.tagline     as string) ?? "",
          phone:       (s.phone       as string) ?? "",
          whatsapp:    (s.whatsapp    as string) ?? "",
          address:     (s.address     as string) ?? "",
          city:        (s.city        as string) ?? "",
          bookingSlug: (s.booking_slug as string) ?? "",
        };
        setSalon(profile);
        setSavedSalon(profile);

        const oh = s.opening_hours as Record<string, unknown> | null;
        if (oh && Object.keys(oh).length > 0) {
          const loaded = oh as Record<DayKey, Hours>;
          setHours(loaded);
          setSavedHours(loaded);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Count changed fields across all sections
  const dirtyCount =
    countDirtyFields(salon, savedSalon) +
    (JSON.stringify(hours) !== JSON.stringify(savedHours) ? 1 : 0) +
    (JSON.stringify(reminders) !== JSON.stringify(savedReminders) ? 1 : 0);

  const save = async () => {
    if (saving || !salonId) return;
    setSaving(true);

    const { error } = await supabase
      .from("salons")
      .update({
        name:          salon.name,
        tagline:       salon.tagline || null,
        phone:         salon.phone || null,
        whatsapp:      salon.whatsapp || null,
        address:       salon.address || null,
        city:          salon.city || null,
        booking_slug:  salon.bookingSlug || null,
        opening_hours: hours,
      })
      .eq("id", salonId);

    setSaving(false);

    if (error) {
      setToast("Couldn't save — please try again");
      return;
    }

    setSavedSalon(salon);
    setSavedHours(hours);
    setSavedReminders(reminders);
    setToast("Changes saved");
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
                    value={salon.name}
                    onChange={(e) => setSalon({ ...salon, name: e.target.value })}
                  />
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
                  <label>Booking page slug</label>
                  <input
                    className="input"
                    type="text"
                    value={salon.bookingSlug}
                    onChange={(e) => setSalon({ ...salon, bookingSlug: e.target.value })}
                  />
                  {salon.bookingSlug && (
                    <div className="field-hint">
                      Your link: <code>/book/{salon.bookingSlug}</code>
                    </div>
                  )}
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
                {dirtyCount > 0
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
                  disabled={dirtyCount === 0 || saving}
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>

          </div>
        </div>
      </main>

      <MobileTabBar />
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
