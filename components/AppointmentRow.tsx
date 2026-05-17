"use client";

import { useRouter } from "next/navigation";

type Chip = {
  label: string;
  variant: "success" | "warning" | "plum" | "pink";
};

type Props = {
  startTime: string;
  endTime: string;
  customerName: string;
  service: string;
  chips: Chip[];
  customerId?: string;
  phone?: string | null;
};

const chipClass: Record<Chip["variant"], string> = {
  success: "chip chip-success",
  warning: "chip chip-warning",
  plum: "chip chip-plum",
  pink: "chip chip-pink",
};

export default function AppointmentRow({
  startTime,
  endTime,
  customerName,
  service,
  chips,
  customerId,
  phone,
}: Props) {
  const router = useRouter();

  const openWhatsApp = () => {
    if (!phone) return;
    const digits = phone.replace(/\D/g, "");
    window.open(`https://wa.me/${digits}`, "_blank");
  };

  return (
    <div className="apt">
      <div>
        <div className="apt-time">{startTime}</div>
        <div className="apt-time-meta">— {endTime}</div>
      </div>
      <div className="apt-body">
        <div className="apt-name">{customerName}</div>
        <div className="apt-service">{service}</div>
        <div className="apt-meta">
          {chips.map((chip, i) => (
            <span key={i} className={chipClass[chip.variant]}>
              {chip.label}
            </span>
          ))}
        </div>
      </div>
      <div className="apt-actions">
        <button
          className="icon-btn"
          type="button"
          aria-label="Message on WhatsApp"
          title={phone ? "Message on WhatsApp" : "No phone number on file"}
          onClick={openWhatsApp}
          disabled={!phone}
          style={!phone ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
        >
          <svg viewBox="0 0 24 24">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label="View customer profile"
          title={customerId ? "View customer profile" : "No customer linked"}
          onClick={() => customerId && router.push(`/customers/${customerId}`)}
          disabled={!customerId}
          style={!customerId ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
        >
          <svg viewBox="0 0 24 24">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
