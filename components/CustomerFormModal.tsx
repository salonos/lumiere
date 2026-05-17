"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { supabase } from "@/lib/supabase";

// ── birthday helpers ───────────────────────────────────────────────────────

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const DAYS = Array.from({ length: 31 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from(
  { length: CURRENT_YEAR - 1939 },
  (_, i) => String(CURRENT_YEAR - i),
);

type BDay = { day: string; month: string; year: string };
const blankBDay: BDay = { day: "", month: "", year: "" };

function bdayToIso(b: BDay): string | null {
  if (!b.day || !b.month || !b.year) return null;
  return `${b.year}-${b.month}-${b.day}`;
}

// ── main types ─────────────────────────────────────────────────────────────

type CustomerDraft = {
  name: string;
  phone: string;
  notes: string;
  tags: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (newCustomer: { id: string; name: string }) => void;
};

const AVAILABLE_TAGS = ["VIP", "Regular", "New", "Sensitive / Allergic"];

const blankDraft: CustomerDraft = { name: "", phone: "", notes: "", tags: [] };

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ── component ──────────────────────────────────────────────────────────────

export default function CustomerFormModal({ open, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CustomerDraft>(blankDraft);
  const [bday, setBday] = useState<BDay>(blankBDay);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(blankDraft);
      setBday(blankBDay);
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const valid = draft.name.trim().length > 0;

  const toggleTag = (tag: string) =>
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag)
        ? d.tags.filter((t) => t !== tag)
        : [...d.tags, tag],
    }));

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    setError(null);

    let id = toSlug(draft.name.trim());
    const bdayIso = bdayToIso(bday);
    const payload: Record<string, unknown> = {
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      notes: draft.notes.trim() || null,
      tags: draft.tags.length > 0 ? draft.tags : null,
      visits: 0,
      total_spend: 0,
    };
    // Only include birthday if set — avoids failing on DBs where column doesn't exist yet
    if (bdayIso) payload.birthday = bdayIso;

    let { error: err } = await supabase
      .from("customers")
      .insert({ id, ...payload });

    // Slug collision — append a short suffix and retry
    if (err?.code === "23505") {
      id = `${id}-${Date.now().toString().slice(-4)}`;
      ({ error: err } = await supabase
        .from("customers")
        .insert({ id, ...payload }));
    }

    setSaving(false);

    if (err) {
      if (err.code === "42501" || err.message?.toLowerCase().includes("policy")) {
        setError(
          "You don't have permission to add customers for this salon. Make sure you're signed in as the salon owner.",
        );
      } else {
        setError(`Could not save: ${err.message}`);
      }
      return;
    }

    onSave({ id, name: draft.name.trim() });
    onClose();
  };

  // ── render ─────────────────────────────────────────────────────────────

  const bdayPartStyle: React.CSSProperties = {
    flex: 1,
    padding: "10px 12px",
    border: "1px solid var(--ink-100)",
    borderRadius: 10,
    background: "var(--white)",
    fontSize: 13,
    color: "var(--ink-900)",
    appearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: 30,
    cursor: "pointer",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="New customer"
      title="A new face to remember"
      subtitle="Fill in what you know — everything else can be added later."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={saving || (!valid && touched)}
          >
            {saving ? "Saving…" : "Add customer"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>

        {/* ── error banner ── */}
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 10,
              fontSize: 13,
              color: "#A53A2C",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {/* ── full name ── */}
        <div className="field">
          <label htmlFor="cust-name">Full name</label>
          <input
            id="cust-name"
            type="text"
            placeholder="e.g. Dilini Perera"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoComplete="off"
          />
          {touched && !draft.name.trim() && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "#A53A2C",
                letterSpacing: "0.02em",
              }}
            >
              A name helps you find them again — please add one.
            </div>
          )}
        </div>

        {/* ── phone ── */}
        <div className="field">
          <label htmlFor="cust-phone">Phone number</label>
          <input
            id="cust-phone"
            type="tel"
            placeholder="+94 77 000 0000"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
        </div>

        {/* ── birthday ── */}
        <div className="field">
          <label>
            Birthday{" "}
            <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>
              (optional)
            </span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Day */}
            <select
              aria-label="Day"
              value={bday.day}
              onChange={(e) => setBday({ ...bday, day: e.target.value })}
              style={bdayPartStyle}
            >
              <option value="">Day</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {parseInt(d, 10)}
                </option>
              ))}
            </select>

            {/* Month */}
            <select
              aria-label="Month"
              value={bday.month}
              onChange={(e) => setBday({ ...bday, month: e.target.value })}
              style={{ ...bdayPartStyle, flex: 2 }}
            >
              <option value="">Month</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Year */}
            <select
              aria-label="Year"
              value={bday.year}
              onChange={(e) => setBday({ ...bday, year: e.target.value })}
              style={bdayPartStyle}
            >
              <option value="">Year</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Live preview once at least one part is chosen */}
          {(bday.day || bday.month || bday.year) && (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: "var(--ink-500)",
                letterSpacing: "0.02em",
              }}
            >
              {[
                bday.day ? parseInt(bday.day, 10) : null,
                bday.month
                  ? MONTHS.find((m) => m.value === bday.month)?.label
                  : null,
                bday.year || null,
              ]
                .filter(Boolean)
                .join(" ")}
            </div>
          )}
        </div>

        {/* ── tags ── */}
        <div className="field">
          <label>Tags</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {AVAILABLE_TAGS.map((tag) => {
              const active = draft.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    border: `1px solid ${active ? "var(--plum-700)" : "var(--ink-200)"}`,
                    background: active ? "var(--plum-50)" : "transparent",
                    color: active ? "var(--plum-700)" : "var(--ink-500)",
                    fontSize: 12,
                    letterSpacing: "0.02em",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s, color 0.15s",
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── notes ── */}
        <div className="field">
          <label htmlFor="cust-notes">Notes</label>
          <textarea
            id="cust-notes"
            placeholder="What should you remember about this customer?"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            rows={3}
          />
        </div>

      </form>
    </Modal>
  );
}
