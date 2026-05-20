"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ToastTone = "info" | "success" | "error";

type Props = {
  message: string | null;
  /** Tone — affects color and default duration. Defaults to "info". */
  tone?: ToastTone;
  /** Auto-dismiss in ms. Overrides the tone-based default. */
  duration?: number;
  onDone?: () => void;
};

/**
 * Single, lightweight toast — same family as the modal.
 * Errors stay on screen longer (6s) than info toasts (3.5s) so users
 * have time to read what went wrong and what to do next.
 */
export default function Toast({ message, tone = "info", duration, onDone }: Props) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Errors get a longer default so they can be read
  const effectiveDuration = duration ?? (tone === "error" ? 6000 : 3500);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    setClosing(false);
    const close = window.setTimeout(() => setClosing(true), effectiveDuration - 180);
    const done  = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, effectiveDuration);
    return () => {
      window.clearTimeout(close);
      window.clearTimeout(done);
    };
  }, [message, effectiveDuration, onDone]);

  if (typeof document === "undefined") return null;
  if (!visible || !message) return null;

  return createPortal(
    <div className="toast-host" aria-live={tone === "error" ? "assertive" : "polite"}>
      <div className={`toast toast-${tone} ${closing ? "closing" : ""}`}>{message}</div>
    </div>,
    document.body,
  );
}
