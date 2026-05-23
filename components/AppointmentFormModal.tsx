"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";
import { humanError } from "@/lib/data";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type CustomerOption = { id: string; name: string; phone: string | null };
type ServiceOption  = { id: number; name: string; category: string; duration: number; price: number; station_type_id: number | null };
type StaffOption    = { id: number; name: string; role: string | null };
type StationOption  = { id: number; name: string; count: number };

// One service line inside the booking form.
// Each line carries its own staff assignment for accurate commission tracking.
// `key` is a local React identifier — never sent to the DB.
type ServiceLine = {
  key:        string;
  service_id: number;
  duration:   number;
  price:      number;
  staff_id:   number | null;  // commission is per-service, so staff is per-line
};

type Draft = {
  customer_id: string;
  services:    ServiceLine[];
  date:        string;
  time:        string;
  notes:       string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  defaultCustomerId?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

let _keySeq = 0;
function newKey(): string {
  return `svc-${Date.now()}-${_keySeq++}`;
}

function blankService(): ServiceLine {
  return { key: newKey(), service_id: 0, duration: 60, price: 0, staff_id: null };
}

function blankDraft(defaultCustomerId?: string): Draft {
  return {
    customer_id: defaultCustomerId ?? "",
    services:    [blankService()],
    date:        todayIso(),
    time:        "09:00",
    notes:       "",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppointmentFormModal({
  open,
  onClose,
  onSave,
  defaultCustomerId,
}: Props) {
  // Reference data
  const [customers,    setCustomers]    = useState<CustomerOption[]>([]);
  const [services,     setServices]     = useState<ServiceOption[]>([]);
  const [staffList,    setStaffList]    = useState<StaffOption[]>([]);
  const [stationTypes, setStationTypes] = useState<StationOption[]>([]);

  // Customer combobox
  const [customerQuery,    setCustomerQuery]    = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [showDropdown,     setShowDropdown]     = useState(false);
  const [isNewCustomer,    setIsNewCustomer]    = useState(false);
  const [newName,          setNewName]          = useState("");
  const [newPhone,         setNewPhone]         = useState("");
  const comboRef = useRef<HTMLDivElement>(null);

  // Form
  const [draft,   setDraft]   = useState<Draft>(() => blankDraft(defaultCustomerId));
  const [touched, setTouched] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Station availability (one warning string per conflicted service)
  const [stationIssues, setStationIssues] = useState<string[]>([]);
  const [checkingAvail, setCheckingAvail] = useState(false);

  // Per-service staff conflicts
  const [staffIssues,   setStaffIssues]   = useState<string[]>([]);
  const [checkingStaff, setCheckingStaff] = useState(false);

  // Customer conflict
  const [customerConflict, setCustomerConflict] = useState<{ busy: boolean; name: string } | null>(null);
  const [checkingCustomer, setCheckingCustomer] = useState(false);

  // ── Derived totals ─────────────────────────────────────────────────────────

  const totalDuration = draft.services.reduce((s, l) => s + l.duration, 0);
  const totalPrice    = draft.services.reduce((s, l) => s + l.price, 0);

  // ── Load data on open ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    setDraft(blankDraft(defaultCustomerId));
    setTouched(false);
    setError(null);
    setStationIssues([]);
    setStaffIssues([]);
    setCustomerConflict(null);
    setIsNewCustomer(false);
    setNewName("");
    setNewPhone("");
    setCustomerQuery("");
    setSelectedCustomer(null);

    let cancelled = false;
    Promise.all([
      supabase.from("customers").select("id, name, phone").order("name"),
      supabase.from("services").select("*").order("category").order("name"),
      supabase.from("staff").select("id, name, role").eq("active", true).order("name"),
      supabase.from("station_types").select("id, name, count").order("name"),
    ]).then(([c, s, st, stn]) => {
      if (cancelled) return;
      setCustomers((c.data as CustomerOption[]) ?? []);
      setServices(
        ((s.data ?? []) as Record<string, unknown>[]).map((r) => ({
          id:              r.id as number,
          name:            r.name as string,
          category:        (r.category as string) ?? "",
          duration:        (r.duration as number) ?? 60,
          price:           (r.price as number) ?? 0,
          station_type_id: (r.station_type_id as number | null) ?? null,
        })),
      );
      setStaffList((st.data as StaffOption[]) ?? []);
      setStationTypes((stn.data as StationOption[]) ?? []);

      if (defaultCustomerId) {
        const found = (c.data as CustomerOption[] ?? []).find(x => x.id === defaultCustomerId);
        if (found) {
          setSelectedCustomer(found);
          setCustomerQuery(found.name);
          setDraft(d => ({ ...d, customer_id: found.id }));
        }
      }
    });
    return () => { cancelled = true; };
  }, [open, defaultCustomerId]);

  // ── Click-outside to close dropdown ───────────────────────────────────────

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // ── Service line mutations ─────────────────────────────────────────────────

  const updateServiceLine = (key: string, serviceId: number) => {
    const svc = services.find(s => s.id === serviceId);
    setDraft(d => ({
      ...d,
      services: d.services.map(line =>
        line.key === key
          ? { ...line, service_id: serviceId, duration: svc?.duration ?? 60, price: svc?.price ?? 0 }
          : line,
      ),
    }));
    setStationIssues([]);
  };

  const updateServiceStaff = (key: string, staffId: number | null) => {
    setDraft(d => ({
      ...d,
      services: d.services.map(line =>
        line.key === key ? { ...line, staff_id: staffId } : line,
      ),
    }));
  };

  const addServiceLine = () => {
    setDraft(d => ({ ...d, services: [...d.services, blankService()] }));
  };

  const removeServiceLine = (key: string) => {
    setDraft(d => ({
      ...d,
      services: d.services.filter(l => l.key !== key),
    }));
    setStationIssues([]);
    setStaffIssues([]);
  };

  // ── Station availability check ─────────────────────────────────────────────
  // Each service checked against its sequential time slot.

  // Stable dep key so the effect only fires when service/date/time actually changes
  const svcAvailKey = draft.services.map(l => `${l.service_id}:${l.duration}`).join(",");

  useEffect(() => {
    const selected = draft.services.filter(l => l.service_id > 0);
    if (selected.length === 0 || !draft.date || !draft.time) {
      setStationIssues([]);
      return;
    }

    let cancelled = false;
    setCheckingAvail(true);

    (async () => {
      const issues: string[] = [];
      let cursor = timeToMins(draft.time);

      for (const line of selected) {
        const svc = services.find(s => s.id === line.service_id);
        if (!svc?.station_type_id) { cursor += line.duration; continue; }

        const station = stationTypes.find(st => st.id === svc.station_type_id);
        const limit   = station?.count ?? 1;

        const sameIds = services
          .filter(s => s.station_type_id === svc.station_type_id)
          .map(s => s.id);

        const { data: existing } = await supabase
          .from("appointments")
          .select("time, duration")
          .eq("date", draft.date)
          .in("service_id", sameIds)
          .not("status", "eq", "cancelled");

        if (cancelled) return;

        const ourStart = cursor;
        const ourEnd   = cursor + line.duration;

        const conflicts = (existing ?? []).filter(a => {
          const s = timeToMins(a.time as string);
          const e = s + (a.duration as number);
          return s < ourEnd && e > ourStart;
        });

        if (conflicts.length >= limit) {
          issues.push(
            `All ${limit} ${station?.name ?? "station"}${limit > 1 ? "s" : ""} occupied for "${svc.name}".`,
          );
        }
        cursor += line.duration;
      }

      if (!cancelled) { setStationIssues(issues); setCheckingAvail(false); }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svcAvailKey, draft.date, draft.time, services, stationTypes]);

  // ── Per-service staff conflict check ──────────────────────────────────────

  const staffDepsKey = draft.services.map(l => `${l.staff_id ?? "x"}:${l.duration}`).join(",");

  useEffect(() => {
    const linesWithStaff = draft.services.filter(l => l.staff_id != null);
    if (linesWithStaff.length === 0 || !draft.date || !draft.time) {
      setStaffIssues([]);
      return;
    }

    let cancelled = false;
    setCheckingStaff(true);

    (async () => {
      const issues: string[] = [];
      let cursor = timeToMins(draft.time);

      for (const line of draft.services) {
        const ourStart = cursor;
        const ourEnd   = cursor + line.duration;

        if (line.staff_id != null) {
          const { data } = await supabase
            .from("appointments")
            .select("time, duration")
            .eq("date", draft.date)
            .eq("staff_id", line.staff_id)
            .not("status", "eq", "cancelled");

          if (cancelled) return;

          const busy = (data ?? []).some((a) => {
            const s = timeToMins(a.time as string);
            const e = s + (a.duration as number);
            return s < ourEnd && e > ourStart;
          });

          if (busy) {
            const staffName = staffList.find(s => s.id === line.staff_id)?.name ?? "Staff";
            const svcName   = services.find(s => s.id === line.service_id)?.name;
            issues.push(
              `${staffName} is already booked at ${minsToTime(ourStart)}` +
              (svcName ? ` (${svcName})` : "") + ".",
            );
          }
        }
        cursor += line.duration;
      }

      if (!cancelled) { setStaffIssues(issues); setCheckingStaff(false); }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffDepsKey, draft.date, draft.time, staffList, services]);

  // ── Customer conflict check ────────────────────────────────────────────────

  useEffect(() => {
    if (!draft.customer_id || !draft.date || !draft.time || totalDuration === 0) {
      setCustomerConflict(null);
      return;
    }

    let cancelled = false;
    setCheckingCustomer(true);

    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("time, duration")
        .eq("date", draft.date)
        .eq("customer_id", draft.customer_id)
        .not("status", "eq", "cancelled");

      if (cancelled) return;

      const ourStart = timeToMins(draft.time);
      const ourEnd   = ourStart + totalDuration;

      const busy = (data ?? []).some((a) => {
        const s = timeToMins(a.time as string);
        const e = s + (a.duration as number);
        return s < ourEnd && e > ourStart;
      });

      const custName = customers.find((c) => c.id === draft.customer_id)?.name ?? "This customer";
      setCustomerConflict({ busy, name: custName });
      setCheckingCustomer(false);
    })();

    return () => { cancelled = true; };
  }, [draft.customer_id, draft.date, draft.time, totalDuration, customers]);

  // ── Customer combobox actions ──────────────────────────────────────────────

  const filteredCustomers = customers.filter(c => {
    const q = customerQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
  });

  const pickCustomer = (c: CustomerOption) => {
    setSelectedCustomer(c);
    setDraft(d => ({ ...d, customer_id: c.id }));
    setCustomerQuery(c.name);
    setIsNewCustomer(false);
    setShowDropdown(false);
  };

  const pickNewCustomer = () => {
    setSelectedCustomer(null);
    setDraft(d => ({ ...d, customer_id: "" }));
    setCustomerQuery("");
    setIsNewCustomer(true);
    setShowDropdown(false);
    setNewName("");
    setNewPhone("");
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setDraft(d => ({ ...d, customer_id: "" }));
    setCustomerQuery("");
    setIsNewCustomer(false);
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const customerReady = isNewCustomer
    ? newName.trim().length > 0
    : draft.customer_id.length > 0;

  const servicesReady =
    draft.services.length > 0 &&
    draft.services.every(l => l.service_id > 0);

  const valid =
    customerReady &&
    servicesReady &&
    draft.date.length > 0 &&
    draft.time.length > 0;

  // ── Submit ─────────────────────────────────────────────────────────────────
  // Creates one appointment row per service with sequential start times.
  // Each row carries its own staff_id for commission tracking.

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    setError(null);

    let customerId = draft.customer_id;

    if (isNewCustomer) {
      const { data: newCust, error: custErr } = await supabase
        .from("customers")
        .insert({ name: newName.trim(), phone: newPhone.trim() || null })
        .select("id")
        .single();

      if (custErr || !newCust) {
        setError(humanError(custErr, "We couldn't add that customer. Try again in a moment."));
        setSaving(false);
        return;
      }
      customerId = (newCust as { id: string }).id;
    }

    const rows: Record<string, unknown>[] = [];
    let cursor = timeToMins(draft.time);

    for (const line of draft.services) {
      rows.push({
        customer_id: customerId,
        service_id:  line.service_id,
        date:        draft.date,
        time:        minsToTime(cursor),
        duration:    line.duration,
        status:      "confirmed",
        notes:       draft.notes.trim() || null,
        staff_id:    line.staff_id,
      });
      cursor += line.duration;
    }

    const { error: err } = await supabase.from("appointments").insert(rows);

    setSaving(false);
    if (err) {
      setError(humanError(err, "We couldn't save this appointment. Try again in a moment."));
      return;
    }
    onSave();
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasStationConflict = stationIssues.length > 0;
  const hasStaffConflict   = staffIssues.length > 0;
  const categories = Array.from(new Set(services.map(s => s.category)));
  const filledServices = draft.services.filter(l => l.service_id > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="New appointment"
      title="Add an appointment"
      subtitle="Book a customer in. They'll receive a confirmation if reminders are on."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={
              saving ||
              (touched && !valid) ||
              hasStationConflict ||
              hasStaffConflict ||
              !!customerConflict?.busy
            }
          >
            {saving ? "Saving…" : "Book appointment"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {error && (
          <div style={{
            marginBottom: 16,
            padding: "10px 14px",
            background: "#FEF2F2",
            borderRadius: 8,
            fontSize: 13,
            color: "#A53A2C",
          }}>
            {error}
          </div>
        )}

        {/* ── Customer combobox ── */}
        <div className="field">
          <label>Customer</label>

          {(selectedCustomer || isNewCustomer) ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 12px",
              border: "1px solid var(--plum-200)",
              borderRadius: 10,
              background: "var(--plum-50)",
              fontSize: 13,
            }}>
              <span style={{ flex: 1, color: "var(--ink-900)", fontWeight: 500 }}>
                {isNewCustomer ? "New customer" : selectedCustomer?.name}
              </span>
              {selectedCustomer?.phone && (
                <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
                  {selectedCustomer.phone}
                </span>
              )}
              <button
                type="button"
                onClick={clearCustomer}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--ink-500)", padding: "0 2px", lineHeight: 1, fontSize: 16,
                }}
                aria-label="Clear customer"
              >
                ×
              </button>
            </div>
          ) : (
            <div ref={comboRef} style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={customerQuery}
                autoComplete="off"
                onChange={(e) => { setCustomerQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0, right: 0,
                  background: "var(--white)",
                  border: "1px solid var(--ink-100)",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(45,10,31,0.10)",
                  zIndex: 200,
                  maxHeight: 240,
                  overflowY: "auto",
                }}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickNewCustomer(); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      border: "none", borderBottom: "1px solid var(--ink-100)",
                      background: "transparent", cursor: "pointer",
                      fontSize: 13, color: "var(--plum-700)", fontWeight: 500,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                    New customer
                  </button>
                  {filteredCustomers.length === 0 ? (
                    <div style={{ padding: "12px 14px", fontSize: 13, color: "var(--ink-400)" }}>
                      No customers match — or add them as new.
                    </div>
                  ) : (
                    filteredCustomers.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickCustomer(c); }}
                        style={{
                          width: "100%", textAlign: "left", padding: "9px 14px",
                          border: "none", background: "transparent", cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 12,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: "var(--ink-900)", fontWeight: 500 }}>
                            {c.name}
                          </div>
                          {c.phone && (
                            <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 1 }}>
                              {c.phone}
                            </div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {touched && !customerReady && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C" }}>
              Please select or add a customer.
            </div>
          )}
        </div>

        {/* Inline new customer fields */}
        {isNewCustomer && (
          <div style={{
            marginTop: -8, marginBottom: 16,
            padding: "14px 16px",
            background: "var(--cream)", borderRadius: 10, border: "1px solid var(--ink-100)",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="nc-name">Name</label>
              <input
                id="nc-name" type="text"
                placeholder="Customer's full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoComplete="off"
              />
              {touched && isNewCustomer && !newName.trim() && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#A53A2C" }}>
                  A name is required.
                </div>
              )}
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="nc-phone">
                Phone{" "}
                <span style={{ fontWeight: 400, color: "var(--ink-500)", textTransform: "none", letterSpacing: 0 }}>
                  (optional)
                </span>
              </label>
              <input
                id="nc-phone" type="tel"
                placeholder="077 000 0000"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Customer conflict */}
        {draft.customer_id && draft.date && draft.time && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            {checkingCustomer ? (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>Checking customer availability…</div>
            ) : customerConflict?.busy ? (
              <div style={{
                padding: "9px 13px", background: "#FEF2F2",
                borderRadius: 8, fontSize: 12, color: "#A53A2C",
              }}>
                ⚠ {customerConflict.name} already has an appointment at this time.
              </div>
            ) : null}
          </div>
        )}

        {/* ── Services ── */}
        <div className="field">
          <label>Services</label>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.services.map((line, idx) => {
              const selectedSvc   = services.find(s => s.id === line.service_id);
              const selectedStnId = selectedSvc?.station_type_id;

              // Sequential start time for this service
              const lineStartMins = timeToMins(draft.time) +
                draft.services.slice(0, idx).reduce((s, l) => s + l.duration, 0);
              const lineStartLabel = (idx > 0 && draft.time) ? minsToTime(lineStartMins) : null;

              return (
                <div
                  key={line.key}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    ...(idx > 0 ? {
                      background: "var(--cream)",
                      borderRadius: 10,
                      padding: "12px 12px",
                      border: "1px solid var(--ink-100)",
                    } : {}),
                  }}
                >
                  <div style={{ flex: 1 }}>
                    {lineStartLabel && (
                      <div style={{
                        fontSize: 11,
                        color: "var(--plum-600)",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        marginBottom: 6,
                        fontWeight: 500,
                      }}>
                        Service {idx + 1} · starts at {lineStartLabel}
                      </div>
                    )}

                    {/* Service dropdown */}
                    <select
                      value={line.service_id || ""}
                      onChange={(e) => updateServiceLine(line.key, Number(e.target.value))}
                    >
                      <option value="">Select a service…</option>
                      {categories.map(cat => (
                        <optgroup key={cat} label={cat}>
                          {services.filter(s => s.category === cat).map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} · {s.duration} min{s.price ? ` · LKR ${s.price.toLocaleString()}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    {selectedStnId != null && (
                      <div style={{ marginTop: 4, fontSize: 12, color: "var(--ink-500)", letterSpacing: "0.02em" }}>
                        Uses:{" "}
                        <strong style={{ color: "var(--ink-700)", fontWeight: 500 }}>
                          {stationTypes.find(st => st.id === selectedStnId)?.name ?? "station"}
                        </strong>
                      </div>
                    )}

                    {/* Per-service staff assignment */}
                    {staffList.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{
                          fontSize: 10,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--ink-400)",
                          marginBottom: 4,
                        }}>
                          Staff{" "}
                          <span style={{
                            textTransform: "none",
                            letterSpacing: 0,
                            fontWeight: 400,
                            color: "var(--ink-400)",
                          }}>
                            — for commission
                          </span>
                        </div>
                        <select
                          value={line.staff_id ?? ""}
                          onChange={(e) =>
                            updateServiceStaff(line.key, e.target.value ? Number(e.target.value) : null)
                          }
                          style={{ fontSize: 13 }}
                        >
                          <option value="">Owner / unassigned</option>
                          {staffList.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name}{s.role ? ` · ${s.role}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  {draft.services.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeServiceLine(line.key)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--ink-400)", fontSize: 18, lineHeight: 1,
                        padding: "6px 4px",
                        marginTop: idx > 0 ? 20 : 6,
                        flexShrink: 0,
                      }}
                      aria-label="Remove service"
                      title="Remove this service"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add another service */}
          <button
            type="button"
            onClick={addServiceLine}
            style={{
              marginTop: 10,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              width: "100%",
              background: "none",
              border: "1px dashed var(--ink-200)",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--plum-700)",
              fontWeight: 500,
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
            Add another service
          </button>

          {touched && !servicesReady && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C" }}>
              Please select a service for each row, or remove empty rows.
            </div>
          )}
        </div>

        {/* Total summary */}
        {filledServices.length > 0 && (
          <div style={{
            marginTop: -4, marginBottom: 16,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px",
            background: "var(--cream)", borderRadius: 8,
            fontSize: 13,
          }}>
            <div style={{ color: "var(--ink-500)" }}>
              {filledServices.length} service{filledServices.length > 1 ? "s" : ""} · {totalDuration} min total
            </div>
            <div style={{ fontWeight: 600, color: "var(--ink-900)" }}>
              LKR {totalPrice.toLocaleString()}
            </div>
          </div>
        )}

        {/* Station availability feedback */}
        {filledServices.length > 0 && draft.date && draft.time && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            {checkingAvail ? (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>Checking station availability…</div>
            ) : hasStationConflict ? (
              <div style={{
                padding: "9px 13px", background: "#FEF2F2",
                borderRadius: 8, fontSize: 12, color: "#A53A2C",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                {stationIssues.map((issue, i) => <div key={i}>⚠ {issue}</div>)}
              </div>
            ) : filledServices.some(l => services.find(s => s.id === l.service_id)?.station_type_id != null) ? (
              <div style={{ fontSize: 12, color: "#1F6B3A" }}>✓ All stations available</div>
            ) : null}
          </div>
        )}

        {/* Staff conflict feedback */}
        {filledServices.some(l => l.staff_id != null) && draft.date && draft.time && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            {checkingStaff ? (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>Checking staff availability…</div>
            ) : hasStaffConflict ? (
              <div style={{
                padding: "9px 13px", background: "#FEF2F2",
                borderRadius: 8, fontSize: 12, color: "#A53A2C",
                display: "flex", flexDirection: "column", gap: 4,
              }}>
                {staffIssues.map((issue, i) => <div key={i}>⚠ {issue}</div>)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#1F6B3A" }}>
                ✓ {filledServices.filter(l => l.staff_id != null).length === 1
                  ? `${staffList.find(s => s.id === filledServices.find(l => l.staff_id != null)?.staff_id)?.name ?? "Staff"} is free at this time`
                  : "All assigned staff are free at this time"}
              </div>
            )}
          </div>
        )}

        {/* ── Date & Time ── */}
        <div className="field-row">
          <div className="field">
            <label htmlFor="apt-date">Date</label>
            <input
              id="apt-date"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft(d => ({ ...d, date: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="apt-time">Start time</label>
            <input
              id="apt-time"
              type="time"
              value={draft.time}
              onChange={(e) => setDraft(d => ({ ...d, time: e.target.value }))}
            />
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="field">
          <label htmlFor="apt-notes">
            Notes{" "}
            <span style={{ fontWeight: 400, color: "var(--ink-500)" }}>(optional)</span>
          </label>
          <textarea
            id="apt-notes"
            placeholder="Anything worth knowing before the appointment…"
            value={draft.notes}
            onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))}
            rows={3}
          />
        </div>
      </form>
    </Modal>
  );
}
