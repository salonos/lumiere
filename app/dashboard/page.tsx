import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import AppointmentRow from "@/components/AppointmentRow";
import StatCard from "@/components/StatCard";
import NewAppointmentButton from "@/components/NewAppointmentButton";
import { createSupabaseServer } from "@/lib/supabase-server";
import { lkr } from "@/lib/data";

type Chip = { label: string; variant: "success" | "warning" | "plum" | "pink" };

function calcEndTime(startTime: string, minutes: number): string {
  const t = startTime.slice(0, 5);
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  return `${minutes} min`;
}

function buildChips(apt: {
  status: string;
  customers?: { visits?: number; tags?: string[] } | null;
}): Chip[] {
  const chips: Chip[] = [];
  const tags: string[] = Array.isArray(apt.customers?.tags) ? (apt.customers!.tags as string[]) : [];
  const visits: number = apt.customers?.visits ?? 0;

  if (visits <= 1) {
    chips.push({ label: "First visit", variant: "pink" });
    return chips;
  }

  if (apt.status === "confirmed") chips.push({ label: "Confirmed", variant: "success" });
  else if (apt.status === "pending") chips.push({ label: "Pending reply", variant: "warning" });

  if (tags.includes("Sensitive / Allergic")) {
    chips.push({ label: "Sensitive / Allergic", variant: "pink" });
  } else if (tags.includes("VIP")) {
    chips.push({ label: `VIP · ${visits} visits`, variant: "plum" });
  } else if (visits >= 3) {
    chips.push({ label: `Regular · ${visits} visits`, variant: "plum" });
  }

  return chips;
}

function buildSubtitle(total: number, newFaces: number, quietCount: number): string {
  if (total === 0) return "No appointments scheduled for today — a quiet morning to catch up.";
  const parts: string[] = [];
  parts.push(`${total === 1 ? "One appointment" : `${total} appointments`} on the books today.`);
  if (newFaces === 1) parts.push("One new face coming in.");
  else if (newFaces > 1) parts.push(`${newFaces} new faces coming in.`);
  if (quietCount === 1) parts.push("And one customer who would love to hear from you.");
  else if (quietCount > 1) parts.push(`And ${quietCount} customers who would love to hear from you.`);
  return parts.join(" ");
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default async function DashboardPage() {
  const supabase = createSupabaseServer();

  // Resolve the signed-in owner's name for the greeting
  const { data: { user } } = await supabase.auth.getUser();
  const { data: salonUser } = user
    ? await supabase
        .from("salon_users")
        .select("full_name")
        .eq("user_id", user.id)
        .single()
    : { data: null };
  const ownerName =
    (salonUser as { full_name?: string } | null)?.full_name?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${mo}-${d}`;
  const dateLabel = `${DOW[now.getDay()]} · ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const hour = now.getHours();
  const greetingWord = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Today's appointments ────────────────────────────────────────────────
  const { data } = await supabase
    .from("appointments")
    .select("*, customers(*), services(*)")
    .eq("date", today)
    .neq("status", "cancelled")
    .order("time", { ascending: true });

  const rows = (data ?? []).map((apt) => {
    const rawTime: string = (apt as { time?: string }).time ?? "00:00";
    const time = rawTime.slice(0, 5);
    const duration: number =
      (apt as { duration?: number }).duration ??
      ((apt as { services?: { duration?: number } }).services?.duration) ??
      60;
    const serviceName: string =
      (apt as { services?: { name?: string } }).services?.name ?? "Service";
    return {
      startTime: time,
      endTime: calcEndTime(time, duration),
      customerName:
        (apt as { customers?: { name?: string } }).customers?.name ?? "Customer",
      service: `${serviceName} · ${formatDuration(duration)}`,
      chips: buildChips(apt as Parameters<typeof buildChips>[0]),
      customerId: (apt as { customer_id?: string }).customer_id ?? undefined,
      phone: (apt as { customers?: { phone?: string | null } }).customers?.phone ?? null,
    };
  });

  // Count using raw status — not chips — so confirmed first-timers are included
  const confirmedCount = (data ?? []).filter(
    (a) => (a as { status?: string }).status === "confirmed"
  ).length;
  const pendingCount = (data ?? []).filter(
    (a) => (a as { status?: string }).status === "pending"
  ).length;
  const newFaceCount = rows.filter((r) => r.chips.some((c) => c.label === "First visit")).length;

  // ── Customers worth a message (gone quiet > 8 weeks) ───────────────────
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - 56);
  const cutoff = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, "0")}-${String(cutoffDate.getDate()).padStart(2, "0")}`;

  const { data: quietData } = await supabase
    .from("customers")
    .select("id, name, last_visit_date")
    .not("last_visit_date", "is", null)
    .lt("last_visit_date", cutoff)
    .order("last_visit_date", { ascending: true })
    .limit(3);

  type PeekItem = { id: string; initials: string; name: string; meta: string };

  const peekItems: PeekItem[] = (quietData ?? []).map((c) => {
    const name = (c as { name?: string }).name ?? "Customer";
    const id = (c as { id?: string }).id ?? "";
    const lv = (c as { last_visit_date?: string }).last_visit_date;
    const initials = name
      .split(/\s+/)
      .map((n: string) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
    let meta = "Hasn't visited recently";
    if (lv) {
      const daysAgo = Math.round(
        (now.getTime() - new Date(lv).getTime()) / (1000 * 60 * 60 * 24)
      );
      const weeksAgo = Math.max(1, Math.round(daysAgo / 7));
      meta = `Last visit ${weeksAgo} week${weeksAgo !== 1 ? "s" : ""} ago`;
    }
    return { id, initials, name, meta };
  });

  const subtitle = buildSubtitle(rows.length, newFaceCount, peekItems.length);

  // ── Weekly revenue (current + last week for delta) ─────────────────────
  const dow = now.getDay(); // 0 = Sunday
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - dow);
  const wkStart = `${weekStartDate.getFullYear()}-${String(weekStartDate.getMonth() + 1).padStart(2, "0")}-${String(weekStartDate.getDate()).padStart(2, "0")}`;
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  const wkEnd = `${weekEndDate.getFullYear()}-${String(weekEndDate.getMonth() + 1).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}`;

  const lastWkStartDate = new Date(weekStartDate);
  lastWkStartDate.setDate(weekStartDate.getDate() - 7);
  const lwkStart = `${lastWkStartDate.getFullYear()}-${String(lastWkStartDate.getMonth() + 1).padStart(2, "0")}-${String(lastWkStartDate.getDate()).padStart(2, "0")}`;
  const lastWkEndDate = new Date(weekEndDate);
  lastWkEndDate.setDate(weekEndDate.getDate() - 7);
  const lwkEnd = `${lastWkEndDate.getFullYear()}-${String(lastWkEndDate.getMonth() + 1).padStart(2, "0")}-${String(lastWkEndDate.getDate()).padStart(2, "0")}`;

  // This month's revenue range
  const monthStart = `${y}-${mo}-01`;
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

  const [{ data: wkRevData }, { data: lwkRevData }, { data: monthRevData }] = await Promise.all([
    supabase
      .from("appointments")
      .select("services(price)")
      .gte("date", wkStart)
      .lte("date", wkEnd)
      .eq("status", "completed"),
    supabase
      .from("appointments")
      .select("services(price)")
      .gte("date", lwkStart)
      .lte("date", lwkEnd)
      .eq("status", "completed"),
    supabase
      .from("appointments")
      .select("services(price)")
      .gte("date", monthStart)
      .lte("date", monthEnd)
      .eq("status", "completed"),
  ]);

  const weekRevenue = (wkRevData ?? []).reduce(
    (sum, a) => sum + ((a as { services?: { price?: number } }).services?.price ?? 0),
    0,
  );
  const lastWeekRevenue = (lwkRevData ?? []).reduce(
    (sum, a) => sum + ((a as { services?: { price?: number } }).services?.price ?? 0),
    0,
  );
  const monthRevenue = (monthRevData ?? []).reduce(
    (sum, a) => sum + ((a as { services?: { price?: number } }).services?.price ?? 0),
    0,
  );
  const monthAppointments = (monthRevData ?? []).length;
  const revenueDelta =
    lastWeekRevenue > 0
      ? Math.round(((weekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
      : null;

  return (
    <div className="page-app page-dashboard">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">{dateLabel}</div>
              <h1 className="page-title">{greetingWord}, {ownerName}.</h1>
              <p className="page-sub">{subtitle}</p>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/calendar" className="btn btn-secondary">
                View calendar
              </Link>
              <NewAppointmentButton />
            </div>
          </div>
        </div>

        <div className="stat-band">
          <StatCard
            label="Today · Appointments"
            value={String(rows.length)}
            meta={`${confirmedCount} confirmed · ${pendingCount} awaiting reply`}
          />
          <StatCard
            label="This week · Revenue"
            value={weekRevenue > 0 ? lkr(weekRevenue) : "—"}
            meta={
              revenueDelta !== null ? (
                <>
                  <span className={revenueDelta >= 0 ? "delta-up" : "delta-down"}>
                    {revenueDelta >= 0 ? "↑" : "↓"} {Math.abs(revenueDelta)}%
                  </span>{" "}
                  vs last week
                </>
              ) : weekRevenue === 0 ? (
                "No completed appointments yet this week"
              ) : (
                "No data from last week to compare"
              )
            }
          />
          <StatCard
            label={`This month · ${MONTHS[now.getMonth()]}`}
            value={monthRevenue > 0 ? lkr(monthRevenue) : "—"}
            meta={
              monthAppointments > 0
                ? `${monthAppointments} completed appointment${monthAppointments !== 1 ? "s" : ""}`
                : "No completed appointments yet"
            }
          />
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Today&rsquo;s appointments</h2>
            <div className="section-aside">
              {rows.length} booked · <strong>{confirmedCount} confirmed</strong>{" "}
              · {pendingCount} awaiting reply
            </div>
          </div>

          <div className="timeline">
            {rows.length === 0 ? (
              <div style={{
                padding: "40px 24px",
                textAlign: "center",
                background: "var(--cream)",
                border: "1px dashed var(--ink-200)",
                borderRadius: 14,
              }}>
                <div style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: 18,
                  color: "var(--plum-900)",
                  fontWeight: 500,
                  marginBottom: 6,
                }}>
                  A quiet day ahead
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 16, lineHeight: 1.5 }}>
                  Nothing on the books today. Use this time to catch up,
                  or book a customer in.
                </div>
                <NewAppointmentButton />
              </div>
            ) : (
              rows.map((apt) => (
                <AppointmentRow key={apt.startTime + apt.customerName} {...apt} />
              ))
            )}
          </div>
        </section>

        <div className="two-col">
          <section className="section" style={{ margin: 0 }}>
            <div className="section-head">
              <h2 className="section-title">Worth a message</h2>
              <div className="section-aside">
                Customers you haven&rsquo;t seen in a while
              </div>
            </div>
            <div className="peek">
              {peekItems.length === 0 ? (
                <p style={{ padding: "20px 0", opacity: 0.5, fontSize: 13 }}>
                  Everyone&rsquo;s been in recently — no quiet customers right now.
                </p>
              ) : (
                <div className="peek-list">
                  {peekItems.map((item) => (
                    <div className="peek-item" key={item.id}>
                      <div className="peek-avatar">{item.initials}</div>
                      <div style={{ flex: 1 }}>
                        <div className="peek-name">{item.name}</div>
                        <div className="peek-meta">{item.meta}</div>
                      </div>
                      <Link
                        href={`/customers/${item.id}`}
                        className="btn btn-secondary"
                        style={{ padding: "7px 16px", fontSize: 12 }}
                      >
                        Send note
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="section" style={{ margin: 0 }}>
            <div className="pull-quote">
              <div className="pq-text">
                {monthRevenue > 0 ? (
                  <>
                    {lkr(monthRevenue)} earned this month across{" "}
                    {monthAppointments} completed appointment
                    {monthAppointments !== 1 ? "s" : ""}.
                  </>
                ) : (
                  <>A fresh month ahead — mark appointments complete to watch this number grow.</>
                )}
              </div>
              <div className="pq-meta">{MONTHS[now.getMonth()]} · in numbers</div>
            </div>
          </section>
        </div>
      </main>

      <MobileTabBar />
    </div>
  );
}
