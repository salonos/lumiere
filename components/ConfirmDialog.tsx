"use client";

import type { ReactNode } from "react";
import Modal from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Short context label, shown as eyebrow. Defaults to "Confirm". */
  eyebrow?: string;
  /** Headline. Defaults to a quiet "Remove this?" */
  title?: string;
  /** Body copy — supports inline italic via <em>. */
  body?: ReactNode;
  /** Label of the destructive button. Defaults to "Remove". */
  confirmLabel?: string;
  /** Label of the safe button. Defaults to "Keep". */
  cancelLabel?: string;
};

/**
 * Destructive-confirm dialog. Quiet but serious.
 * - Champagne-tinted eyebrow + outlined trash icon (no red on the title).
 * - Confirm button uses `.btn-danger` (soft red on transparent).
 * - Secondary reads "Keep" by default, never "Cancel".
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  eyebrow = "Confirm removal",
  title = "Remove this?",
  body,
  confirmLabel = "Remove",
  cancelLabel = "Keep",
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={eyebrow}
      title={title}
      subtitle={body}
      destructive
      initialFocus="button.btn-danger"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-icon-wrap">
        <div className="confirm-icon" aria-hidden>
          <svg viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </div>
      </div>
    </Modal>
  );
}
