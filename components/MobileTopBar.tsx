"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const NAV_ITEMS: { href: string; label: string; section: string }[] = [
  { section: "Today", href: "/dashboard", label: "Dashboard" },
  { section: "Today", href: "/calendar", label: "Calendar" },
  { section: "Today", href: "/customers", label: "Customers" },
  { section: "Manage", href: "/services", label: "Services" },
  { section: "Manage", href: "/staff", label: "Staff" },
  { section: "Manage", href: "/reminders", label: "Reminders" },
  { section: "Manage", href: "/reports", label: "Reports" },
  { section: "Manage", href: "/payroll", label: "Payroll" },
  { section: "Setup", href: "/settings", label: "Settings" },
];

export default function MobileTopBar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [initials, setInitials] = useState<string>("··");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("salon_users")
        .select("full_name")
        .eq("user_id", user.id)
        .single();
      if (cancelled) return;
      const name =
        (data as { full_name?: string } | null)?.full_name ||
        user.email?.split("@")[0] ||
        "";
      if (name) setInitials(initialsOf(name));
    })();
    return () => { cancelled = true; };
  }, []);

  // Close drawer when route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const sections = ["Today", "Manage", "Setup"];

  return (
    <>
      <div className="mobile-top">
        <button
          className="menu-btn"
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link href="/dashboard" className="brand" style={{ margin: 0, fontSize: 22 }}>
          <span className="brand-dot" />
          Lumière
        </Link>
        <div
          className="user-avatar"
          style={{ width: 32, height: 32, fontSize: 12 }}
          aria-label="Your account"
        >
          {initials}
        </div>
      </div>

      {drawerOpen && (
        <>
          <div
            className="mobile-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside className="mobile-drawer" role="dialog" aria-label="Navigation">
            <div className="mobile-drawer-head">
              <div className="brand" style={{ margin: 0, fontSize: 22 }}>
                <span className="brand-dot" />
                Lumière
              </div>
              <button
                className="menu-btn"
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="mobile-drawer-nav">
              {sections.map((section) => (
                <div key={section}>
                  <div className="nav-section-label">{section}</div>
                  {NAV_ITEMS.filter((i) => i.section === section).map((item) => {
                    const active =
                      pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={active ? "mobile-drawer-link active" : "mobile-drawer-link"}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className="mobile-drawer-foot">
              <button
                type="button"
                className="mobile-drawer-signout"
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/login");
                  router.refresh();
                }}
              >
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
