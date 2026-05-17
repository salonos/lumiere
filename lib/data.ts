// Type definitions and pure helpers that are still in use across the app.
// All mock data (customers, services, appointments, reminderTemplates, etc.)
// was removed when the app switched to Supabase as the source of truth.

// ── Service domain types ───────────────────────────────────────────────────

export type ServiceCategory =
  | "Hair"
  | "Skin"
  | "Nails"
  | "Threading"
  | "Bridal"
  | "Massage"
  | "Wax";

export type Service = {
  id: number;
  name: string;
  category: ServiceCategory;
  description: string;
  duration: number;               // minutes
  price: number;                  // LKR
  commission_rate: number | null; // % credited to staff who performed it
  station_type_id: number | null; // which station this service occupies
  enabled: boolean;
};

export const CATEGORY_BLURB: Record<ServiceCategory, string> = {
  Hair:      "Cuts, colour, and care",
  Skin:      "Facials and skin rituals",
  Nails:     "Manicures and nail art",
  Threading: "Brows and shaping",
  Bridal:    "For the day that matters",
  Massage:   "Touch that restores",
  Wax:       "Smooth, clean, and confident",
};

// ── Formatting helpers ─────────────────────────────────────────────────────

export function lkr(amount: number): string {
  return `LKR ${amount.toLocaleString()}`;
}

export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Date helpers (local-tz safe) ───────────────────────────────────────────

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoFromDate(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function startOfWeek(iso: string): Date {
  // Week starts Sunday (to match the mockup)
  const d = parseISODate(iso);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

export function addDays(dt: Date, n: number): Date {
  const d = new Date(dt);
  d.setDate(d.getDate() + n);
  return d;
}

export const DOW_SHORT  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_LONG   = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
