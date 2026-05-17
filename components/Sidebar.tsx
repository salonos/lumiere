"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SalonInfo = {
  name: string;
  city: string | null;
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  const [ownerName, setOwnerName] = useState<string>("…");
  const [salon, setSalon] = useState<SalonInfo | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Load logged-in user + their salon
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("salon_users")
        .select("full_name, salons(name, city)")
        .eq("user_id", user.id)
        .single();

      if (cancelled) return;

      // Supabase types the join as an array; normalise to a single row.
      const raw = data as unknown as {
        full_name?: string;
        salons?:
          | { name?: string; city?: string | null }
          | { name?: string; city?: string | null }[]
          | null;
      } | null;
      const name =
        raw?.full_name ||
        user.email?.split("@")[0] ||
        "Salon owner";
      const s = Array.isArray(raw?.salons) ? raw?.salons[0] : raw?.salons;

      setOwnerName(name);
      setSalon(s ? { name: s.name ?? "Salon", city: s.city ?? null } : null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const cls = (path: string) =>
    pathname === path || pathname.startsWith(path + "/") ? "active" : undefined;

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">
        <span className="brand-dot" />
        Lumière
      </Link>

      <nav className="nav">
        <div className="nav-section-label">Today</div>
        <Link href="/dashboard" className={cls("/dashboard")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Dashboard
        </Link>
        <Link href="/calendar" className={cls("/calendar")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Calendar
        </Link>
        <Link href="/customers" className={cls("/customers")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Customers
        </Link>

        <div className="nav-section-label" style={{ marginTop: 24 }}>
          Manage
        </div>
        <Link href="/services" className={cls("/services")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z" />
          </svg>
          Services
        </Link>
        <Link href="/staff" className={cls("/staff")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="23" y1="11" x2="17" y2="11" />
            <line x1="20" y1="8" x2="20" y2="14" />
          </svg>
          Staff
        </Link>
        <Link href="/reminders" className={cls("/reminders")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Reminders
        </Link>
        <Link href="/reports" className={cls("/reports")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M3 3h18v18H3z" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          Reports
        </Link>
        <Link href="/payroll" className={cls("/payroll")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" />
            <path d="M6 12h.01M18 12h.01" />
          </svg>
          Payroll
        </Link>

        <div className="nav-section-label" style={{ marginTop: 24 }}>
          Setup
        </div>
        <Link href="/settings" className={cls("/settings")}>
          <svg className="nav-icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </Link>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className="user-tile"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            background: "none",
            border: "none",
            width: "100%",
            textAlign: "left",
            padding: 0,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            position: "relative",
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <div className="user-avatar">
            {ownerName !== "…" ? initialsOf(ownerName) : "··"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{ownerName}</div>
            <div className="user-role">
              {salon ? `${salon.name}${salon.city ? ` · ${salon.city}` : ""}` : "—"}
            </div>
          </div>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              color: "var(--ink-400)",
              transform: menuOpen ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            style={{
              marginTop: 10,
              padding: 6,
              border: "1px solid var(--ink-100)",
              borderRadius: 10,
              background: "var(--white)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={signingOut}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: "none",
                background: "transparent",
                color: "#A53A2C",
                fontSize: 13,
                borderRadius: 6,
                cursor: signingOut ? "wait" : "pointer",
                letterSpacing: "0.02em",
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
