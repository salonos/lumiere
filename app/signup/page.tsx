"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

function SignupForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [salonName, setSalonName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError(null);
    setSubmitting(true);

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (authError) {
      setSubmitting(false);
      setError(
        authError.message.toLowerCase().includes("already registered")
          ? "An account with that email already exists. Try signing in."
          : authError.message,
      );
      return;
    }

    const user = authData.user;
    if (!user) {
      setSubmitting(false);
      setError("Signup failed. Please try again.");
      return;
    }

    // Email confirmation required — session will be null
    if (!authData.session) {
      setEmailSent(true);
      setSubmitting(false);
      return;
    }

    // 2. Create salon + salon_users records via server-side API route.
    //    The route verifies identity and uses the service role key — no RLS issues,
    //    and the service key never touches the browser.
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ salonName: salonName.trim(), fullName: fullName.trim() }),
    });

    if (!res.ok) {
      const { error: apiError } = await res.json().catch(() => ({ error: "Unexpected error." }));
      setSubmitting(false);
      setError(apiError ?? "Could not set up your salon. Please try again.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  };

  const leftPanel = (
    <aside className="auth-left">
      <Link href="/" className="brand-top">
        <span className="brand-dot" />
        <span className="brand-mark">Lumière</span>
      </Link>

      <div className="auth-content">
        <div className="auth-eyebrow">Join 200+ salons</div>
        <h1 className="auth-headline">
          Your salon, <em>beautifully organised.</em>
        </h1>
        <div className="auth-divider" />
        <p className="auth-body">
          Set up takes two minutes. Bookings, reminders, customer notes, and
          reports — all in one quiet place built for Sri Lankan salons.
        </p>
      </div>

      <div className="auth-footer-left">
        <div className="testimonial">
          <p className="testimonial-quote">
            &ldquo;Four no-shows quietly prevented this month. That is twelve
            thousand rupees that stayed in my pocket.&rdquo;
          </p>
          <div className="testimonial-author">
            Sandya · Pastel 93, Pannipitiya
          </div>
        </div>
      </div>
    </aside>
  );

  if (emailSent) {
    return (
      <div className="page-login">
        <div className="auth-shell">
          {leftPanel}
          <main className="auth-right">
            <div className="form-shell">
              <Link href="/" className="brand-mobile">
                <span className="brand-dot" />
                Lumière
              </Link>
              <header className="form-header">
                <div className="form-eyebrow">Almost there</div>
                <h2 className="form-title">Check your inbox.</h2>
                <p className="form-sub" style={{ marginTop: 12 }}>
                  We sent a confirmation link to{" "}
                  <strong style={{ color: "var(--ink-900)" }}>{email}</strong>.
                  Click it to activate your account, then sign in.
                </p>
              </header>
              <p className="auth-footer-right">
                Wrong email? <Link href="/signup">Start over</Link> or{" "}
                <a href="#">contact support</a>.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="page-login">
      <div className="auth-shell">
        {leftPanel}

        <main className="auth-right">
          <div className="form-shell">
            <Link href="/" className="brand-mobile">
              <span className="brand-dot" />
              Lumière
            </Link>

            <header className="form-header">
              <div className="form-eyebrow">Get started free</div>
              <h2 className="form-title">Create your salon account.</h2>
              <p className="form-sub">
                Already have an account?{" "}
                <Link href="/login">Sign in →</Link>
              </p>
            </header>

            <form onSubmit={handleSubmit}>
              {error && (
                <div
                  role="alert"
                  style={{
                    marginBottom: 16,
                    padding: "12px 14px",
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: 10,
                    fontSize: 13,
                    color: "#A53A2C",
                    lineHeight: 1.5,
                  }}
                >
                  {error}
                </div>
              )}

              <div className="field">
                <div className="field-label">
                  <label htmlFor="fullName">Your name</label>
                </div>
                <div className="input-wrap">
                  <input
                    id="fullName"
                    className="input"
                    type="text"
                    placeholder="Sandya Perera"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                  <svg className="input-icon" viewBox="0 0 24 24">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>

              <div className="field">
                <div className="field-label">
                  <label htmlFor="salonName">Salon name</label>
                </div>
                <div className="input-wrap">
                  <input
                    id="salonName"
                    className="input"
                    type="text"
                    placeholder="Pastel 93"
                    value={salonName}
                    onChange={(e) => setSalonName(e.target.value)}
                    autoComplete="organization"
                    required
                  />
                  <svg className="input-icon" viewBox="0 0 24 24">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
              </div>

              <div className="field">
                <div className="field-label">
                  <label htmlFor="email">Email address</label>
                </div>
                <div className="input-wrap">
                  <input
                    id="email"
                    className="input"
                    type="email"
                    placeholder="you@yoursalon.lk"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                  <svg className="input-icon" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
              </div>

              <div className="field">
                <div className="field-label">
                  <label htmlFor="password">Password</label>
                </div>
                <div className="input-wrap">
                  <input
                    id="password"
                    className="input"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <svg className="input-icon" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <button
                    type="button"
                    className="input-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="field">
                <div className="field-label">
                  <label htmlFor="confirmPassword">Confirm password</label>
                </div>
                <div className="input-wrap">
                  <input
                    id="confirmPassword"
                    className="input"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <svg className="input-icon" viewBox="0 0 24 24">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
              </div>

              <button
                className="btn-submit"
                type="submit"
                disabled={
                  submitting ||
                  !fullName ||
                  !salonName ||
                  !email ||
                  !password ||
                  !confirmPassword
                }
              >
                {submitting ? "Creating account…" : "Create account"}
                {!submitting && (
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
                )}
              </button>
            </form>

            <p className="auth-footer-right">
              By creating an account you agree to our{" "}
              <a href="#">terms of service</a>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
