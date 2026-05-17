"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { supabase } from "@/lib/supabase";
import type { Service, ServiceCategory } from "@/lib/data";

type StationOption = { id: number; name: string };

const CATEGORIES: ServiceCategory[] = [
  "Hair",
  "Skin",
  "Nails",
  "Threading",
  "Bridal",
  "Massage",
  "Wax",
];

export type ServiceDraft = {
  name: string;
  category: ServiceCategory;
  description: string;
  duration: number;
  price: number;
  commission_rate: number | "";
  station_type_id: number | null;
  enabled: boolean;
};

type Props = {
  open: boolean;
  /** When editing, pass the existing service. When adding, leave undefined. */
  service?: Service;
  onClose: () => void;
  onSave: (draft: ServiceDraft, id?: number) => void;
};

const blankDraft: ServiceDraft = {
  name: "",
  category: "Hair",
  description: "",
  duration: 60,
  price: 0,
  commission_rate: "",
  station_type_id: null,
  enabled: true,
};

export default function ServiceFormModal({
  open,
  service,
  onClose,
  onSave,
}: Props) {
  const isEdit = !!service;
  const [draft,        setDraft]        = useState<ServiceDraft>(blankDraft);
  const [touched,      setTouched]      = useState(false);
  const [stationTypes, setStationTypes] = useState<StationOption[]>([]);

  // Load station types once on first open.
  useEffect(() => {
    supabase
      .from("station_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStationTypes((data as StationOption[]) ?? []));
  }, []);

  // Reset whenever the modal opens with new context.
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (service) {
      setDraft({
        name:            service.name,
        category:        service.category,
        description:     service.description,
        duration:        service.duration,
        price:           service.price,
        commission_rate: service.commission_rate ?? "",
        station_type_id: service.station_type_id ?? null,
        enabled:         service.enabled,
      });
    } else {
      setDraft(blankDraft);
    }
  }, [open, service]);

  const valid = draft.name.trim().length > 0 && draft.duration > 0;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave(draft, service?.id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={isEdit ? "Edit service" : "Add to menu"}
      title={isEdit ? "Refine this service" : "A new ritual to offer"}
      subtitle={
        isEdit
          ? "Tweak the details — anything you change here updates your booking page immediately."
          : "Add a treatment your salon offers. It will appear on your booking page right away."
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
            {isEdit ? "Save changes" : "Add service"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor="svc-name">Service name</label>
          <input
            id="svc-name"
            type="text"
            placeholder="e.g. Balayage with toner"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoComplete="off"
          />
          {touched && !draft.name.trim() ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "#A53A2C",
                letterSpacing: "0.02em",
              }}
            >
              A name keeps customers from guessing — please add one.
            </div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="svc-category">Category</label>
          <select
            id="svc-category"
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as ServiceCategory })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="svc-desc">Description</label>
          <textarea
            id="svc-desc"
            placeholder="What's included, and what makes it yours…"
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="svc-duration">Duration (minutes)</label>
            <input
              id="svc-duration"
              type="number"
              min={15}
              step={15}
              value={draft.duration || ""}
              placeholder="60"
              onChange={(e) =>
                setDraft({ ...draft, duration: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="svc-price">Price (LKR)</label>
            <input
              id="svc-price"
              type="number"
              min={0}
              step={100}
              value={draft.price || ""}
              placeholder="3500"
              onChange={(e) =>
                setDraft({ ...draft, price: parseInt(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="svc-commission">
            Staff commission (%)
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                color: "var(--ink-400)",
                fontWeight: 400,
                textTransform: "none",
                letterSpacing: "0.01em",
              }}
            >
              Leave blank if this service earns no commission
            </span>
          </label>
          <input
            id="svc-commission"
            type="number"
            min={0}
            max={100}
            step={1}
            value={draft.commission_rate}
            placeholder="e.g. 10"
            onChange={(e) =>
              setDraft({
                ...draft,
                commission_rate: e.target.value === "" ? "" : Number(e.target.value),
              })
            }
          />
        </div>

        {stationTypes.length > 0 && (
          <div className="field">
            <label htmlFor="svc-station">
              Station required
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 11,
                  color: "var(--ink-400)",
                  fontWeight: 400,
                  textTransform: "none",
                  letterSpacing: "0.01em",
                }}
              >
                Which workspace this service occupies (for availability checks)
              </span>
            </label>
            <select
              id="svc-station"
              value={draft.station_type_id ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  station_type_id: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">None / no station required</option>
              {stationTypes.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label
            htmlFor="svc-enabled"
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
              id="svc-enabled"
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
              style={{ width: 16, height: 16, accentColor: "var(--plum-700)" }}
            />
            Show on the public booking page
          </label>
        </div>
      </form>
    </Modal>
  );
}
