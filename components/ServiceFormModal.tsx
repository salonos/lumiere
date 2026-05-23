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

// ── Variant / addon draft shapes ────────────────────────────────────────────

export type VariantDraft = {
  /** Present when editing an existing variant; absent for newly-added rows. */
  id?: number;
  name: string;
  price: number;
  duration_override: number | null;
  sort_order: number;
};

export type AddonDraft = {
  id?: number;
  name: string;
  price: number;
  unit_label: string | null;
  duration_added: number;
  sort_order: number;
};

export type ServiceDraft = {
  name: string;
  category: ServiceCategory;
  description: string;
  duration: number;
  price: number;
  commission_rate: number | "";
  station_type_id: number | null;
  enabled: boolean;
  // ── New fields ──
  unit_label: string | null;
  requires_patch_test: boolean;
  has_variants: boolean;
  allows_addons: boolean;
  variants: VariantDraft[];
  addons:   AddonDraft[];
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
  unit_label: null,
  requires_patch_test: false,
  has_variants: false,
  allows_addons: false,
  variants: [],
  addons:   [],
};

function blankVariant(sortOrder: number): VariantDraft {
  return { name: "", price: 0, duration_override: null, sort_order: sortOrder };
}

function blankAddon(sortOrder: number): AddonDraft {
  return { name: "", price: 0, unit_label: null, duration_added: 0, sort_order: sortOrder };
}

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
  const [loadingExtras, setLoadingExtras] = useState(false);

  // Load station types once.
  useEffect(() => {
    supabase
      .from("station_types")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStationTypes((data as StationOption[]) ?? []));
  }, []);

  // Reset whenever the modal opens with new context.
  // For an edit with has_variants/allows_addons set, also fetch the existing rows.
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (service) {
      setDraft({
        name:                service.name,
        category:            service.category,
        description:         service.description,
        duration:            service.duration,
        price:               service.price,
        commission_rate:     service.commission_rate ?? "",
        station_type_id:     service.station_type_id ?? null,
        enabled:             service.enabled,
        unit_label:          service.unit_label ?? null,
        requires_patch_test: service.requires_patch_test ?? false,
        has_variants:        service.has_variants ?? false,
        allows_addons:       service.allows_addons ?? false,
        variants:            [],
        addons:              [],
      });

      // Pull existing variants / addons if the flags are set.
      if (service.has_variants || service.allows_addons) {
        setLoadingExtras(true);
        Promise.all([
          service.has_variants
            ? supabase.from("service_variants").select("*")
                .eq("service_id", service.id).order("sort_order")
            : Promise.resolve({ data: [] }),
          service.allows_addons
            ? supabase.from("service_addons").select("*")
                .eq("service_id", service.id).order("sort_order")
            : Promise.resolve({ data: [] }),
        ]).then(([vRes, aRes]) => {
          setDraft(d => ({
            ...d,
            variants: ((vRes.data ?? []) as Record<string, unknown>[]).map(r => ({
              id:                r.id as number,
              name:              r.name as string,
              price:             (r.price as number) ?? 0,
              duration_override: (r.duration_override as number | null) ?? null,
              sort_order:        (r.sort_order as number) ?? 0,
            })),
            addons: ((aRes.data ?? []) as Record<string, unknown>[]).map(r => ({
              id:             r.id as number,
              name:           r.name as string,
              price:          (r.price as number) ?? 0,
              unit_label:     (r.unit_label as string | null) ?? null,
              duration_added: (r.duration_added as number) ?? 0,
              sort_order:     (r.sort_order as number) ?? 0,
            })),
          }));
          setLoadingExtras(false);
        });
      }
    } else {
      setDraft(blankDraft);
    }
  }, [open, service]);

  // ── Variant / addon mutations ───────────────────────────────────────────

  const updateVariant = (idx: number, patch: Partial<VariantDraft>) => {
    setDraft(d => ({
      ...d,
      variants: d.variants.map((v, i) => i === idx ? { ...v, ...patch } : v),
    }));
  };

  const addVariant = () => {
    setDraft(d => ({
      ...d,
      variants: [...d.variants, blankVariant(d.variants.length)],
    }));
  };

  const removeVariant = (idx: number) => {
    setDraft(d => ({
      ...d,
      variants: d.variants.filter((_, i) => i !== idx),
    }));
  };

  const updateAddon = (idx: number, patch: Partial<AddonDraft>) => {
    setDraft(d => ({
      ...d,
      addons: d.addons.map((a, i) => i === idx ? { ...a, ...patch } : a),
    }));
  };

  const addAddon = () => {
    setDraft(d => ({
      ...d,
      addons: [...d.addons, blankAddon(d.addons.length)],
    }));
  };

  const removeAddon = (idx: number) => {
    setDraft(d => ({
      ...d,
      addons: d.addons.filter((_, i) => i !== idx),
    }));
  };

  // ── Validation ──────────────────────────────────────────────────────────

  const variantsValid = !draft.has_variants
    || draft.variants.length === 0
    || draft.variants.every(v => v.name.trim().length > 0 && v.price >= 0);
  const addonsValid = !draft.allows_addons
    || draft.addons.length === 0
    || draft.addons.every(a => a.name.trim().length > 0 && a.price >= 0);

  const valid =
    draft.name.trim().length > 0 &&
    draft.duration > 0 &&
    variantsValid &&
    addonsValid;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    onSave(draft, service?.id);
    onClose();
  };

  // ── Render ──────────────────────────────────────────────────────────────

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
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
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
            <div style={{ marginTop: 8, fontSize: 12, color: "#A53A2C", letterSpacing: "0.02em" }}>
              A name keeps customers from guessing — please add one.
            </div>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor="svc-category">Category</label>
          <select
            id="svc-category"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as ServiceCategory })}
          >
            {CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="svc-desc">Description</label>
          <textarea
            id="svc-desc"
            placeholder="What's included, and what makes it yours…"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="svc-duration">Duration (minutes)</label>
            <input
              id="svc-duration"
              type="number"
              min={5}
              step={5}
              value={draft.duration || ""}
              placeholder="60"
              onChange={(e) => setDraft({ ...draft, duration: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <label htmlFor="svc-price">
              {draft.has_variants ? "Base price (LKR)" : "Price (LKR)"}
              {draft.has_variants && (
                <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-400)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                  — overridden by tier prices below
                </span>
              )}
            </label>
            <input
              id="svc-price"
              type="number"
              min={0}
              step={100}
              value={draft.price || ""}
              placeholder="3500"
              onChange={(e) => setDraft({ ...draft, price: parseInt(e.target.value) || 0 })}
            />
          </div>
        </div>

        {/* ── Per-unit pricing label ── */}
        <div className="field">
          <label htmlFor="svc-unit">
            Unit label
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-400)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              — for services charged per item (e.g. &ldquo;per nail&rdquo;, &ldquo;per finger&rdquo;). Leave blank for flat pricing.
            </span>
          </label>
          <input
            id="svc-unit"
            type="text"
            placeholder="e.g. per nail"
            value={draft.unit_label ?? ""}
            onChange={(e) => setDraft({ ...draft, unit_label: e.target.value.trim() || null })}
          />
        </div>

        <div className="field">
          <label htmlFor="svc-commission">
            Staff commission (%)
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-400)", fontWeight: 400, textTransform: "none", letterSpacing: "0.01em" }}>
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
            onChange={(e) => setDraft({
              ...draft,
              commission_rate: e.target.value === "" ? "" : Number(e.target.value),
            })}
          />
        </div>

        {stationTypes.length > 0 && (
          <div className="field">
            <label htmlFor="svc-station">
              Station required
              <span style={{ marginLeft: 8, fontSize: 11, color: "var(--ink-400)", fontWeight: 400, textTransform: "none", letterSpacing: "0.01em" }}>
                Which workspace this service occupies (for availability checks)
              </span>
            </label>
            <select
              id="svc-station"
              value={draft.station_type_id ?? ""}
              onChange={(e) => setDraft({
                ...draft,
                station_type_id: e.target.value ? Number(e.target.value) : null,
              })}
            >
              <option value="">None / no station required</option>
              {stationTypes.map((st) => (
                <option key={st.id} value={st.id}>{st.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Catalogue-extension flags ──────────────────────────────────── */}

        <div style={{
          marginTop: 16,
          padding: "14px 16px",
          background: "var(--cream)",
          border: "1px solid var(--ink-100)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-500)" }}>
            Optional capabilities
          </div>

          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={draft.has_variants}
              onChange={(e) => setDraft({ ...draft, has_variants: e.target.checked })}
              style={checkStyle}
            />
            <span style={flagTextStyle}>
              <strong>This service is priced in tiers</strong>
              <span style={flagHintStyle}>
                e.g. one service (&ldquo;Full Legs&rdquo;) sold at different wax types
              </span>
            </span>
          </label>

          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={draft.allows_addons}
              onChange={(e) => setDraft({ ...draft, allows_addons: e.target.checked })}
              style={checkStyle}
            />
            <span style={flagTextStyle}>
              <strong>Customers can add extras</strong>
              <span style={flagHintStyle}>
                e.g. nail art, French finish, foil design — stack onto the base service
              </span>
            </span>
          </label>

          <label style={flagLabelStyle}>
            <input
              type="checkbox"
              checked={draft.requires_patch_test}
              onChange={(e) => setDraft({ ...draft, requires_patch_test: e.target.checked })}
              style={checkStyle}
            />
            <span style={flagTextStyle}>
              <strong>Requires a patch test 24 hours before</strong>
              <span style={flagHintStyle}>
                Shows a safety warning when this service is booked
              </span>
            </span>
          </label>
        </div>

        {/* ── Variants list ──────────────────────────────────────────────── */}

        {draft.has_variants && (
          <div style={listSectionStyle}>
            <div style={listHeadStyle}>
              <span>Tier prices</span>
              <span style={listHintStyle}>
                Each tier shows up as a required choice when this service is booked
              </span>
            </div>

            {loadingExtras && draft.variants.length === 0 ? (
              <div style={emptyMsgStyle}>Loading tiers…</div>
            ) : draft.variants.length === 0 ? (
              <div style={emptyMsgStyle}>No tiers yet — add at least one below.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {draft.variants.map((v, idx) => (
                  <div key={idx} style={rowStyle}>
                    <input
                      type="text"
                      placeholder="Tier name (e.g. Classic Strip)"
                      value={v.name}
                      onChange={(e) => updateVariant(idx, { name: e.target.value })}
                      style={{ flex: 2, padding: "8px 10px", fontSize: 13 }}
                    />
                    <input
                      type="number"
                      min={0}
                      step={100}
                      placeholder="Price"
                      value={v.price || ""}
                      onChange={(e) => updateVariant(idx, { price: parseInt(e.target.value) || 0 })}
                      style={{ width: 100, padding: "8px 10px", fontSize: 13 }}
                    />
                    <input
                      type="number"
                      min={0}
                      step={5}
                      placeholder="min"
                      value={v.duration_override ?? ""}
                      onChange={(e) => updateVariant(idx, {
                        duration_override: e.target.value ? parseInt(e.target.value) : null,
                      })}
                      style={{ width: 70, padding: "8px 10px", fontSize: 13 }}
                      title="Optional duration override"
                    />
                    <button
                      type="button"
                      onClick={() => removeVariant(idx)}
                      style={removeBtnStyle}
                      aria-label="Remove tier"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={addVariant} style={addRowBtnStyle}>
              + Add tier
            </button>

            {touched && !variantsValid && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#A53A2C" }}>
                Every tier needs a name. Remove blank rows or fill them in.
              </div>
            )}
          </div>
        )}

        {/* ── Addons list ────────────────────────────────────────────────── */}

        {draft.allows_addons && (
          <div style={listSectionStyle}>
            <div style={listHeadStyle}>
              <span>Available extras</span>
              <span style={listHintStyle}>
                Optional add-ons customers can stack onto this service
              </span>
            </div>

            {loadingExtras && draft.addons.length === 0 ? (
              <div style={emptyMsgStyle}>Loading extras…</div>
            ) : draft.addons.length === 0 ? (
              <div style={emptyMsgStyle}>No extras yet — add the first below.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {draft.addons.map((a, idx) => (
                  <div key={idx} style={rowStyle}>
                    <input
                      type="text"
                      placeholder="Extra name (e.g. French)"
                      value={a.name}
                      onChange={(e) => updateAddon(idx, { name: e.target.value })}
                      style={{ flex: 2, padding: "8px 10px", fontSize: 13 }}
                    />
                    <input
                      type="number"
                      min={0}
                      step={50}
                      placeholder="Price"
                      value={a.price || ""}
                      onChange={(e) => updateAddon(idx, { price: parseInt(e.target.value) || 0 })}
                      style={{ width: 90, padding: "8px 10px", fontSize: 13 }}
                    />
                    <input
                      type="text"
                      placeholder="per …"
                      value={a.unit_label ?? ""}
                      onChange={(e) => updateAddon(idx, { unit_label: e.target.value.trim() || null })}
                      style={{ width: 90, padding: "8px 10px", fontSize: 13 }}
                      title="Optional unit label (per finger / per nail)"
                    />
                    <input
                      type="number"
                      min={0}
                      step={5}
                      placeholder="+min"
                      value={a.duration_added || ""}
                      onChange={(e) => updateAddon(idx, { duration_added: parseInt(e.target.value) || 0 })}
                      style={{ width: 60, padding: "8px 10px", fontSize: 13 }}
                      title="Extra minutes this addon consumes"
                    />
                    <button
                      type="button"
                      onClick={() => removeAddon(idx)}
                      style={removeBtnStyle}
                      aria-label="Remove extra"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={addAddon} style={addRowBtnStyle}>
              + Add extra
            </button>

            {touched && !addonsValid && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#A53A2C" }}>
                Every extra needs a name. Remove blank rows or fill them in.
              </div>
            )}
          </div>
        )}

        <div className="field" style={{ marginTop: 16 }}>
          <label
            htmlFor="svc-enabled"
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 14px",
              border: "1px solid var(--ink-100)", borderRadius: 10,
              background: "var(--cream)", cursor: "pointer",
              fontSize: 13, color: "var(--ink-700)",
              letterSpacing: "0.02em", textTransform: "none", fontWeight: 400,
            }}
          >
            <input
              id="svc-enabled"
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: "var(--plum-700)" }}
            />
            Show on the public booking page
          </label>
        </div>
      </form>
    </Modal>
  );
}

// ── Inline styles for the variant/addon lists ─────────────────────────────

const flagLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  cursor: "pointer",
  fontSize: 13,
  color: "var(--ink-700)",
  letterSpacing: "0.01em",
  textTransform: "none",
  fontWeight: 400,
};

const checkStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  accentColor: "var(--plum-700)",
  marginTop: 2,
  flexShrink: 0,
};

const flagTextStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const flagHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-500)",
  fontWeight: 400,
};

const listSectionStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "14px 16px",
  background: "var(--white)",
  border: "1px solid var(--ink-100)",
  borderRadius: 10,
};

const listHeadStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  marginBottom: 10,
  fontSize: 12,
  fontWeight: 500,
  color: "var(--ink-700)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const listHintStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--ink-400)",
  fontWeight: 400,
  textTransform: "none",
  letterSpacing: 0,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
};

const removeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--ink-400)",
  fontSize: 18,
  lineHeight: 1,
  padding: "6px 8px",
  flexShrink: 0,
};

const addRowBtnStyle: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  background: "none",
  border: "1px dashed var(--ink-200)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  color: "var(--plum-700)",
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
};

const emptyMsgStyle: React.CSSProperties = {
  padding: "10px 0",
  fontSize: 12,
  color: "var(--ink-400)",
  fontStyle: "italic",
};
