"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import ServiceFormModal, {
  type ServiceDraft,
} from "@/components/ServiceFormModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast, { type ToastTone } from "@/components/Toast";
import {
  CATEGORY_BLURB,
  type Service,
  type ServiceCategory,
  humanError,
  lkr,
} from "@/lib/data";
import { supabase } from "@/lib/supabase";

const CATEGORY_ORDER: ServiceCategory[] = [
  "Hair",
  "Skin",
  "Hands",
  "Feet",
  "Threading",
  "Bridal",
  "Massage",
  "Wax",
];

export default function ServicesPage() {
  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | undefined>(undefined);
  const [confirmTarget, setConfirmTarget] = useState<Service | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<ToastTone>("info");

  const showError   = (msg: string) => { setToastTone("error");   setToast(msg); };
  const showSuccess = (msg: string) => { setToastTone("success"); setToast(msg); };

  // ── Load from Supabase on mount ────────────────────────────────────────

  useEffect(() => {
    supabase
      .from("services")
      .select("*")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          showError("We couldn't load your services. Refresh the page to try again.");
        } else {
          setItems(
            (data ?? []).map((row) => ({
              ...row,
              description:     (row as Service).description      ?? "",
              commission_rate: (row as Service).commission_rate  ?? null,
              station_type_id: (row as Service).station_type_id  ?? null,
            })) as Service[],
          );
        }
        setLoading(false);
      });
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<ServiceCategory, Service[]>();
    CATEGORY_ORDER.forEach((c) => map.set(c, []));
    for (const s of items) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, [items]);

  const totalEnabled = items.filter((s) => s.enabled).length;

  /* ── Actions ──────────────────────────────────────── */

  const toggle = async (id: number) => {
    const svc = items.find((s) => s.id === id);
    if (!svc) return;
    const newEnabled = !svc.enabled;

    // Optimistic update
    setItems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: newEnabled } : s)),
    );

    const { error } = await supabase
      .from("services")
      .update({ enabled: newEnabled })
      .eq("id", id);

    if (error) {
      // Revert on failure
      setItems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, enabled: !newEnabled } : s)),
      );
      showError(humanError(error, "We couldn't update that service. Try again in a moment."));
    }
  };

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (svc: Service) => {
    setEditing(svc);
    setFormOpen(true);
  };

  /** Replace the variants and addons of a service with the draft's lists.
   *  We do a wipe-and-insert rather than diffing — far simpler, and these
   *  lists are short.  Existing appointments don't reference these rows
   *  (they snapshot name/price), so deleting variants/addons is safe. */
  const syncVariantsAndAddons = async (
    serviceId: number,
    draft: ServiceDraft,
  ): Promise<string | null> => {
    // ── Variants ──
    if (draft.has_variants) {
      const { error: delErr } = await supabase
        .from("service_variants").delete().eq("service_id", serviceId);
      if (delErr) return humanError(delErr, "Couldn't refresh tier prices.");
      if (draft.variants.length > 0) {
        const rows = draft.variants.map((v, idx) => ({
          service_id:        serviceId,
          name:              v.name.trim(),
          price:             v.price,
          duration_override: v.duration_override,
          sort_order:        idx,
          enabled:           true,
        }));
        const { error: insErr } = await supabase.from("service_variants").insert(rows);
        if (insErr) return humanError(insErr, "Couldn't save tier prices.");
      }
    } else {
      // Flag turned off — clear any leftover rows.
      await supabase.from("service_variants").delete().eq("service_id", serviceId);
    }

    // ── Addons ──
    if (draft.allows_addons) {
      const { error: delErr } = await supabase
        .from("service_addons").delete().eq("service_id", serviceId);
      if (delErr) return humanError(delErr, "Couldn't refresh extras.");
      if (draft.addons.length > 0) {
        const rows = draft.addons.map((a, idx) => ({
          service_id:     serviceId,
          name:           a.name.trim(),
          price:          a.price,
          unit_label:     a.unit_label,
          duration_added: a.duration_added,
          sort_order:     idx,
          enabled:        true,
        }));
        const { error: insErr } = await supabase.from("service_addons").insert(rows);
        if (insErr) return humanError(insErr, "Couldn't save extras.");
      }
    } else {
      await supabase.from("service_addons").delete().eq("service_id", serviceId);
    }

    return null;
  };

  const handleSave = async (draft: ServiceDraft, id?: number) => {
    const servicePayload = {
      name:                draft.name,
      category:            draft.category,
      description:         draft.description,
      duration:            draft.duration,
      price:               draft.price,
      commission_rate:     draft.commission_rate === "" ? null : draft.commission_rate,
      station_type_id:     draft.station_type_id ?? null,
      enabled:             draft.enabled,
      unit_label:          draft.unit_label,
      requires_patch_test: draft.requires_patch_test,
      has_variants:        draft.has_variants,
      allows_addons:       draft.allows_addons,
    };

    if (id !== undefined) {
      // ── Edit existing ──
      const { error } = await supabase
        .from("services")
        .update(servicePayload)
        .eq("id", id);

      if (error) {
        showError(humanError(error, "We couldn't save those changes. Try again in a moment."));
        return;
      }

      const syncErr = await syncVariantsAndAddons(id, draft);
      if (syncErr) {
        showError(syncErr);
        return;
      }

      setItems((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                ...servicePayload,
                commission_rate: draft.commission_rate === "" ? null : draft.commission_rate,
              }
            : s,
        ),
      );
      showSuccess(`"${draft.name}" updated`);
    } else {
      // ── Add new ──
      const { data: created, error } = await supabase
        .from("services")
        .insert(servicePayload)
        .select()
        .single();

      if (error || !created) {
        showError(humanError(error, `We couldn't add "${draft.name}". Try again in a moment.`));
        return;
      }

      const newId = (created as Service).id;
      const syncErr = await syncVariantsAndAddons(newId, draft);
      if (syncErr) {
        showError(syncErr);
        return;
      }

      setItems((prev) => [
        ...prev,
        { ...created, description: (created as Service).description ?? "" } as Service,
      ]);
      showSuccess(`"${draft.name}" added to your menu`);
    }
  };

  const askRemove = (svc: Service) => setConfirmTarget(svc);

  const confirmRemove = async () => {
    if (!confirmTarget) return;
    const removed = confirmTarget;

    // Optimistic update
    setItems((prev) => prev.filter((s) => s.id !== removed.id));

    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", removed.id);

    if (error) {
      // Revert
      setItems((prev) => [...prev, removed]);
      showError(humanError(error, `We couldn't remove "${removed.name}". Try again in a moment.`));
    } else {
      showSuccess(`"${removed.name}" removed`);
    }
  };

  /* ── Render ───────────────────────────────────────── */

  return (
    <div className="page-app page-services">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">What you offer</div>
              <h1 className="page-title">Services</h1>
              <p className="page-sub">
                From a quiet trim to a full afternoon of care — the rituals
                your salon is known for, priced and described in your own
                words.
              </p>
            </div>
            <div className="header-actions">
              <button type="button" className="btn btn-primary" onClick={openAdd}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add service
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-400)", fontSize: 14 }}>
            Loading your services…
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 12,
                color: "var(--ink-500)",
                letterSpacing: "0.04em",
                marginBottom: 32,
              }}
            >
              <strong style={{ color: "var(--ink-900)", fontWeight: 500 }}>
                {totalEnabled}
              </strong>{" "}
              of {items.length} services live on your booking page
            </div>

            {items.length === 0 && (
              <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-400)", fontSize: 14 }}>
                No services yet — add your first one above.
              </div>
            )}

            {CATEGORY_ORDER.map((cat) => {
              const list = grouped.get(cat) ?? [];
              if (list.length === 0) return null;
              const enabledCount = list.filter((s) => s.enabled).length;

              return (
                <section className="svc-category" key={cat}>
                  <div className="svc-cat-head">
                    <h2 className="svc-cat-title">
                      {cat}
                      <em>{CATEGORY_BLURB[cat]}</em>
                    </h2>
                    <div className="section-aside">
                      {enabledCount} of {list.length} live
                    </div>
                  </div>

                  <div className="svc-grid">
                    {list.map((s) => (
                      <div
                        className={`svc-card ${s.enabled ? "" : "disabled"}`}
                        key={s.id}
                      >
                        <div className="svc-card-head">
                          <div>
                            <div className="svc-duration">{s.duration} MIN</div>
                            <div className="svc-name" style={{ marginTop: 4 }}>
                              {s.name}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div className="svc-price">
                              {s.has_variants
                                ? <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-500)" }}>Tiered</span>
                                : lkr(s.price)}
                            </div>
                            {!s.has_variants && s.unit_label && (
                              <div style={{ fontSize: 11, color: "var(--ink-400)", letterSpacing: "0.02em", marginTop: 2 }}>
                                {s.unit_label}
                              </div>
                            )}
                            {s.commission_rate != null && (
                              <div style={{ fontSize: 11, color: "var(--ink-400)", letterSpacing: "0.04em", marginTop: 2 }}>
                                {s.commission_rate}% commission
                              </div>
                            )}
                            {(s.has_variants || s.allows_addons || s.requires_patch_test) && (
                              <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {s.has_variants && (
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--plum-50)", color: "var(--plum-700)", letterSpacing: "0.04em" }}>
                                    TIERED
                                  </span>
                                )}
                                {s.allows_addons && (
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--champagne-100)", color: "var(--champagne-700)", letterSpacing: "0.04em" }}>
                                    EXTRAS
                                  </span>
                                )}
                                {s.requires_patch_test && (
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#FFF8E1", color: "#7A5A1A", letterSpacing: "0.04em" }}>
                                    PATCH TEST
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="svc-desc">
                          {s.description || "No description added yet."}
                        </div>
                        <div className="svc-foot">
                          <label
                            className="svc-toggle-label"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className={`toggle ${s.enabled ? "on" : ""}`}
                              aria-pressed={s.enabled}
                              aria-label={s.enabled ? "Hide from booking page" : "Show on booking page"}
                              onClick={() => toggle(s.id)}
                            />
                            {s.enabled ? "Live" : "Hidden"}
                          </label>
                          <div className="svc-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Edit ${s.name}`}
                              onClick={() => openEdit(s)}
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="icon-btn"
                              aria-label={`Remove ${s.name}`}
                              onClick={() => askRemove(s)}
                            >
                              <svg viewBox="0 0 24 24">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                                <path d="M9 6V4h6v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>

      <MobileTabBar active="more" />

      {/* Add / Edit form */}
      <ServiceFormModal
        open={formOpen}
        service={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />

      {/* Destructive confirm */}
      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={confirmRemove}
        eyebrow="Remove from menu"
        title="Remove this service?"
        body={
          confirmTarget ? (
            <>
              You&rsquo;re about to remove <em>{confirmTarget.name}</em> from
              your service menu. Customers won&rsquo;t be able to book it from
              your page after this — though past appointments will keep their
              records.
            </>
          ) : null
        }
        confirmLabel="Remove service"
        cancelLabel="Keep it"
      />

      <Toast message={toast} tone={toastTone} onDone={() => setToast(null)} />
    </div>
  );
}
