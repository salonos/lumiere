"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { humanError } from "@/lib/data";

// Inner component — uses useSearchParams safely inside a Suspense boundary
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setSubmitting(false);
      setError(
        authError.message === "Invalid login credentials"
          ? "That email and password don't match. Please try again."
          : humanError(authError, "We couldn't sign you in. Try again in a moment."),
      );
      return;
    }

    router.replace(redirectTo);
  };

  return (
    <div className="page-login">
      <div className="auth-shell">
        <aside className="auth-left">
          <Link href="/" className="brand-top">
            <span className="brand-dot" />
            <span className="brand-mark">Lumière</span>
          </Link>

          <div className="auth-content">
            <div className="auth-eyebrow">For salons who care</div>
            <h1 className="auth-headline">
              A quieter way to <em>run your salon.</em>
            </h1>
            <div className="auth-divider" />
            <p className="auth-body">
              Bookings without phone calls. Reminders that prevent no-shows.
              Customer notes that never get lost. Built for Sri Lankan salons
              that take pride in their craft.
            </p>
          </div>

          <div className="auth-footer-left">
            <div className="testimonial">
              <p className="testimonial-quote">
                &ldquo;Four no-shows quietly prevented this month. That is
                twelve thousand rupees that stayed in my pocket.&rdquo;
              </p>
              <div className="testimonial-author">
                Sandya · Pastel 93, Pannipitiya
              </div>
            </div>
          </div>
        </aside>

        <main className="auth-right">
          <div className="form-shell">
            <Link href="/" className="brand-mobile">
              <span className="brand-dot" />
              Lumière
            </Link>

            <header className="form-header">
              <div className="form-eyebrow">Welcome back</div>
              <h2 className="form-title">Sign in to your salon.</h2>
              <p className="form-sub">
                Contact your administrator to get access.
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
                  <a href="#" className="field-link">
                    Forgot?
                  </a>
                </div>
                <div className="input-wrap">
                  <input
                    id="password"
                    className="input"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
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

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me on this device
              </label>

              <button
                className="btn-submit"
                type="submit"
                disabled={submitting || !email || !password}
              >
                {submitting ? "Signing in…" : "Sign in"}
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
              Need help? <a href="#">Talk to someone</a> or read{" "}
              <a href="#">getting started</a>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

// Outer page shell — wraps LoginForm in Suspense so Next.js can
// statically prerender this page without hitting the useSearchParams() error.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
