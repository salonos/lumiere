"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  message: string | null;
  /** Auto-dismiss in ms. Default 2800. */
  duration?: number;
  onDone?: () => void;
};

/**
 * Single, lightweight toast — same family as the modal. Lower volume.
 * Animates in and out; clears itself.
 */
export default function Toast({ message, duration = 2800, onDone }: Props) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    setClosing(false);
    const close = window.setTimeout(() => setClosing(true), duration - 180);
    const done  = window.setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => {
      window.clearTimeout(close);
      window.clearTimeout(done);
    };
  }, [message, duration, onDone]);

  if (typeof document === "undefined") return null;
  if (!visible || !message) return null;

  return createPortal(
    <div className="toast-host" aria-live="polite">
      <div className={`toast ${closing ? "closing" : ""}`}>{message}</div>
    </div>,
    document.body,
  );
}
