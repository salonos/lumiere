"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { formatTime12, lkr } from "@/lib/data";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type StaffOption = { id: number; name: string; role: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  appointment: {
    id: number;
    customerName: string;
    customerId: string;
    serviceName: string;
    servicePrice: number;
    date: string;
    time: string;
    duration: number;
    status: string;
    notes: string | null;
    staffId?: number | null;  // used to initialise the reassign dropdown
    staffName: string | null;
    paymentMethod: string | null;
    discountAmount: number;
  } | null;
  // Reschedule
  rescheduleDate: string;
  rescheduleTime: string;
  onRescheduleDateChange: (date: string) => void;
  onRescheduleTimeChange: (time: string) => void;
  onReschedule: () => void;
  rescheduling: boolean;
  // Staff reassignment (optional — omit to hide the section)
  staffList?: StaffOption[];
  onReassignStaff?: (appointmentId: number, staffId: number | null) => void;
  reassigning?: boolean;
  // Status
  onStatusChange: (
    id: number,
    newStatus: string,
    payment?: { method: string; discount: number },
  ) => void;
  saving: boolean;
};

const PAYMENT_METHODS = [
  { value: "cash",     label: "Cash" },
  { value: "card",     label: "Card" },
  { value: "transfer", label: "Bank transfer" },
];

export default function AppointmentDetailModal({
  open,
  onClose,
  appointment: apt,
  rescheduleDate,
  rescheduleTime,
  onRescheduleDateChange,
  onRescheduleTimeChange,
  onReschedule,
  rescheduling,
  staffList,
  onReassignStaff,
  reassigning = false,
  onStatusChange,
  saving,
}: Props) {
  const [paymentStep,   setPaymentStep]   = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | null>(null);
  const [discount,      setDiscount]      = useState(0);

  // Staff reassignment: tracks the selected staff in the dropdown.
  // Initialised to the appointment's current staff when the modal opens.
  const [reassignStaffId, setReassignStaffId] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setPaymentStep(false);
      setPaymentMethod(null);
      setDiscount(0);
      setReassignStaffId(apt?.staffId ?? null);
    }
  }, [open]);

  if (!apt) return null;

  const [y, m, d] = apt.date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dateLabel = `${DOW[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;

  const isPending   = apt.status === "pending";
  const isConfirmed = apt.status === "confirmed";
  const isActive    = isPending || isConfirmed;
  const isDone      = apt.status === "completed" || apt.status === "cancelled";

  const rescheduleChanged =
    rescheduleDate !== apt.date || rescheduleTime !== apt.time;

  const currentStaffId  = apt.staffId ?? null;
  const reassignChanged = reassignStaffId !== currentStaffId;

  const netAmount = Math.max(0, apt.servicePrice - (paymentStep ? discount : apt.discountAmount));

  // ── Payment step ──────────────────────────────────────────────────────────

  const handleConfirmComplete = () => {
    if (!paymentMethod) return;
    onStatusChange(apt.id, "completed", { method: paymentMethod, discount });
    setPaymentStep(false);
  };

  const handleCancelPayment = () => {
    setPaymentStep(false);
    setDiscount(0);
    setPaymentMethod(null);
  };

  // ── Status chip ───────────────────────────────────────────────────────────

  const statusChip = (
    <span className={`chip ${
      apt.status === "confirmed" ? "chip-success" :
      apt.status === "pending"   ? "chip-warning" :
      apt.status === "completed" ? "chip-plum"    :
      "chip-gray"
    }`}>
      {apt.status === "confirmed" ? "Confirmed"     :
       apt.status === "pending"   ? "Pending reply" :
       apt.status === "completed" ? "Completed"     :
       "Cancelled"}
    </span>
  );

  // ── Payment method label (completed view) ─────────────────────────────────

  const paymentLabel = apt.paymentMethod
    ? PAYMENT_METHODS.find(p => p.value === apt.paymentMethod)?.label ?? apt.paymentMethod
    : null;

  // ── Footer ────────────────────────────────────────────────────────────────

  const anyBusy = saving || rescheduling || reassigning;

  const footer = paymentStep ? (
    <>
      <button type="button" className="btn btn-ghost" onClick={handleCancelPayment}>
        Back
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleConfirmComplete}
        disabled={saving || !paymentMethod}
        title={!paymentMethod ? "Pick a payment method first" : undefined}
      >
        {saving ? "Saving…" : "Confirm complete"}
      </button>
    </>
  ) : (
    <>
      {isActive && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginRight: "auto", color: "#A53A2C" }}
          onClick={() => onStatusChange(apt.id, "cancelled")}
          disabled={anyBusy}
        >
          Cancel appointment
        </button>
      )}
      <button type="button" className="btn btn-ghost" onClick={onClose} disabled={anyBusy}>
        Close
      </button>
      {isPending && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onStatusChange(apt.id, "confirmed")}
          disabled={anyBusy}
        >
          Confirm
        </button>
      )}
      {isActive && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setPaymentStep(true)}
          disabled={anyBusy}
        >
          Mark complete
        </button>
      )}
    </>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      onClose={paymentStep ? handleCancelPayment : onClose}
      eyebrow="Appointment"
      title={apt.customerName}
      subtitle={`${apt.serviceName} · ${apt.duration} min`}
      footer={footer}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Payment capture step ── */}
        {paymentStep && (
          <div style={{
            background: "var(--cream)",
            borderRadius: 12,
            padding: "20px 22px",
            border: "1px solid var(--ink-100)",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}>
            <div>
              <div style={{
                fontFamily: "var(--font-serif)",
                fontSize: 20,
                fontWeight: 500,
                color: "var(--plum-900)",
                marginBottom: 4,
              }}>
                How was this paid?
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.5 }}>
                Pick a method so it appears in your daily reconciliation.
                This is required before marking the appointment complete.
              </div>
            </div>

            {/* Payment method — required */}
            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>
                Payment method <span style={{ color: "#A53A2C" }}>*</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {PAYMENT_METHODS.map(pm => {
                  const selected = paymentMethod === pm.value;
                  return (
                    <button
                      key={pm.value}
                      type="button"
                      onClick={() => setPaymentMethod(pm.value as "cash" | "card" | "transfer")}
                      style={{
                        flex: 1,
                        padding: "12px 6px",
                        borderRadius: 10,
                        border: `1.5px solid ${selected ? "var(--plum-500)" : "var(--ink-200)"}`,
                        background: selected ? "var(--plum-50)" : "var(--white)",
                        color: selected ? "var(--plum-800)" : "var(--ink-700)",
                        fontSize: 13,
                        fontWeight: selected ? 600 : 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.12s",
                        boxShadow: selected ? "0 0 0 3px rgba(165, 38, 104, 0.08)" : "none",
                      }}
                    >
                      {pm.label}
                    </button>
                  );
                })}
              </div>
              {!paymentMethod && (
                <div style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: "#A53A2C",
                  letterSpacing: "0.02em",
                }}>
                  Select cash, card, or bank transfer to continue.
                </div>
              )}
            </div>

            {/* Discount */}
            <div>
              <div style={{ ...labelStyle, marginBottom: 8 }}>
                Discount (LKR){" "}
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--ink-400)" }}>
                  — optional
                </span>
              </div>
              <input
                type="number"
                min={0}
                step={100}
                value={discount || ""}
                placeholder="0"
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>

            {/* Net summary */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingTop: 14,
              borderTop: "1px solid var(--ink-100)",
            }}>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                {lkr(apt.servicePrice)}
                {discount > 0 && ` − ${lkr(discount)} discount`}
              </div>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-900)" }}>
                {lkr(netAmount)}
              </div>
            </div>
          </div>
        )}

        {/* ── Main detail view ── */}
        {!paymentStep && (
          <>
            {/* Date, time, status */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={labelStyle}>Date &amp; time</div>
                <div style={valueStyle}>
                  {dateLabel}
                  <span style={{ color: "var(--ink-500)", fontWeight: 400 }}>
                    {" "}at {formatTime12(apt.time)}
                  </span>
                </div>
              </div>
              <div>
                <div style={labelStyle}>Status</div>
                <div style={{ marginTop: 4 }}>{statusChip}</div>
              </div>
            </div>

            {/* Assigned staff (display) */}
            {apt.staffName && (
              <div>
                <div style={labelStyle}>Assigned to</div>
                <div style={valueStyle}>{apt.staffName}</div>
              </div>
            )}

            {/* Payment info (completed) */}
            {apt.status === "completed" && (paymentLabel || apt.discountAmount > 0) && (
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {paymentLabel && (
                  <div>
                    <div style={labelStyle}>Payment</div>
                    <div style={valueStyle}>{paymentLabel}</div>
                  </div>
                )}
                <div>
                  <div style={labelStyle}>Amount received</div>
                  <div style={valueStyle}>
                    {lkr(Math.max(0, apt.servicePrice - apt.discountAmount))}
                    {apt.discountAmount > 0 && (
                      <span style={{ fontSize: 12, color: "var(--ink-400)", fontWeight: 400, marginLeft: 6 }}>
                        ({lkr(apt.discountAmount)} off)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {apt.notes && (
              <div>
                <div style={labelStyle}>Notes</div>
                <div style={{
                  marginTop: 4,
                  fontSize: 13,
                  color: "var(--ink-700)",
                  lineHeight: 1.65,
                  background: "var(--cream)",
                  borderRadius: 8,
                  padding: "10px 14px",
                }}>
                  {apt.notes}
                </div>
              </div>
            )}

            {/* ── Reschedule + Reassign — active appointments only ── */}
            {isActive && (
              <div style={{ borderTop: "1px solid var(--ink-100)", paddingTop: 20, display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Reschedule */}
                <div>
                  <div style={labelStyle}>Reschedule</div>
                  <div style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => onRescheduleDateChange(e.target.value)}
                      style={inputStyle}
                    />
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => onRescheduleTimeChange(e.target.value)}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ fontSize: 13, padding: "9px 20px", flexShrink: 0 }}
                      onClick={onReschedule}
                      disabled={rescheduling || !rescheduleChanged || reassigning}
                    >
                      {rescheduling ? "Rescheduling…" : "Reschedule"}
                    </button>
                  </div>
                  {rescheduleChanged && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--plum-700)", letterSpacing: "0.01em" }}>
                      New time: {rescheduleDate} at {rescheduleTime} — click Reschedule to confirm.
                    </div>
                  )}
                </div>

                {/* Reassign staff — shown when parent passes a staffList */}
                {staffList !== undefined && onReassignStaff && (
                  <div>
                    <div style={labelStyle}>
                      Reassign staff
                      {apt.staffName && (
                        <span style={{
                          textTransform: "none",
                          letterSpacing: 0,
                          fontWeight: 400,
                          color: "var(--ink-400)",
                          marginLeft: 6,
                        }}>
                          — currently {apt.staffName}
                        </span>
                      )}
                    </div>
                    <div style={{
                      display: "flex",
                      gap: 10,
                      marginTop: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}>
                      <select
                        value={reassignStaffId ?? ""}
                        onChange={(e) =>
                          setReassignStaffId(e.target.value ? Number(e.target.value) : null)
                        }
                        style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                      >
                        <option value="">Owner / unassigned</option>
                        {staffList.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name}{s.role ? ` · ${s.role}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 13, padding: "9px 20px", flexShrink: 0 }}
                        onClick={() => onReassignStaff(apt.id, reassignStaffId)}
                        disabled={reassigning || !reassignChanged || rescheduling}
                      >
                        {reassigning ? "Reassigning…" : "Reassign"}
                      </button>
                    </div>
                    {reassignChanged && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "var(--plum-700)", letterSpacing: "0.01em" }}>
                        Will assign to{" "}
                        {reassignStaffId
                          ? staffList.find(s => s.id === reassignStaffId)?.name ?? "selected staff"
                          : "Owner / unassigned"} — click Reassign to confirm.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Done-state note */}
            {isDone && (
              <div style={{ fontSize: 12, color: "var(--ink-500)", letterSpacing: "0.02em", fontStyle: "italic" }}>
                {apt.status === "completed"
                  ? "This appointment has been marked complete. Customer stats have been updated."
                  : "This appointment was cancelled and is no longer active."}
              </div>
            )}

            {/* Customer profile link */}
            {apt.customerId && (
              <Link
                href={`/customers/${apt.customerId}`}
                style={{
                  fontSize: 13,
                  color: "var(--plum-700)",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
                onClick={onClose}
              >
                View {apt.customerName}&rsquo;s full profile →
              </Link>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-500)",
  marginBottom: 4,
};

const valueStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--ink-900)",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--ink-100)",
  borderRadius: 10,
  fontSize: 13,
  color: "var(--ink-900)",
  background: "var(--white)",
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
};
