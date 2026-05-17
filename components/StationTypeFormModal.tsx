"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type ServiceOption = { id: number; name: string; category: string };

export type StationTypeDraft = {
  name:       string;
  count:      number;
  serviceIds: number[]; // services assigned to this station
};

export type StationTypeRow = { id: number; name: string; count: number };

const blank: StationTypeDraft = { name: "", count: 1, serviceIds: [] };

// Keep categories in display order
const CAT_ORDER = ["Hair", "Skin", "Nails", "Threading", "Bridal", "Massage", "Wax"];

type Props = {
  open:          boolean;
  stationType?:  StationTypeRow;
  onClose:       () => void;
  onSave:        (draft: StationTypeDraft, id?: number) => void;
};

export default function StationTypeFormModal({
  open, stationType, onClose, onSave,
}: Props) {
  const isEdit = !!stationType;

  const [draft,     setDraft]     = useState<StationTypeDraft>(blank);
  const [touched,   setTouched]   = useState(false);
  const [services,  setServices]  = useState<ServiceOption[]>([]);
  const [loadingSvc, setLoadingSvc] = useState(false);

  // Load services + pre-select assigned ones whenever modal opens
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setDraft(stationType
      ? { name: stationType.name, count: stationType.count, serviceIds: [] }
      : blank,
    );

    setLoadingSvc(true);
    supabase
      .from("services")
      .select("id, name, category, station_type_id")
      .order("category")
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as { id: number; name: string; category: string; station_type_id: number | null }[];
        setServices(rows.map((r) => ({ id: r.id, name: r.name, category: r.category })));
        // Pre-select services already assigned to this station
        if (stationType) {
          const preSelected = rows
            .filter((r) => r.station_type_id === stationType.id)
            .map((r) => r.id);
          setDraft((d) => ({ ...d, serviceIds: preSelected }));
        }
        setLoadingSvc(false);
      });
  }, [open, stationType]);

  const toggleService = (id: number) =>
    setDraft((d) => ({
      ...d,
      serviceIds: d.serviceIds.includes(id)
        ? d.serviceIds.filter((x) => x !== id)
        : [...d.serviceIds, id],
    }));

  const valid = draft.name.trim().length > 0 && draft.count >= 1;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave(draft, stationType?.id);
    onClose();
  };

  // Group services by category for display
  const grouped = CAT_ORDER
    .map((cat) => ({ cat, svcs: services.filter((s) => s.category === cat) }))
    .filter((g) => g.svcs.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={isEdit ? "Edit station" : "Add a station"}
      title={isEdit ? "Update station details" : "A new workspace"}
      subtitle={
        isEdit
          ? "Adjust the name, count, or which services use this station."
          : "Add a station type and pick every service that runs here. The count controls how many can run at once."
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
            {isEdit ? "Save changes" : "Add station"}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>

        {/* Station name */}
        <div className="field">
          <label htmlFor="st-name">Station name</label>
          <input
            id="st-name"
            type="text"
            placeholder="e.g. Hair & Makeup, Wax Station, Pedicure Chair"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoComplete="off"
          />
          {touched && !draft.name.trim() && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C", letterSpacing: "0.02em" }}>
              A station name is required.
            </div>
          )}
        </div>

        {/* Count */}
        <div className="field">
          <label htmlFor="st-count">
            Number available
            <span style={{
              marginLeft: 8, fontSize: 11, color: "var(--ink-400)",
              fontWeight: 400, textTransform: "none", letterSpacing: "0.01em",
            }}>
              How many of this station exist in your salon
            </span>
          </label>
          <input
            id="st-count"
            type="number"
            min={1}
            step={1}
            value={draft.count}
            onChange={(e) =>
              setDraft({ ...draft, count: Math.max(1, parseInt(e.target.value) || 1) })
            }
          />
        </div>

        {/* Services */}
        <div className="field">
          <label>
            Services at this station
            <span style={{
              marginLeft: 8, fontSize: 11, color: "var(--ink-400)",
              fontWeight: 400, textTransform: "none", letterSpacing: "0.01em",
            }}>
              {draft.serviceIds.length > 0
                ? `${draft.serviceIds.length} selected`
                : "Select all services done here"}
            </span>
          </label>

          {loadingSvc ? (
            <div style={{ fontSize: 13, color: "var(--ink-400)", padding: "10px 0" }}>
              Loading services…
            </div>
          ) : services.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-400)", padding: "10px 0" }}>
              No services found — add services first.
            </div>
          ) : (
            <div style={{
              border: "1px solid var(--ink-100)",
              borderRadius: 12,
              padding: "14px 16px",
              background: "var(--cream)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: 320,
              overflowY: "auto",
            }}>
              {grouped.map(({ cat, svcs }) => (
                <div key={cat}>
                  <div style={{
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ink-400)",
                    fontWeight: 600,
                    marginBottom: 7,
                  }}>
                    {cat}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {svcs.map((svc) => {
                      const selected = draft.serviceIds.includes(svc.id);
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => toggleService(svc.id)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 20,
                            fontSize: 12,
                            fontFamily: "inherit",
                            letterSpacing: "0.01em",
                            cursor: "pointer",
                            transition: "all 0.12s",
                            border: `1.5px solid ${selected ? "var(--plum-500)" : "var(--ink-200)"}`,
                            background: selected ? "var(--plum-50)" : "var(--white)",
                            color: selected ? "var(--plum-800)" : "var(--ink-600)",
                            fontWeight: selected ? 500 : 400,
                          }}
                        >
                          {selected && (
                            <span style={{ marginRight: 5, fontSize: 10 }}>✓</span>
                          )}
                          {svc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </form>
    </Modal>
  );
}
