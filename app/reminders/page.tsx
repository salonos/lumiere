"use client";

import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";

// Static descriptions of the templates the system will send.
// Toggling these on/off lives in Settings → Reminders.
const TEMPLATES = [
  {
    title: "Booking confirmation",
    description:
      "Sent the moment a customer books online. Includes appointment time and salon location.",
    preview:
      "Thank you, Niluka. Your appointment is confirmed for Thursday, 15 May at 13:30. We'll see you then.",
  },
  {
    title: "24-hour reminder",
    description:
      "A friendly reminder the day before. Reduces no-shows by 60%.",
    preview:
      "Hi Niluka — just a reminder we're looking forward to seeing you tomorrow at 13:30. Reply if anything has changed.",
  },
  {
    title: `"We miss you" message`,
    description:
      "Sent to customers we haven't seen in 8 weeks. Quiet, never pushy.",
    preview:
      "Niluka, it's been a little while. Whenever you're ready for a refresh, we've kept your usual time slot in mind.",
  },
  {
    title: "Birthday wish",
    description:
      "A simple birthday message on the morning of. No discount required — just kindness.",
    preview:
      "Happy birthday, Niluka. Wishing you a beautiful year ahead.",
  },
];

export default function RemindersPage() {
  return (
    <div className="page-app page-reminders">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">Gentle messages</div>
              <h1 className="page-title">Reminders</h1>
              <p className="page-sub">
                Every message that goes out on your behalf — written quietly,
                in your tone, in Sinhala, Tamil, or English.
              </p>
            </div>
            <div className="header-actions">
            </div>
          </div>
        </div>

        {/* ── Coming soon banner ── */}
        <div
          style={{
            marginBottom: 32,
            padding: "20px 24px",
            background: "var(--cream)",
            border: "1px dashed var(--ink-200)",
            borderRadius: 14,
            display: "flex",
            gap: 16,
            alignItems: "center",
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ color: "var(--plum-700)", flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--plum-900)",
                marginBottom: 2,
              }}
            >
              Reminder sending is on the way
            </div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.5 }}>
              The templates below describe what we&rsquo;ll send. WhatsApp
              delivery and the &ldquo;recently sent&rdquo; log will turn on once
              the messaging integration is connected.
            </div>
          </div>
        </div>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Message templates</h2>
            <div className="section-aside">4 templates ready to send</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {TEMPLATES.map((t) => (
              <div
                key={t.title}
                style={{
                  background: "var(--white)",
                  border: "1px solid var(--ink-100)",
                  borderRadius: 16,
                  padding: "26px 28px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: 22,
                    fontWeight: 500,
                    color: "var(--plum-900)",
                    letterSpacing: "-0.005em",
                    marginBottom: 4,
                  }}
                >
                  {t.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--ink-500)",
                    marginBottom: 14,
                  }}
                >
                  {t.description}
                </div>
                <div
                  style={{
                    background: "var(--cream)",
                    border: "1px dashed var(--ink-100)",
                    borderRadius: 10,
                    padding: "14px 18px",
                    fontSize: 13,
                    color: "var(--ink-700)",
                    fontStyle: "italic",
                    lineHeight: 1.55,
                  }}
                >
                  &ldquo;{t.preview}&rdquo;
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <MobileTabBar />
    </div>
  );
}
