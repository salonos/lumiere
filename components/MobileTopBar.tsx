"use client";

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

export default function MobileTopBar() {
  const [initials, setInitials] = useState<string>("··");

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

  return (
    <div className="mobile-top">
      <button className="menu-btn" type="button" aria-label="Open menu">
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
      <div className="brand" style={{ margin: 0, fontSize: 22 }}>
        <span className="brand-dot" />
        Lumière
      </div>
      <div
        className="user-avatar"
        style={{ width: 32, height: 32, fontSize: 12 }}
        aria-label="Your account"
      >
        {initials}
      </div>
    </div>
  );
}
