"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { lkr } from "@/lib/data";

type Salon = {
  id: string;
  name: string;
  city: string | null;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
};

type Service = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  duration: number;
  price: number;
};

export default function BookingPage() {
  const params = useParams();
  const slug = (params?.salon as string) ?? "";

  const [loading, setLoading] = useState(true);
  const [salon, setSalon] = useState<Salon | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) return;

      const { data: s } = await supabase
        .from("salons")
        .select("id, name, city, tagline, address, phone, whatsapp")
        .eq("booking_slug", slug)
        .maybeSingle();

      if (cancelled) return;

      if (!s) {
        setLoading(false);
        return;
      }

      setSalon(s as Salon);

      const { data: svc } = await supabase
        .from("services")
        .select("id, name, category, description, duration, price")
        .eq("salon_id", (s as Salon).id)
        .eq("enabled", true)
        .order("category")
        .order("name");

      if (cancelled) return;
      const list = (svc as Service[] | null) ?? [];
      setServices(list);
      if (list.length > 0) setSelectedService(list[0].id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (!loading && !salon) {
    return (
      <div className="page-booking" style={{ padding: "120px 24px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 32, color: "var(--plum-900)" }}>
          We couldn&rsquo;t find that salon.
        </h1>
        <p style={{ marginTop: 16, color: "var(--ink-500)", fontSize: 14 }}>
          The booking link may have changed. Please ask the salon for their current link.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-booking" style={{ padding: "120px 24px", textAlign: "center", color: "var(--ink-400)" }}>
        Loading…
      </div>
    );
  }

  const s = salon!;
  const selected = services.find((sv) => sv.id === selectedService);
  const monogram = s.name?.[0]?.toUpperCase() ?? "·";
  const waNumber = (s.whatsapp || s.phone || "").replace(/\D/g, "");
  const waMessage = selected
    ? `Hi ${s.name}, I'd like to book a ${selected.name} (${selected.duration} min, ${lkr(selected.price)}).`
    : `Hi ${s.name}, I'd like to book an appointment.`;
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`
    : null;

  return (
    <div className="page-booking">
      <header className="topbar">
        <div className="salon-mark">
          <div className="salon-monogram">{monogram}</div>
          <div>
            <div className="salon-name">{s.name}</div>
            {s.city && <div className="salon-location">{s.city}</div>}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-eyebrow">Book online · open 24 hours</div>
        <h1 className="hero-title">
          Your time, <em>respected.</em>
          <br />
          Your service, <em>remembered.</em>
        </h1>
        <div className="hero-divider" />
        <p className="hero-sub">
          {s.tagline ||
            "Pick a service below and message us on WhatsApp to confirm a time."}
        </p>
      </section>

      <div className="booking-shell">
        <div className="section-eyebrow">Step one</div>
        <h2 className="section-headline">Choose your service</h2>
        <p className="section-tag">
          From a quiet trim to a full afternoon of care.
        </p>

        {services.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--ink-400)",
              border: "1px dashed var(--ink-200)",
              borderRadius: 14,
              fontSize: 14,
            }}
          >
            This salon hasn&rsquo;t published any services yet.
          </div>
        ) : (
          <div className="services">
            {services.map((svc) => (
              <div
                key={svc.id}
                className={`service-card${selectedService === svc.id ? " selected" : ""}`}
                onClick={() => setSelectedService(svc.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedService(svc.id);
                  }
                }}
              >
                {svc.category && <div className="service-category">{svc.category}</div>}
                <div className="service-name">{svc.name}</div>
                {svc.description && (
                  <div className="service-desc">{svc.description}</div>
                )}
                <div className="service-meta">
                  <div className="service-duration">{svc.duration} min</div>
                  <div className="service-price">{lkr(svc.price)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="summary" style={{ marginTop: 40 }}>
            <div className="summary-eyebrow">Your selection</div>
            <div className="summary-row">
              <div className="summary-label">Service</div>
              <div className="summary-value">{selected.name}</div>
            </div>
            <div className="summary-row">
              <div className="summary-label">Duration</div>
              <div className="summary-value">{selected.duration} min</div>
            </div>
            <div className="summary-row summary-total">
              <div className="summary-label">Total</div>
              <div className="summary-value">{lkr(selected.price)}</div>
            </div>
          </div>
        )}

        <div className="confirm-row" style={{ marginTop: 24 }}>
          {waLink ? (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="btn-confirm"
              style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
              </svg>
              Message us on WhatsApp
            </a>
          ) : (
            <div style={{ color: "var(--ink-400)", fontSize: 13 }}>
              No contact number on file for this salon yet.
            </div>
          )}
        </div>

        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "var(--ink-500)",
            marginTop: 24,
            fontStyle: "italic",
          }}
        >
          We&rsquo;ll reply to confirm your time. Self-service slot booking is
          on the way.
        </p>
      </div>

      <footer className="footer">
        <div className="footer-mark">{s.name}</div>
        {s.tagline && <div className="footer-tag">{s.tagline}</div>}
        <div className="footer-divider" />
        <div className="footer-meta">
          {s.address && (<>{s.address}<br /></>)}
          {s.phone && <>{s.phone}</>}
        </div>
      </footer>
    </div>
  );
}
