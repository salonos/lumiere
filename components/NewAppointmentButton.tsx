"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AppointmentFormModal from "./AppointmentFormModal";

export default function NewAppointmentButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => setOpen(true)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New appointment
      </button>
      <AppointmentFormModal
        open={open}
        onClose={() => setOpen(false)}
        onSave={() => router.refresh()}
      />
    </>
  );
}
