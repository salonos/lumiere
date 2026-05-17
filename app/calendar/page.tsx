"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventDropArg, DatesSetArg, EventInput } from "@fullcalendar/core";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import AppointmentFormModal from "@/components/AppointmentFormModal";
import AppointmentDetailModal from "@/components/AppointmentDetailModal";
import Toast from "@/components/Toast";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────────

type CalApt = {
  id: number;
  date: string;
  time: string;
  duration: number;
  status: string;
  notes: string | null;
  tint: string | null;
  customerName: string;
  customerId: string;
  serviceName: string;
  servicePrice: number;
  staffId: number | null;
  staffName: string | null;
  paymentMethod: string | null;
  discountAmount: number;
};

type ViewType = "dayGridMonth" | "timeGridWeek" | "timeGridDay";

const VIEW_LABELS: Record<ViewType, string> = {
  dayGridMonth: "Month",
  timeGridWeek: "Week",
  timeGridDay:  "Day",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toLocaleDateString("en-CA");
}

function timeToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtHour(h: number): string {
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

function fmtDropTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "pm" : "am";
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${dh}:${String(m).padStart(2, "0")} ${period}`;
}

function aptToEvent(a: CalApt): EventInput {
  const start = `${a.date}T${a.time}`;
  const endMs  = new Date(start).getTime() + a.duration * 60_000;
  const end    = new Date(endMs).toISOString();
  const bg =
    a.tint === "pink"        ? "var(--pink-100)"
    : a.tint === "champagne" ? "var(--champagne-100)"
    : "var(--plum-50)";
  const border =
    a.tint === "pink"        ? "var(--plum-500)"
    : a.tint === "champagne" ? "var(--champagne-700)"
    : "var(--plum-700)";
  return {
    id: String(a.id),
    title: a.customerName,
    start, end,
    backgroundColor: bg,
    borderColor:     border,
    textColor:       "var(--plum-900)",
    extendedProps:   { apt: a },
  };
}

// ── Staff Day View ─────────────────────────────────────────────────────────────

const GRID_START  = 7 * 60;   // 7:00 AM in minutes
const GRID_END    = 21 * 60;  // 9:00 PM in minutes
const PX_PER_MIN  = 1;        // 1 CSS pixel per minute
const GRID_HEIGHT = (GRID_END - GRID_START) * PX_PER_MIN; // 840 px
const SNAP        = 15;       // snap-to interval in minutes

type StaffCol = { id: number | null; name: string };

type DropIndicator = {
  colId: number | null | undefined; // undefined = no match; null = Owner column
  mins: number;
};

function StaffDayView({
  date,
  apts,
  staffCols,
  onAptClick,
  onAptDrop,
}: {
  date:       string;
  apts:       CalApt[];
  staffCols:  StaffCol[];
  onAptClick: (apt: CalApt) => void;
  onAptDrop:  (aptId: number, newDate: string, newTime: string, newStaffId: number | null) => void;
}) {
  const scrollRef    = useRef<HTMLDivElement>(null);
  const dragOffsetY  = useRef(0);      // Y offset within block where user grabbed
  const hours        = Array.from({ length: 14 }, (_, i) => 7 + i); // 7…20

  // Drag state (local)
  const [dragId,        setDragId]        = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);

  // Live "now" indicator
  const calcNow = () => {
    const n = new Date();
    return (n.getHours() * 60 + n.getMinutes() - GRID_START) * PX_PER_MIN;
  };
  const [nowTop, setNowTop] = useState(calcNow);
  useEffect(() => {
    const id = setInterval(() => setNowTop(calcNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to current time on mount / date change
  useEffect(() => {
    if (!scrollRef.current) return;
    const isToday = date === todayIso();
    scrollRef.current.scrollTop = Math.max(
      0,
      isToday ? nowTop - 140 : (8 - 7) * 60,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const isToday = date === todayIso();
  const showNow = isToday && nowTop >= 0 && nowTop <= GRID_HEIGHT;
  const cols: StaffCol[] =
    staffCols.length > 0 ? staffCols : [{ id: null, name: "Loading…" }];

  // ── Drag helpers ────────────────────────────────────────────────────────────

  /** Compute snapped minute from pointer Y within a column container */
  const yToMins = (clientY: number, rect: DOMRect): number => {
    const raw = clientY - rect.top - dragOffsetY.current;
    const rawMins = raw / PX_PER_MIN + GRID_START;
    const snapped = Math.round(rawMins / SNAP) * SNAP;
    return Math.max(GRID_START, Math.min(GRID_END - SNAP, snapped));
  };

  const handleDragStart = (e: React.DragEvent, apt: CalApt) => {
    setDragId(apt.id);
    dragOffsetY.current = e.nativeEvent.offsetY;
    e.dataTransfer.effectAllowed = "move";
    // Transparent ghost image so the block stays visible in-place
    const ghost = document.createElement("div");
    ghost.style.width = "1px";
    ghost.style.height = "1px";
    ghost.style.opacity = "0";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDropIndicator(null);
  };

  const handleColDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    col: StaffCol,
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = yToMins(e.clientY, rect);
    setDropIndicator({ colId: col.id, mins });
  };

  const handleColDrop = (
    e: React.DragEvent<HTMLDivElement>,
    col: StaffCol,
  ) => {
    e.preventDefault();
    if (dragId === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mins = yToMins(e.clientY, rect);
    onAptDrop(dragId, date, minsToTime(mins), col.id);
    setDragId(null);
    setDropIndicator(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={scrollRef}
      style={{ overflowY: "auto", overflowX: "auto", maxHeight: "calc(100vh - 295px)" }}
    >
      <div style={{ minWidth: Math.max(560, 64 + cols.length * 180) }}>

        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `64px repeat(${cols.length}, 1fr)`,
          position: "sticky",
          top: 0,
          background: "var(--white)",
          zIndex: 10,
          borderBottom: "2px solid var(--ink-100)",
        }}>
          <div style={{ borderRight: "1px solid var(--ink-100)" }} />
          {cols.map((col) => {
            const count = apts.filter((a) =>
              col.id === null ? a.staffId === null : a.staffId === col.id,
            ).length;
            return (
              <div key={col.id ?? "owner"} style={{
                padding: "11px 14px",
                borderLeft: "1px solid var(--ink-100)",
                textAlign: "center",
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  color: col.id === null ? "var(--ink-500)" : "var(--plum-700)",
                }}>
                  {col.name}
                </div>
                <div style={{ marginTop: 2, fontSize: 10, color: "var(--ink-400)" }}>
                  {count} {count === 1 ? "appt" : "appts"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `64px repeat(${cols.length}, 1fr)`,
        }}>
          {/* Time gutter */}
          <div style={{
            position: "relative",
            height: GRID_HEIGHT,
            borderRight: "1px solid var(--ink-100)",
          }}>
            {hours.map((h, i) => (
              <div key={h} style={{
                position: "absolute",
                top: i * 60 - 7,
                right: 0, left: 0,
                paddingRight: 8,
                textAlign: "right",
                fontSize: 10,
                color: "var(--ink-400)",
                fontWeight: 500,
                letterSpacing: "0.03em",
                lineHeight: 1,
                userSelect: "none",
              }}>
                {i > 0 ? fmtHour(h) : ""}
              </div>
            ))}
          </div>

          {/* Staff columns */}
          {cols.map((col, colIdx) => {
            const colApts   = apts.filter((a) =>
              col.id === null ? a.staffId === null : a.staffId === col.id,
            );
            const isDragTarget =
              dragId !== null &&
              dropIndicator !== null &&
              dropIndicator.colId === col.id;

            return (
              <div
                key={col.id ?? "owner"}
                onDragOver={(e) => handleColDragOver(e, col)}
                onDrop={(e) => handleColDrop(e, col)}
                style={{
                  position: "relative",
                  height: GRID_HEIGHT,
                  borderLeft: "1px solid var(--ink-100)",
                  background: isDragTarget
                    ? "rgba(120,60,160,0.04)"
                    : col.id === null
                    ? "rgba(0,0,0,0.012)"
                    : colIdx % 2 === 0
                    ? undefined
                    : "rgba(100,50,120,0.012)",
                  transition: "background 0.1s",
                }}
              >
                {/* Hour lines */}
                {hours.map((_, i) => (
                  <div key={i} style={{
                    position: "absolute",
                    top: i * 60, left: 0, right: 0,
                    borderTop: i === 0 ? "none" : "1px solid var(--ink-100)",
                    pointerEvents: "none",
                  }} />
                ))}
                {/* Half-hour lines */}
                {hours.map((_, i) => (
                  <div key={`h${i}`} style={{
                    position: "absolute",
                    top: i * 60 + 30, left: 0, right: 0,
                    borderTop: "1px dashed rgba(0,0,0,0.045)",
                    pointerEvents: "none",
                  }} />
                ))}

                {/* Now indicator */}
                {showNow && (
                  <div style={{
                    position: "absolute",
                    top: nowTop, left: 0, right: 0,
                    height: 2,
                    background: "#B91C1C",
                    zIndex: 5,
                    pointerEvents: "none",
                  }}>
                    {colIdx === 0 && (
                      <div style={{
                        position: "absolute",
                        left: -5, top: -4,
                        width: 10, height: 10,
                        borderRadius: "50%",
                        background: "#B91C1C",
                      }} />
                    )}
                  </div>
                )}

                {/* Drop indicator line + time label */}
                {isDragTarget && dropIndicator && (
                  <>
                    <div style={{
                      position: "absolute",
                      top: (dropIndicator.mins - GRID_START) * PX_PER_MIN,
                      left: 0, right: 0,
                      height: 2,
                      background: "var(--plum-500)",
                      zIndex: 8,
                      pointerEvents: "none",
                    }} />
                    <div style={{
                      position: "absolute",
                      top: (dropIndicator.mins - GRID_START) * PX_PER_MIN - 18,
                      left: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--white)",
                      background: "var(--plum-600)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      zIndex: 9,
                      pointerEvents: "none",
                      letterSpacing: "0.04em",
                    }}>
                      {fmtDropTime(dropIndicator.mins)}
                    </div>
                  </>
                )}

                {/* Appointment blocks */}
                {colApts.map((apt) => {
                  const aptMin = timeToMins(apt.time);
                  const top    = Math.max(0, aptMin - GRID_START) * PX_PER_MIN;
                  const height = Math.max(28, apt.duration * PX_PER_MIN);
                  const done   = apt.status === "completed";
                  const isDragging = dragId === apt.id;

                  return (
                    <div
                      key={apt.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, apt)}
                      onDragEnd={handleDragEnd}
                      onClick={() => { if (!dragId) onAptClick(apt); }}
                      style={{
                        position: "absolute",
                        top: top + 2,
                        height: height - 4,
                        left: 4, right: 4,
                        borderRadius: 8,
                        background: done
                          ? "rgba(0,0,0,0.04)"
                          : apt.tint === "pink"
                          ? "var(--pink-100)"
                          : apt.tint === "champagne"
                          ? "var(--champagne-100)"
                          : "var(--plum-50)",
                        borderLeft: `3px solid ${
                          done
                            ? "var(--ink-300)"
                            : apt.tint === "champagne"
                            ? "var(--champagne-700)"
                            : "var(--plum-500)"
                        }`,
                        padding: "4px 8px",
                        cursor: isDragging ? "grabbing" : "grab",
                        overflow: "hidden",
                        zIndex: isDragging ? 1 : 2,
                        boxShadow: isDragging
                          ? "none"
                          : "0 1px 4px rgba(45,10,31,0.07)",
                        opacity: isDragging ? 0.35 : 1,
                        transition: "opacity 0.1s, box-shadow 0.1s",
                        userSelect: "none",
                      }}
                    >
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: done ? "var(--ink-500)" : "var(--plum-900)",
                        lineHeight: 1.3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {apt.customerName}
                      </div>
                      {height - 4 >= 38 && (
                        <div style={{
                          fontSize: 11,
                          color: done ? "var(--ink-400)" : "var(--plum-600)",
                          lineHeight: 1.3,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 1,
                        }}>
                          {apt.serviceName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

// ── Calendar Page ──────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const calRef = useRef<FullCalendar>(null);
  const [view,       setView]       = useState<ViewType>("timeGridWeek");
  const [titleLabel, setTitleLabel] = useState("");
  const [apts,       setApts]       = useState<CalApt[]>([]);
  const [aptOpen,    setAptOpen]    = useState(false);
  const [detailApt,  setDetailApt]  = useState<CalApt | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduling,   setRescheduling]   = useState(false);
  const [savingId,   setSavingId]   = useState<number | null>(null);
  const [toast,      setToast]      = useState<string | null>(null);

  // Day view
  const [dayViewDate, setDayViewDate] = useState<string>(todayIso);
  const [staffCols,   setStaffCols]   = useState<StaffCol[]>([]);

  // Load staff columns
  useEffect(() => {
    supabase
      .from("staff")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as { id: number; name: string }[];
        setStaffCols([{ id: null, name: "Owner" }, ...rows]);
      });
  }, []);

  // ── Fetch appointments ─────────────────────────────────────────────────────

  const fetchApts = useCallback(async () => {
    let { data, error } = await supabase
      .from("appointments")
      .select("*, customers(name), services(name, price), staff(name)")
      .neq("status", "cancelled")
      .order("date", { ascending: true })
      .order("time", { ascending: true });

    if (error) {
      ({ data, error } = await supabase
        .from("appointments")
        .select("*, customers(name), services(name, price)")
        .neq("status", "cancelled")
        .order("date", { ascending: true })
        .order("time", { ascending: true }));
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    setApts(rows.map((r) => ({
      id:             r.id as number,
      date:           r.date as string,
      time:           ((r.time as string) ?? "00:00").slice(0, 5),
      duration:       (r.duration as number) ?? 60,
      status:         r.status as string,
      notes:          (r.notes as string | null) ?? null,
      tint:           (r.tint as string | null) ?? null,
      customerName:   (r.customers as { name?: string } | null)?.name ?? "Customer",
      customerId:     (r.customer_id as string) ?? "",
      serviceName:    (r.services as { name?: string } | null)?.name ?? "Service",
      servicePrice:   (r.services as { price?: number } | null)?.price ?? 0,
      staffId:        (r.staff_id as number | null) ?? null,
      staffName:      (r.staff as { name?: string } | null)?.name ?? null,
      paymentMethod:  (r.payment_method as string | null) ?? null,
      discountAmount: (r.discount_amount as number) ?? 0,
    })));
  }, []);

  useEffect(() => { fetchApts(); }, [fetchApts]);

  // ── View controls ──────────────────────────────────────────────────────────

  const changeView = (v: ViewType) => {
    if (v === "timeGridDay") {
      const api = calRef.current?.getApi();
      if (api) setDayViewDate(api.getDate().toLocaleDateString("en-CA"));
    } else {
      if (view === "timeGridDay") {
        calRef.current?.getApi().changeView(v, dayViewDate);
      } else {
        calRef.current?.getApi().changeView(v);
      }
    }
    setView(v);
  };

  const goPrev = () => {
    if (view === "timeGridDay") {
      setDayViewDate((prev) => {
        const d = new Date(prev + "T12:00:00");
        d.setDate(d.getDate() - 1);
        return d.toLocaleDateString("en-CA");
      });
      return;
    }
    calRef.current?.getApi().prev();
  };

  const goNext = () => {
    if (view === "timeGridDay") {
      setDayViewDate((prev) => {
        const d = new Date(prev + "T12:00:00");
        d.setDate(d.getDate() + 1);
        return d.toLocaleDateString("en-CA");
      });
      return;
    }
    calRef.current?.getApi().next();
  };

  const goToday = () => {
    if (view === "timeGridDay") { setDayViewDate(todayIso()); return; }
    calRef.current?.getApi().today();
  };

  const handleDatesSet = (info: DatesSetArg) => setTitleLabel(info.view.title);

  const displayLabel =
    view === "timeGridDay"
      ? new Date(dayViewDate + "T12:00:00").toLocaleDateString("en-US", {
          weekday: "long", month: "long", day: "numeric", year: "numeric",
        })
      : titleLabel;

  // ── Event interactions ─────────────────────────────────────────────────────

  const openDetail = (apt: CalApt) => {
    setDetailApt(apt);
    setRescheduleDate(apt.date);
    setRescheduleTime(apt.time);
  };

  const handleEventClick = (arg: EventClickArg) => {
    openDetail(arg.event.extendedProps.apt as CalApt);
  };

  const handleEventDrop = async (arg: EventDropArg) => {
    const apt     = arg.event.extendedProps.apt as CalApt;
    const start   = arg.event.start!;
    const newDate = start.toLocaleDateString("en-CA");
    const newTime = start.toTimeString().slice(0, 5);

    const { error } = await supabase
      .from("appointments")
      .update({ date: newDate, time: newTime })
      .eq("id", apt.id);

    if (error) {
      arg.revert();
      setToast("Couldn't reschedule — please try again");
    } else {
      fetchApts();
      setToast(`${apt.customerName} moved to ${newDate} at ${newTime}`);
    }
  };

  // ── Day-view drag-and-drop ─────────────────────────────────────────────────

  const handleDayDrop = useCallback(async (
    aptId: number,
    newDate: string,
    newTime: string,
    newStaffId: number | null,
  ) => {
    const apt = apts.find((a) => a.id === aptId);
    if (!apt) return;

    // Nothing changed — ignore
    if (apt.time === newTime && apt.staffId === newStaffId) return;

    const payload: Record<string, unknown> = { date: newDate, time: newTime };
    if (newStaffId !== apt.staffId) payload.staff_id = newStaffId;

    const { error } = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", aptId);

    if (error) {
      setToast("Couldn't move appointment — please try again");
      return;
    }

    const staffLabel = newStaffId
      ? staffCols.find((c) => c.id === newStaffId)?.name ?? "staff"
      : "Owner";
    const timeLabel = new Date(`2000-01-01T${newTime}`).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit",
    });

    fetchApts();
    setToast(`${apt.customerName} → ${timeLabel} · ${staffLabel}`);
  }, [apts, staffCols, fetchApts]);

  // ── Reschedule via popup ───────────────────────────────────────────────────

  const doReschedule = async () => {
    if (!detailApt) return;
    setRescheduling(true);
    const { error } = await supabase
      .from("appointments")
      .update({ date: rescheduleDate, time: rescheduleTime })
      .eq("id", detailApt.id);
    setRescheduling(false);

    if (error) {
      setToast("Couldn't reschedule — please try again");
    } else {
      setDetailApt(null);
      fetchApts();
      setToast("Appointment rescheduled");
    }
  };

  // ── Status change ──────────────────────────────────────────────────────────

  const changeStatus = useCallback(async (
    apt: CalApt,
    newStatus: string,
    payment?: { method: string; discount: number },
  ) => {
    if (apt.status === newStatus) return;
    setSavingId(apt.id);

    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (payment && newStatus === "completed") {
      updatePayload.payment_method  = payment.method;
      updatePayload.discount_amount = payment.discount;
    }

    const { error } = await supabase
      .from("appointments")
      .update(updatePayload)
      .eq("id", apt.id);

    if (error) {
      setSavingId(null);
      setToast("Couldn't update — please try again");
      return;
    }

    if (newStatus === "completed" && apt.customerId) {
      const { data: cust } = await supabase
        .from("customers")
        .select("visits, total_spend")
        .eq("id", apt.customerId)
        .single();

      if (cust) {
        await supabase.from("customers").update({
          visits:          ((cust as { visits?: number }).visits ?? 0) + 1,
          total_spend:
            ((cust as { total_spend?: number }).total_spend ?? 0) + apt.servicePrice,
          last_visit_date: apt.date,
        }).eq("id", apt.customerId);
      }
    }

    setSavingId(null);
    setDetailApt(null);
    fetchApts();
    setToast(
      newStatus === "completed"   ? "Marked complete — customer stats updated"
      : newStatus === "cancelled" ? "Appointment cancelled"
      : "Appointment confirmed",
    );
  }, [fetchApts]);

  const events = apts.map(aptToEvent);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-app page-calendar">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">Your schedule</div>
              <h1 className="page-title">Calendar</h1>
              <p className="page-sub">
                A complete view of the days ahead — every appointment, every
                quiet window, every name worth knowing.
              </p>
            </div>
            <div className="header-actions">
              <div className="seg-toggle">
                {(["dayGridMonth", "timeGridWeek", "timeGridDay"] as ViewType[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`seg-btn ${view === v ? "active" : ""}`}
                    onClick={() => changeView(v)}
                  >
                    {VIEW_LABELS[v]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setAptOpen(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New appointment
              </button>
            </div>
          </div>
        </div>

        {/* ── Nav toolbar ── */}
        <div className="cal-toolbar">
          <div className="cal-date-nav">
            <button type="button" className="cal-nav-btn" aria-label="Previous" onClick={goPrev}>
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="cal-nav-label">{displayLabel}</span>
            <button type="button" className="cal-nav-btn" aria-label="Next" onClick={goNext}>
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={goToday}>
            Today
          </button>
        </div>

        {/* ── Custom Staff Day View ── */}
        {view === "timeGridDay" && (
          <div className="cal-card" style={{ padding: 0, overflow: "hidden" }}>
            <StaffDayView
              date={dayViewDate}
              apts={apts.filter((a) => a.date === dayViewDate)}
              staffCols={staffCols}
              onAptClick={openDetail}
              onAptDrop={handleDayDrop}
            />
          </div>
        )}

        {/* ── FullCalendar (Month + Week) ── */}
        <div
          className="cal-card"
          style={{ display: view === "timeGridDay" ? "none" : undefined }}
        >
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            headerToolbar={false}
            events={events}
            editable
            eventDrop={handleEventDrop}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            height="auto"
            slotMinTime="07:00:00"
            slotMaxTime="21:00:00"
            allDaySlot={false}
            nowIndicator
            slotDuration="00:30:00"
            slotLabelInterval="01:00:00"
            expandRows
            firstDay={1}
            eventContent={(info) => {
              const apt = info.event.extendedProps.apt as CalApt;
              return (
                <div className="fc-event-inner">
                  <div className="fc-event-customer">{apt.customerName}</div>
                  <div className="fc-event-service">{apt.serviceName}</div>
                </div>
              );
            }}
          />
        </div>
      </main>

      <MobileTabBar active="calendar" />

      <AppointmentFormModal
        open={aptOpen}
        onClose={() => setAptOpen(false)}
        onSave={() => fetchApts()}
      />

      <AppointmentDetailModal
        open={!!detailApt}
        onClose={() => setDetailApt(null)}
        appointment={detailApt ? {
          ...detailApt,
          staffName:      detailApt.staffName,
          paymentMethod:  detailApt.paymentMethod,
          discountAmount: detailApt.discountAmount,
        } : null}
        rescheduleDate={rescheduleDate}
        rescheduleTime={rescheduleTime}
        onRescheduleDateChange={setRescheduleDate}
        onRescheduleTimeChange={setRescheduleTime}
        onReschedule={doReschedule}
        rescheduling={rescheduling}
        onStatusChange={(id, newStatus, payment) => {
          const apt = apts.find((a) => a.id === id);
          if (apt) changeStatus(apt, newStatus, payment);
        }}
        saving={savingId === detailApt?.id}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
