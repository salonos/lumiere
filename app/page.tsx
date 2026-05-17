import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="page-landing">
      <header className="nav">
        <Link href="/" className="nav-brand">
          <span className="nav-dot" />
          Lumière
        </Link>
        <nav className="nav-links">
          <a href="#features" className="nav-link">
            Features
          </a>
          <a href="#how" className="nav-link">
            How it works
          </a>
          <a href="#pricing" className="nav-link">
            Pricing
          </a>
          <a href="#faq" className="nav-link">
            FAQ
          </a>
          <Link href="/login" className="nav-cta">
            Start free trial
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-pill">
            <span className="hero-pill-dot" />
            Built for Sri Lankan salons
          </div>
          <h1 className="hero-title">
            <span className="hero-title-line">Never lose a customer to</span>
            <span className="hero-title-line">
              <em>a missed message</em> again.
            </span>
          </h1>
          <p className="hero-sub">
            A quieter way to run your salon. Bookings without phone calls,
            reminders that prevent no-shows, and customer notes that never get
            lost.
          </p>
          <div className="hero-cta-row">
            <Link href="/login" className="btn-primary-lg">
              Start your free trial
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <Link href="/login" className="btn-secondary-lg">
              Watch a quick tour
            </Link>
          </div>
          <p className="hero-trust">
            14 days free · no card required · cancel anytime
          </p>
        </div>

        <div className="hero-image">
          <div className="hero-frame">
            <div className="hero-frame-bar">
              <div className="hero-frame-dot" />
              <div className="hero-frame-dot" />
              <div className="hero-frame-dot" />
            </div>
            <div className="hero-frame-inner">
              <div className="hero-stat-mini">
                <div className="hero-stat-label">Today · Appointments</div>
                <div className="hero-stat-value">7</div>
                <div className="hero-stat-meta">3 morning · 4 afternoon</div>
              </div>
              <div className="hero-stat-mini">
                <div className="hero-stat-label">This week · Revenue</div>
                <div className="hero-stat-value">LKR 47,500</div>
                <div className="hero-stat-meta">↑ 12% vs last week</div>
              </div>
              <div className="hero-stat-mini">
                <div className="hero-stat-label">No-shows prevented</div>
                <div className="hero-stat-value">LKR 12,000</div>
                <div className="hero-stat-meta">This month, by reminders</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="proof-strip">
        <div className="proof-label">Trusted by salons across Sri Lanka</div>
        <div className="proof-logos">
          <div className="proof-name">Pastel 93</div>
          <div className="proof-name">La Bella</div>
          <div className="proof-name">The Salon</div>
          <div className="proof-name">Aroma Spa</div>
          <div className="proof-name">Glow Studio</div>
        </div>
      </div>

      <section className="problem">
        <div className="container">
          <div className="problem-grid">
            <div>
              <div className="section-eyebrow">The problem</div>
              <h2 className="section-headline">
                Your time is <em>valuable.</em> So is hers.
              </h2>
              <p className="section-lede">
                Every missed reply, every double-booking, every forgotten
                preference — these are not small things. They are the
                difference between a customer who returns and one who quietly
                disappears.
              </p>
              <div className="problem-quote" style={{ marginTop: 32 }}>
                <p className="problem-quote-text">
                  &ldquo;Re-introducing yourself even though you&rsquo;ve been
                  going to the same salon every month.&rdquo;
                </p>
                <div className="problem-quote-meta">
                  — a customer, in our research
                </div>
              </div>
            </div>
            <div className="problem-stats">
              <div className="problem-stat">
                <div className="problem-stat-num">LKR 40K</div>
                <div className="problem-stat-text">
                  Average monthly revenue lost to no-shows by a small salon
                </div>
              </div>
              <div className="problem-stat">
                <div className="problem-stat-num">52%</div>
                <div className="problem-stat-text">
                  of customers wanted to book after hours, and couldn&rsquo;t
                </div>
              </div>
              <div className="problem-stat">
                <div className="problem-stat-num">3 in 4</div>
                <div className="problem-stat-text">
                  customers say they waited despite having an appointment
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="container">
          <div className="features-head">
            <div className="section-eyebrow">Everything you need</div>
            <h2 className="section-headline">
              Built for the way you <em>actually work.</em>
            </h2>
            <p className="section-lede">
              Not another bloated system. Just the four things that change
              everything.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div className="feature-title">Online booking, open 24 hours</div>
              <div className="feature-body">
                A beautiful booking page customers can share, save, and use at
                10pm when they finally remember to book. No app downloads. No
                phone calls.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <div className="feature-title">
                Automatic WhatsApp reminders
              </div>
              <div className="feature-body">
                A gentle reminder lands on her phone the day before. Cuts
                no-shows by 60%. Sends in your tone, in Sinhala, Tamil, or
                English.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="7" r="4" />
                  <path d="M5 21a7 7 0 0 1 14 0" />
                </svg>
              </div>
              <div className="feature-title">
                Customer memory that doesn&rsquo;t fade
              </div>
              <div className="feature-body">
                Every customer&rsquo;s history, preferences, and notes — kept
                quietly, ready when you need them. Never re-introduce a regular
                again.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </div>
              <div className="feature-title">A calm view of your day</div>
              <div className="feature-body">
                Today&rsquo;s appointments at a glance. This week&rsquo;s
                revenue. The customer who&rsquo;s overdue for a visit.
                Everything that matters, nothing that doesn&rsquo;t.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div className="feature-title">No more double-booking</div>
              <div className="feature-body">
                The system knows what you&rsquo;re booked for and when. It will
                gently stop you from creating a conflict — and tell her exactly
                when you&rsquo;re free.
              </div>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M3 3h18v18H3z" />
                  <path d="M3 9h18" />
                  <path d="M9 21V9" />
                </svg>
              </div>
              <div className="feature-title">Numbers that tell a story</div>
              <div className="feature-body">
                See exactly how much you&rsquo;ve saved by stopping no-shows.
                Watch your repeat-customer rate climb. Know what&rsquo;s
                working.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quote-strip">
        <div className="container">
          <p className="big-quote">
            Four no-shows quietly prevented this month. That is twelve thousand
            rupees that stayed in my pocket.
          </p>
          <div className="quote-author-line">
            <div className="quote-author-avatar">SP</div>
            <div className="quote-author-meta">
              <div className="quote-author-name">Sandya Perera</div>
              <div className="quote-author-role">
                Pastel 93 · Pannipitiya
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="container">
          <div className="how-head">
            <div className="section-eyebrow">How it works</div>
            <h2 className="section-headline">
              Up and running in <em>fifteen minutes.</em>
            </h2>
            <p className="section-lede">
              No installation, no training, no learning curve. Just three quiet
              steps.
            </p>
          </div>

          <div className="steps">
            <div className="step">
              <div className="step-num">1</div>
              <h3 className="step-title">Sign up &amp; set up</h3>
              <p className="step-body">
                Tell us your salon name, your services, and your hours. Takes
                about ten minutes on your phone.
              </p>
            </div>
            <div className="step">
              <div className="step-num">2</div>
              <h3 className="step-title">Share your link</h3>
              <p className="step-body">
                Put your booking link in your Instagram bio. Share it on
                WhatsApp. Print it on a card. Customers book themselves.
              </p>
            </div>
            <div className="step">
              <div className="step-num">3</div>
              <h3 className="step-title">Let it work quietly</h3>
              <p className="step-body">
                Reminders go out on their own. No-shows drop. Customers feel
                remembered. You focus on the craft, not the chaos.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="container-narrow">
          <div className="section-eyebrow">Pricing</div>
          <h2 className="section-headline">
            One simple price. <em>Pays for itself.</em>
          </h2>
          <p className="section-lede" style={{ margin: "0 auto" }}>
            If reminders prevent a single no-show, the software has paid for
            itself for the month. After that, everything is upside.
          </p>

          <div className="price-card">
            <div className="price-eyebrow">Lumière Essential</div>
            <div className="price-name">Everything, for one price</div>
            <div className="price-amount">
              <span className="price-currency">LKR</span>2,500
            </div>
            <div className="price-period">per month · billed monthly</div>
            <div className="price-divider" />
            <div className="price-features">
              {[
                "Unlimited bookings and appointments",
                "Beautiful public booking page",
                "Automatic WhatsApp reminders",
                "Customer notes & visit history",
                "Revenue & performance reports",
                "Sinhala, Tamil & English support",
              ].map((feature) => (
                <div className="price-feature" key={feature}>
                  <span className="price-check">
                    <svg viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  {feature}
                </div>
              ))}
            </div>
            <Link
              href="/login"
              className="btn-primary-lg"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Start your free trial
            </Link>
            <p className="price-note">14 days free · no card required</p>
          </div>
        </div>
      </section>

      <section className="faq" id="faq">
        <div className="container">
          <div className="faq-head">
            <div className="section-eyebrow">Questions</div>
            <h2 className="section-headline">
              The things <em>everyone asks.</em>
            </h2>
          </div>

          <div className="faq-list">
            {[
              {
                q: "Do I need a computer to use this?",
                a: "No. It works beautifully on your phone. Most salon owners run their entire business from this on their mobile — no laptop needed.",
              },
              {
                q: "What if my customers don't use the booking page?",
                a: "That's okay. You can still add bookings yourself, send the reminders, and track customer notes. The reminders alone save more than what you pay each month.",
              },
              {
                q: "How long does it take to set up?",
                a: "About fifteen minutes. We'll walk you through it ourselves over WhatsApp, in Sinhala or Tamil if you prefer. You can also do it on your own — the screens explain themselves.",
              },
              {
                q: "Can I cancel any time?",
                a: "Yes. Cancel from your settings page in one tap, no calls, no forms. Your data stays yours for thirty days in case you change your mind.",
              },
              {
                q: "Will the reminders work even if my customer doesn't have the app?",
                a: "Yes. Reminders are sent over WhatsApp — the app they already use. Your customer does not need to download anything.",
              },
              {
                q: "Is my customer data private?",
                a: "Completely. Your customer list is yours alone. We never share it, never sell it, never use it for advertising. It is private by design.",
              },
            ].map((item) => (
              <div className="faq-item" key={item.q}>
                <div className="faq-q">{item.q}</div>
                <div className="faq-a">{item.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="container">
          <div className="section-eyebrow final-eyebrow">Ready when you are</div>
          <h2 className="final-title">
            A salon that <em>respects time.</em>
            <br />
            Starting today.
          </h2>
          <p className="section-lede final-sub">
            Fourteen days free. No card required. Set up in under fifteen
            minutes.
          </p>
          <Link href="/login" className="btn-cream-lg">
            Start your free trial
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <span className="nav-dot" />
              Lumière
            </div>
            <p className="footer-tag">
              A quieter way to run your salon. Built in Colombo, for salons
              across Sri Lanka.
            </p>
          </div>
          <div>
            <div className="footer-col-title">Product</div>
            <a href="#features" className="footer-link">
              Features
            </a>
            <a href="#pricing" className="footer-link">
              Pricing
            </a>
            <a href="#how" className="footer-link">
              How it works
            </a>
            <a href="#faq" className="footer-link">
              FAQ
            </a>
          </div>
          <div>
            <div className="footer-col-title">Company</div>
            <a href="#" className="footer-link">
              About
            </a>
            <a href="#" className="footer-link">
              Stories
            </a>
            <a href="#" className="footer-link">
              Contact
            </a>
            <a href="#" className="footer-link">
              Careers
            </a>
          </div>
          <div>
            <div className="footer-col-title">Legal</div>
            <a href="#" className="footer-link">
              Privacy
            </a>
            <a href="#" className="footer-link">
              Terms
            </a>
            <a href="#" className="footer-link">
              Security
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 Lumière · Made in Sri Lanka with care</div>
          <div>hello@lumiere.lk · +94 77 123 4567</div>
        </div>
      </footer>
    </div>
  );
}
