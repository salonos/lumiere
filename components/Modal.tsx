"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: ReactNode;
  destructive?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
  /** initial focus selector (within the modal). Defaults to first focusable. */
  initialFocus?: string;
};

/**
 * Generic editorial modal.
 * - Overlay click + Escape close.
 * - Body scroll locked while open.
 * - Closing animation runs before unmount.
 * - Below 640px it becomes a bottom sheet with a top handle.
 */
export default function Modal({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  destructive = false,
  children,
  footer,
  initialFocus,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  // Mount-on-open / animate-out-on-close
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
    } else if (mounted) {
      setClosing(true);
      const t = window.setTimeout(() => setMounted(false), 200);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  // Body scroll lock
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  // Escape to close + initial focus
  useEffect(() => {
    if (!mounted || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Initial focus
    const timer = window.setTimeout(() => {
      const root = document.querySelector<HTMLElement>(".modal-shell[data-open='true']");
      if (!root) return;
      const target =
        (initialFocus && root.querySelector<HTMLElement>(initialFocus)) ||
        root.querySelector<HTMLElement>(
          "input:not([type='hidden']), textarea, select, button.btn-primary, button.btn-danger",
        );
      target?.focus();
    }, 60);

    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(timer);
    };
  }, [mounted, closing, onClose, initialFocus]);

  if (!mounted) return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div
      className={`modal-overlay ${closing ? "closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        data-open={!closing}
      >
        <div className="modal-sheet-handle" aria-hidden />
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="modal-head">
          {eyebrow ? (
            <div
              className={`modal-eyebrow ${destructive ? "destructive" : ""}`}
            >
              {eyebrow}
            </div>
          ) : null}
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
          {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
        </div>

        {children ? <div className="modal-body">{children}</div> : null}

        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
