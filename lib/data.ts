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
  // ── Catalogue-extension fields (optional for back-compat with pre-migration rows) ──
  unit_label?: string | null;         // "per nail" / "per finger" — null = flat price
  requires_patch_test?: boolean;       // true = warn before booking
  has_variants?: boolean;              // true = price comes from service_variants
  allows_addons?: boolean;             // true = service_addons can stack onto bookings
};

export type ServiceVariant = {
  id: number;
  service_id: number;
  name: string;
  price: number;
  duration_override: number | null;
  sort_order: number;
  enabled: boolean;
};

export type ServiceAddon = {
  id: number;
  service_id: number;
  name: string;
  price: number;
  unit_label: string | null;
  duration_added: number;
  sort_order: number;
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

// Format an ISO date (YYYY-MM-DD) as "Mon, 14 May" or similar.
export function formatDateShort(iso: string): string {
  const d = parseISODate(iso);
  return `${DOW_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()].slice(0, 3)}`;
}

export function formatDateLong(iso: string): string {
  const d = parseISODate(iso);
  return `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Slug helpers ──────────────────────────────────────────────────────────

/**
 * Generate a URL-safe slug from a string. Lowercases, replaces spaces and
 * punctuation with hyphens, strips leading/trailing hyphens.
 * Used for booking_slug auto-generation when the user leaves it blank.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// ── Error helpers ─────────────────────────────────────────────────────────

/**
 * Translate a raw Supabase/PostgREST error into a sentence a salon owner
 * (not a developer) can understand and act on. Use this whenever you would
 * otherwise show `error.message` in a Toast.
 *
 * Action lives in the second sentence — "please try again", "please refresh",
 * "your account may need a database update", etc.
 */
export function humanError(
  err: { code?: string; message?: string; details?: string; hint?: string } | null | undefined,
  fallback = "Something went wrong — please try again",
): string {
  if (!err) return fallback;
  const msg = (err.message ?? "").toLowerCase();
  const code = err.code ?? "";

  // ── Auth / session ────────────────────────────────────────────────────
  if (code === "PGRST301" || code === "PGRST302" || msg.includes("jwt") || msg.includes("not authenticated")) {
    return "Your session expired — please sign in again.";
  }

  // ── Permissions / RLS ─────────────────────────────────────────────────
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) {
    return "You don't have permission for that — please sign out and back in.";
  }
  // Missing row after RLS-blocked write
  if (code === "PGRST116" || code === "PGRST204") {
    return "We saved nothing — your account may need a quick database update. See db/salons_update_policy.sql.";
  }

  // ── Schema issues (the user's DB is out of sync) ──────────────────────
  if (code === "42703" || msg.includes("column") && msg.includes("does not exist")) {
    return "Your database is missing a column we need. Re-run db/reset.sql or db/opening_hours.sql in Supabase.";
  }
  if (code === "42P01" || msg.includes("relation") && msg.includes("does not exist")) {
    return "A database table is missing. Re-run db/reset.sql in Supabase to set everything up.";
  }

  // ── Constraint violations ─────────────────────────────────────────────
  if (code === "23505" || msg.includes("duplicate key")) {
    return "That already exists — try a different name.";
  }
  if (code === "23502" || msg.includes("violates not-null")) {
    return "A required field is empty — please fill in every required field.";
  }
  if (code === "23514" || msg.includes("check constraint")) {
    return "One of the values isn't valid — please review and try again.";
  }
  if (code === "23503" || msg.includes("foreign key")) {
    return "That refers to something that's been removed — please refresh the page.";
  }

  // ── Data type issues ──────────────────────────────────────────────────
  if (code === "22P02" || msg.includes("invalid input syntax")) {
    return "One of the values is in the wrong format — please check your entries.";
  }
  if (code === "22001" || msg.includes("value too long")) {
    return "One of the values is too long — try shortening it.";
  }

  // ── Network / connectivity ────────────────────────────────────────────
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch failed")) {
    return "Couldn't reach the server — check your internet and try again.";
  }

  // ── Unknown — surface the technical detail so the user can report it ──
  const detail = code || err.message?.slice(0, 60) || "unknown";
  return `${fallback} (error: ${detail})`;
}
