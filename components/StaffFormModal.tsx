"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";

const ROLES = [
  "Stylist",
  "Nail Technician",
  "Skin Therapist",
  "Massage Therapist",
  "Receptionist",
  "Manager",
  "Other",
];

export type StaffDraft = {
  name: string;
  role: string;
  dob: string;
  salary: number | "";
  active: boolean;
};

export type StaffRow = StaffDraft & { id: number };

const blank: StaffDraft = {
  name: "",
  role: "Stylist",
  dob: "",
  salary: "",
  active: true,
};

type Props = {
  open: boolean;
  staff?: StaffRow;
  onClose: () => void;
  onSave: (draft: StaffDraft, id?: number) => void;
};

export default function StaffFormModal({ open, staff, onClose, onSave }: Props) {
  const isEdit = !!staff;
  const [draft, setDraft] = useState<StaffDraft>(blank);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (staff) {
      setDraft({
        name: staff.name,
        role: staff.role || "Stylist",
        dob: staff.dob || "",
        salary: staff.salary,
        active: staff.active,
      });
    } else {
      setDraft(blank);
    }
  }, [open, staff]);

  const valid = draft.name.trim().length > 0;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave(draft, staff?.id);
    onClose();
  };

  const set = <K extends keyof StaffDraft>(k: K, v: StaffDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={isEdit ? "Edit staff member" : "Add to your team"}
      title={isEdit ? "Update staff details" : "A new member of the team"}
      subtitle={
        isEdit
          ? "Edit any details and save — changes take effect immediately."
          : "Add a staff member to your roster. You can assign them to appointments later."
      }
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!valid && touched}
          >
            {isEdit ? "Save changes" : "Add staff member"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>

        <div className="field">
          <label htmlFor="sf-name">Full name</label>
          <input
            id="sf-name"
            type="text"
            placeholder="e.g. Dilani Perera"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            autoComplete="off"
          />
          {touched && !draft.name.trim() && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C", letterSpacing: "0.02em" }}>
              A name is required.
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="sf-role">Role</label>
          <select
            id="sf-role"
            value={draft.role}
            onChange={(e) => set("role", e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sf-dob">Date of birth</label>
          <input
            id="sf-dob"
            type="date"
            value={draft.dob}
            onChange={(e) => set("dob", e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="sf-salary">Monthly salary (LKR)</label>
          <input
            id="sf-salary"
            type="number"
            min={0}
            step={1000}
            value={draft.salary}
            placeholder="e.g. 45000"
            onChange={(e) =>
              set("salary", e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>

        <div className="field">
          <label
            htmlFor="sf-active"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              border: "1px solid var(--ink-100)",
              borderRadius: 10,
              background: "var(--cream)",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--ink-700)",
              letterSpacing: "0.02em",
              textTransform: "none",
              fontWeight: 400,
            }}
          >
            <input
              id="sf-active"
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set("active", e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--plum-700)" }}
            />
            Currently active — can be assigned to appointments
          </label>
        </div>

      </form>
    </Modal>
  );
}
