"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TabKey = "today" | "calendar" | "customers" | "more";

type Props = {
  /** Optional override. If omitted, the active tab is derived from the URL. */
  active?: TabKey;
};

/** Map any pathname to a tab. Anything in /services, /reminders, /reports,
 *  or /settings is grouped under "more". */
function deriveActive(pathname: string): TabKey | undefined {
  if (pathname.startsWith("/dashboard")) return "today";
  if (pathname.startsWith("/calendar"))  return "calendar";
  if (pathname.startsWith("/customers")) return "customers";
  if (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/services") ||
    pathname.startsWith("/reminders") ||
    pathname.startsWith("/reports")
  ) {
    return "more";
  }
  return undefined;
}

export default function MobileTabBar({ active }: Props) {
  const pathname = usePathname() ?? "";
  const current = active ?? deriveActive(pathname);
  const cls = (key: TabKey) => (current === key ? "tab active" : "tab");

  return (
    <nav className="tabbar">
      <Link href="/dashboard" className={cls("today")}>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
        Today
      </Link>
      <Link href="/calendar" className={cls("calendar")}>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
        </svg>
        Calendar
      </Link>
      <Link href="/customers" className={cls("customers")}>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="7" r="4" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </svg>
        Customers
      </Link>
      <Link href="/settings" className={cls("more")}>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82M12 1v6M12 17v6" />
        </svg>
        More
      </Link>
    </nav>
  );
}
