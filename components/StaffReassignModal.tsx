"use client";

import { useState } from "react";
import Modal from "./Modal";

export type UpcomingApt = {
  id: number;
  date: string;
  time: string;
  customers: { name: string } | null;
  services:  { name: string } | null;
};

type Props = {
  open:        boolean;
  mode:        "deactivate" | "delete";
  staffName:   string;
  appointments: UpcomingApt[];
  otherStaff:  { id: number; name: string }[];
  busyStaff?:  Record<number, number[]>; // aptId → staff IDs already booked at that time
  onConfirm:   (reassignments: Record<number, number | null>) => void;
  onCancel:    () => void;
};

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}
function fmtTime(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh}:${String(m).padStart(2, "0")} ${period}`;
}

export default function StaffReassignModal({
  open, mode, staffName, appointments, otherStaff, busyStaff, onConfirm, onCancel,
}: Props) {
  const isDelete = mode === "delete";
  const verb     = isDelete ? "Remove" : "Deactivate";
  const n        = appointments.length;

  // Start with every appointment unassigned (null = Owner)
  const [map, setMap] = useState<Record<number, number | null>>({});

  const set = (aptId: number, staffId: number | null) =>
    setMap((m) => ({ ...m, [aptId]: staffId }));

  const handleConfirm = () => onConfirm(map);

  // "Proceed without reassigning" — unassign all (null)
  const handleSkip = () => {
    const all: Record<number, number | null> = {};
    appointments.forEach((a) => { all[a.id] = null; });
    onConfirm(all);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      destructive
      eyebrow="Upcoming appointments at risk"
      title={`${staffName} has ${n} upcoming appointment${n !== 1 ? "s" : ""}`}
      subtitle={
        isDelete
          ? `Removing ${staffName} will leave ${n} appointment${n !== 1 ? "s" : ""} unassigned. Reassign them now or they'll fall to the Owner column.`
          : `Deactivating ${staffName} will hide their column from the calendar. Reassign upcoming appointments so nothing gets lost.`
      }
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-ghost" style={{ color: "#A53A2C" }} onClick={handleSkip}>
            {verb} without reassigning
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm}>
            Reassign &amp; {verb}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          padding: "6px 12px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--ink-400)",
          borderBottom: "1px solid var(--ink-100)",
        }}>
          <span>Appointment</span>
          <span>Service</span>
          <span>Reassign to</span>
        </div>

        {appointments.map((apt) => (
          <div key={apt.id} style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            padding: "10px 12px",
            alignItems: "center",
            borderBottom: "1px solid var(--ink-100)",
            fontSize: 13,
          }}>
            {/* Customer + date/time */}
            <div>
              <div style={{ fontWeight: 500, color: "var(--ink-900)" }}>
                {apt.customers?.name ?? "Customer"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>
                {fmtDate(apt.date)} · {fmtTime(apt.time)}
              </div>
            </div>

            {/* Service */}
            <div style={{ color: "var(--ink-600)" }}>
              {apt.services?.name ?? "—"}
            </div>

            {/* Reassign dropdown */}
            {(() => {
              const busyIds = busyStaff?.[apt.id] ?? [];
              const available = otherStaff.filter((s) => !busyIds.includes(s.id));
              const busyOnes  = otherStaff.filter((s) =>  busyIds.includes(s.id));
              return (
                <select
                  value={map[apt.id] === undefined ? "" : (map[apt.id] === null ? "null" : String(map[apt.id]))}
                  onChange={(e) => set(apt.id, e.target.value === "null" ? null : Number(e.target.value))}
                  style={{
                    fontSize: 12,
                    padding: "5px 8px",
                    border: "1px solid var(--ink-200)",
                    borderRadius: 7,
                    background: "var(--white)",
                    color: "var(--ink-700)",
                    cursor: "pointer",
                  }}
                >
                  <option value="" disabled>Choose…</option>
                  <option value="null">Owner (unassigned)</option>
                  {available.map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                  {busyOnes.length > 0 && (
                    <optgroup label="Already booked at this time">
                      {busyOnes.map((s) => (
                        <option key={s.id} value={String(s.id)} disabled>
                          {s.name} — busy
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              );
            })()}
          </div>
        ))}
      </div>
    </Modal>
  );
}
