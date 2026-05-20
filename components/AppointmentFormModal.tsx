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

type Draft = {
  customer_id: string;
  service_id:  number;
  date:        string;
  time:        string;
  notes:       string;
  duration:    number;
  staff_id:    number | null;
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

function blankDraft(defaultCustomerId?: string): Draft {
  return {
    customer_id: defaultCustomerId ?? "",
    service_id:  0,
    date:        todayIso(),
    time:        "09:00",
    notes:       "",
    duration:    60,
    staff_id:    null,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppointmentFormModal({
  open,
  onClose,
  onSave,
  defaultCustomerId,
}: Props) {
  // Data
  const [customers,     setCustomers]     = useState<CustomerOption[]>([]);
  const [services,      setServices]      = useState<ServiceOption[]>([]);
  const [staffList,     setStaffList]     = useState<StaffOption[]>([]);
  const [stationTypes,  setStationTypes]  = useState<StationOption[]>([]);

  // Customer combobox
  const [customerQuery,   setCustomerQuery]   = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [showDropdown,    setShowDropdown]    = useState(false);
  const [isNewCustomer,   setIsNewCustomer]   = useState(false);
  const [newName,         setNewName]         = useState("");
  const [newPhone,        setNewPhone]        = useState("");
  const comboRef = useRef<HTMLDivElement>(null);

  // Form
  const [draft,   setDraft]   = useState<Draft>(() => blankDraft(defaultCustomerId));
  const [touched, setTouched] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Availability
  const [avail,         setAvail]         = useState<{ ok: boolean; reason?: string } | null>(null);
  const [checkingAvail, setCheckingAvail] = useState(false);

  // Staff conflict
  const [staffConflict,   setStaffConflict]   = useState<{ busy: boolean; name: string } | null>(null);
  const [checkingStaff,   setCheckingStaff]   = useState(false);

  // Customer conflict
  const [customerConflict,   setCustomerConflict]   = useState<{ busy: boolean; name: string } | null>(null);
  const [checkingCustomer,   setCheckingCustomer]   = useState(false);

  // ── Load data on open ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;

    // Reset state
    setDraft(blankDraft(defaultCustomerId));
    setTouched(false);
    setError(null);
    setAvail(null);
    setStaffConflict(null);
    setCustomerConflict(null);
    setIsNewCustomer(false);
    setNewName("");
    setNewPhone("");
    setCustomerQuery("");
    setSelectedCustomer(null);

    let cancelled = false;
    Promise.all([
      supabase.from("customers")
        .select("id, name, phone")
        .order("name"),
      supabase.from("services")
        .select("*")
        .order("category")
        .order("name"),
      supabase.from("staff")
        .select("id, name, role")
        .eq("active", true)
        .order("name"),
      supabase.from("station_types")
        .select("id, name, count")
        .order("name"),
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

      // Pre-select customer if defaultCustomerId provided
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

  // ── Service selection ──────────────────────────────────────────────────────

  const selectService = (id: number) => {
    const svc = services.find(s => s.id === id);
    setDraft(d => ({ ...d, service_id: id, duration: svc?.duration ?? 60 }));
    setAvail(null);
  };

  // ── Availability check ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!draft.service_id || !draft.date || !draft.time) {
      setAvail(null);
      return;
    }

    let cancelled = false;
    setCheckingAvail(true);

    (async () => {
      const svc = services.find(s => s.id === draft.service_id);
      if (!svc?.station_type_id) {
        // No station type → station always available
        if (!cancelled) { setAvail({ ok: true }); setCheckingAvail(false); }
        return;
      }

      const station = stationTypes.find(st => st.id === svc.station_type_id);
      const limit   = station?.count ?? 1;

      // Services that use the same station type
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

      const ourStart = timeToMins(draft.time);
      const ourEnd   = ourStart + draft.duration;

      const conflicts = (existing ?? []).filter(a => {
        const s = timeToMins(a.time as string);
        const e = s + (a.duration as number);
        return s < ourEnd && e > ourStart;
      });

      if (conflicts.length >= limit) {
        setAvail({
          ok: false,
          reason: `All ${limit} ${station?.name ?? "station"}${limit > 1 ? "s" : ""} are occupied at this time.`,
        });
      } else {
        setAvail({ ok: true });
      }
      setCheckingAvail(false);
    })();

    return () => { cancelled = true; };
  }, [draft.service_id, draft.date, draft.time, draft.duration, services, stationTypes]);

  // ── Staff conflict check ───────────────────────────────────────────────────

  useEffect(() => {
    if (!draft.staff_id || !draft.date || !draft.time) {
      setStaffConflict(null);
      return;
    }

    let cancelled = false;
    setCheckingStaff(true);

    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("time, duration")
        .eq("date", draft.date)
        .eq("staff_id", draft.staff_id)
        .not("status", "eq", "cancelled");

      if (cancelled) return;

      const ourStart = timeToMins(draft.time);
      const ourEnd   = ourStart + draft.duration;

      const busy = (data ?? []).some((a) => {
        const s = timeToMins(a.time as string);
        const e = s + (a.duration as number);
        return s < ourEnd && e > ourStart;
      });

      const staffName =
        staffList.find((s) => s.id === draft.staff_id)?.name ?? "This staff member";
      setStaffConflict({ busy, name: staffName });
      setCheckingStaff(false);
    })();

    return () => { cancelled = true; };
  }, [draft.staff_id, draft.date, draft.time, draft.duration, staffList]);

  // ── Customer conflict check ────────────────────────────────────────────────

  useEffect(() => {
    if (!draft.customer_id || !draft.date || !draft.time) {
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
      const ourEnd   = ourStart + draft.duration;

      const busy = (data ?? []).some((a) => {
        const s = timeToMins(a.time as string);
        const e = s + (a.duration as number);
        return s < ourEnd && e > ourStart;
      });

      const custName =
        customers.find((c) => c.id === draft.customer_id)?.name ?? "This customer";
      setCustomerConflict({ busy, name: custName });
      setCheckingCustomer(false);
    })();

    return () => { cancelled = true; };
  }, [draft.customer_id, draft.date, draft.time, draft.duration, customers]);

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

  const valid =
    customerReady &&
    draft.service_id > 0 &&
    draft.date.length > 0 &&
    draft.time.length > 0;

  // ── Submit ─────────────────────────────────────────────────────────────────

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    setError(null);

    let customerId = draft.customer_id;

    // Create new customer if needed
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

    const { error: err } = await supabase.from("appointments").insert({
      customer_id: customerId,
      service_id:  draft.service_id,
      date:        draft.date,
      time:        draft.time,
      duration:    draft.duration,
      status:      "confirmed",
      notes:       draft.notes.trim() || null,
      staff_id:    draft.staff_id || null,
    });

    setSaving(false);
    if (err) {
      setError(humanError(err, "We couldn't save this appointment. Try again in a moment."));
      return;
    }
    onSave();
    onClose();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const selectedSvc   = services.find(s => s.id === draft.service_id);
  const selectedStnId = selectedSvc?.station_type_id;

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
            disabled={saving || (touched && !valid) || (avail?.ok === false) || !!staffConflict?.busy || !!customerConflict?.busy}
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

          {/* Selected customer chip */}
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
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--ink-500)",
                  padding: "0 2px",
                  lineHeight: 1,
                  fontSize: 16,
                }}
                aria-label="Clear customer"
              >
                ×
              </button>
            </div>
          ) : (
            /* Search input + dropdown */
            <div ref={comboRef} style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search by name or phone…"
                value={customerQuery}
                autoComplete="off"
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "var(--white)",
                  border: "1px solid var(--ink-100)",
                  borderRadius: 12,
                  boxShadow: "0 8px 24px rgba(45,10,31,0.10)",
                  zIndex: 200,
                  maxHeight: 240,
                  overflowY: "auto",
                }}>
                  {/* New customer always first */}
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickNewCustomer(); }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      border: "none",
                      borderBottom: "1px solid var(--ink-100)",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--plum-700)",
                      fontWeight: 500,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
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
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 14px",
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
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
            marginTop: -8,
            marginBottom: 16,
            padding: "14px 16px",
            background: "var(--cream)",
            borderRadius: 10,
            border: "1px solid var(--ink-100)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="nc-name">Name</label>
              <input
                id="nc-name"
                type="text"
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
                id="nc-phone"
                type="tel"
                placeholder="077 000 0000"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── Customer conflict feedback ── */}
        {draft.customer_id && draft.date && draft.time && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            {checkingCustomer ? (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>
                Checking customer availability…
              </div>
            ) : customerConflict?.busy ? (
              <div style={{
                padding: "9px 13px",
                background: "#FEF2F2",
                borderRadius: 8,
                fontSize: 12,
                color: "#A53A2C",
              }}>
                ⚠ {customerConflict.name} already has an appointment at this time.
              </div>
            ) : null}
          </div>
        )}

        {/* ── Service ── */}
        <div className="field">
          <label htmlFor="apt-service">Service</label>
          <select
            id="apt-service"
            value={draft.service_id || ""}
            onChange={(e) => selectService(Number(e.target.value))}
          >
            <option value="">Select a service…</option>
            {Array.from(new Set(services.map(s => s.category))).map(cat => (
              <optgroup key={cat} label={cat}>
                {services.filter(s => s.category === cat).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.duration} min{s.price ? ` · LKR ${s.price.toLocaleString()}` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {touched && !draft.service_id && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C" }}>
              Please select a service.
            </div>
          )}
          {/* Station type badge */}
          {selectedStnId != null && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-500)", letterSpacing: "0.02em" }}>
              Uses:{" "}
              <strong style={{ color: "var(--ink-700)", fontWeight: 500 }}>
                {stationTypes.find(st => st.id === selectedStnId)?.name ?? "station"}
              </strong>
            </div>
          )}
        </div>

        {/* ── Availability feedback ── */}
        {draft.service_id > 0 && draft.date && draft.time && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            {checkingAvail ? (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>Checking availability…</div>
            ) : avail?.ok === false ? (
              <div style={{
                padding: "9px 13px",
                background: "#FEF2F2",
                borderRadius: 8,
                fontSize: 12,
                color: "#A53A2C",
              }}>
                ⚠ {avail.reason}
              </div>
            ) : avail?.ok === true && selectedStnId != null ? (
              <div style={{ fontSize: 12, color: "#1F6B3A" }}>
                ✓ Station available
              </div>
            ) : null}
          </div>
        )}

        {/* ── Staff (optional) ── */}
        {staffList.length > 0 && (
          <div className="field">
            <label htmlFor="apt-staff">
              Assigned staff{" "}
              <span style={{ fontWeight: 400, color: "var(--ink-500)", textTransform: "none", letterSpacing: 0 }}>
                (optional — leave blank if owner will do it)
              </span>
            </label>
            <select
              id="apt-staff"
              value={draft.staff_id ?? ""}
              onChange={(e) =>
                setDraft(d => ({ ...d, staff_id: e.target.value ? Number(e.target.value) : null }))
              }
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

        {/* ── Staff conflict feedback ── */}
        {draft.staff_id && draft.date && draft.time && (
          <div style={{ marginTop: -8, marginBottom: 16 }}>
            {checkingStaff ? (
              <div style={{ fontSize: 12, color: "var(--ink-400)" }}>
                Checking staff availability…
              </div>
            ) : staffConflict?.busy ? (
              <div style={{
                padding: "9px 13px",
                background: "#FEF2F2",
                borderRadius: 8,
                fontSize: 12,
                color: "#A53A2C",
              }}>
                ⚠ {staffConflict.name} is already booked during this time.
              </div>
            ) : staffConflict && !staffConflict.busy ? (
              <div style={{ fontSize: 12, color: "#1F6B3A" }}>
                ✓ {staffConflict.name} is free at this time
              </div>
            ) : null}
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
            <label htmlFor="apt-time">Time</label>
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
