"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import MobileTopBar from "@/components/MobileTopBar";
import MobileTabBar from "@/components/MobileTabBar";
import StaffFormModal, {
  type StaffDraft,
  type StaffRow,
} from "@/components/StaffFormModal";
import StationTypeFormModal, {
  type StationTypeDraft,
  type StationTypeRow,
} from "@/components/StationTypeFormModal";
import StaffReassignModal, { type UpcomingApt } from "@/components/StaffReassignModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import Toast from "@/components/Toast";
import { lkr } from "@/lib/data";
import { supabase } from "@/lib/supabase";

type ServiceStub = { id: number; name: string; category: string; station_type_id: number | null };

export default function StaffPage() {
  const [staff,    setStaff]    = useState<StaffRow[]>([]);
  const [stations, setStations] = useState<StationTypeRow[]>([]);
  const [services, setServices] = useState<ServiceStub[]>([]);
  const [salonId,  setSalonId]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);

  // Staff modal state
  const [staffFormOpen, setStaffFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffRow | undefined>();
  const [confirmStaff, setConfirmStaff] = useState<StaffRow | null>(null);

  // Station modal state
  const [stationFormOpen, setStationFormOpen] = useState(false);
  const [editingStation, setEditingStation] = useState<StationTypeRow | undefined>();
  const [confirmStation, setConfirmStation] = useState<StationTypeRow | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  // Reassign-before-deactivate/delete state
  const [reassignAppts,  setReassignAppts]  = useState<UpcomingApt[]>([]);
  const [reassignMode,   setReassignMode]   = useState<"deactivate" | "delete" | null>(null);
  const [reassignTarget, setReassignTarget] = useState<StaffRow | null>(null);
  const [reassignDraft,  setReassignDraft]  = useState<{ draft: StaffDraft; id: number } | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Resolve the current user's salon_id so we can pass it explicitly on insert.
    // Relying on the DB default `current_salon_id()` was failing the RLS
    // WITH CHECK policy intermittently — passing the id directly is reliable.
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: link } = await supabase
        .from("salon_users")
        .select("salon_id")
        .eq("user_id", user.id)
        .single();
      const sid = (link as { salon_id?: string } | null)?.salon_id ?? null;
      setSalonId(sid);
    })();

    Promise.all([
      supabase.from("staff").select("*").order("name"),
      supabase.from("station_types").select("*").order("name"),
      supabase.from("services").select("id, name, category, station_type_id").order("category").order("name"),
    ]).then(([staffRes, stationRes, svcRes]) => {
      if (staffRes.error) {
        setToast("Couldn't load staff — please refresh");
      } else {
        setStaff(
          (staffRes.data ?? []).map((r) => ({
            id: r.id as number,
            name: r.name as string,
            role: (r.role as string) ?? "",
            dob: (r.dob as string) ?? "",
            salary: r.salary as number | "",
            active: r.active as boolean,
          }))
        );
      }
      if (stationRes.error) {
        setToast("Couldn't load stations — please refresh");
      } else {
        setStations(
          (stationRes.data ?? []).map((r) => ({
            id: r.id as number,
            name: r.name as string,
            count: r.count as number,
          }))
        );
      }
      if (!svcRes.error) {
        setServices(
          ((svcRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
            id:              r.id as number,
            name:            r.name as string,
            category:        (r.category as string) ?? "",
            station_type_id: (r.station_type_id as number | null) ?? null,
          }))
        );
      }
      setLoading(false);
    });
  }, []);

  // ── Staff actions ─────────────────────────────────────────────────────────

  const checkUpcomingAppts = async (staffId: number): Promise<UpcomingApt[]> => {
    const today = new Date().toLocaleDateString("en-CA");
    const { data } = await supabase
      .from("appointments")
      .select("id, date, time, customers(name), services(name)")
      .eq("staff_id", staffId)
      .gte("date", today)
      .neq("status", "cancelled")
      .order("date")
      .order("time");
    return (data ?? []) as unknown as UpcomingApt[];
  };

  const openAddStaff = () => {
    setEditingStaff(undefined);
    setStaffFormOpen(true);
  };

  const openEditStaff = (s: StaffRow) => {
    setEditingStaff(s);
    setStaffFormOpen(true);
  };

  const handleSaveStaff = async (draft: StaffDraft, id?: number, skipCheck = false) => {
    const basePayload = {
      name: draft.name,
      role: draft.role || null,
      dob: draft.dob || null,
      salary: draft.salary === "" ? null : draft.salary,
      active: draft.active,
    };

    if (id !== undefined) {
      // Intercept deactivation: check for upcoming appointments first
      if (!skipCheck && editingStaff?.active && !draft.active) {
        const appts = await checkUpcomingAppts(id);
        if (appts.length > 0) {
          setReassignAppts(appts);
          setReassignMode("deactivate");
          setReassignTarget(editingStaff);
          setReassignDraft({ draft, id });
          return;
        }
      }

      const { error } = await supabase.from("staff").update(basePayload).eq("id", id);
      if (error) {
        console.error("[staff update]", error);
        setToast("Couldn't save changes — please try again");
      } else {
        setStaff((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...draft } : s))
        );
        setToast(`${draft.name} updated`);
      }
    } else {
      // Resolve salon_id lazily if it hasn't loaded yet — avoids a race
      // when the user clicks "Add staff" the instant the page renders.
      let sid = salonId;
      if (!sid) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: link } = await supabase
            .from("salon_users")
            .select("salon_id")
            .eq("user_id", user.id)
            .single();
          sid = (link as { salon_id?: string } | null)?.salon_id ?? null;
          if (sid) setSalonId(sid);
        }
      }

      if (!sid) {
        setToast("Couldn't determine your salon — please sign in again");
        return;
      }

      const insertPayload = { ...basePayload, salon_id: sid };
      const { data: rows, error } = await supabase
        .from("staff")
        .insert(insertPayload)
        .select();
      if (error) {
        console.error("[staff insert]", error, "payload:", insertPayload);
        setToast(`Couldn't add staff — ${error.message}`);
      } else {
        const created = (rows ?? [])[0] as { id: number } | undefined;
        setStaff((prev) => [
          ...prev,
          {
            id: created?.id ?? Date.now(),
            name: draft.name,
            role: draft.role,
            dob: draft.dob,
            salary: draft.salary,
            active: draft.active,
          },
        ]);
        setToast(`${draft.name} added to your team`);
      }
    }
  };

  const handleDeleteClick = async (s: StaffRow) => {
    const appts = await checkUpcomingAppts(s.id);
    if (appts.length > 0) {
      setReassignAppts(appts);
      setReassignMode("delete");
      setReassignTarget(s);
      setReassignDraft(null);
      return;
    }
    setConfirmStaff(s);
  };

  const proceedAfterReassign = async (reassignments: Record<number, number | null>) => {
    await Promise.all(
      Object.entries(reassignments).map(([aptId, staffId]) =>
        supabase.from("appointments").update({ staff_id: staffId }).eq("id", Number(aptId))
      )
    );

    const mode   = reassignMode;
    const target = reassignTarget;
    const saved  = reassignDraft;

    setReassignAppts([]);
    setReassignMode(null);
    setReassignTarget(null);
    setReassignDraft(null);

    if (mode === "deactivate" && saved) {
      await handleSaveStaff(saved.draft, saved.id, true);
    } else if (mode === "delete" && target) {
      setStaff((prev) => prev.filter((s) => s.id !== target.id));
      const { error } = await supabase.from("staff").delete().eq("id", target.id);
      if (error) {
        setStaff((prev) => [...prev, target]);
        setToast("Couldn't remove — please try again");
      } else {
        setToast(`${target.name} removed`);
      }
    }
  };

  const confirmRemoveStaff = async () => {
    if (!confirmStaff) return;
    const removed = confirmStaff;
    setStaff((prev) => prev.filter((s) => s.id !== removed.id));
    const { error } = await supabase.from("staff").delete().eq("id", removed.id);
    if (error) {
      setStaff((prev) => [...prev, removed]);
      setToast("Couldn't remove — please try again");
    } else {
      setToast(`${removed.name} removed`);
    }
  };

  // ── Station actions ───────────────────────────────────────────────────────

  const openAddStation = () => {
    setEditingStation(undefined);
    setStationFormOpen(true);
  };

  const openEditStation = (s: StationTypeRow) => {
    setEditingStation(s);
    setStationFormOpen(true);
  };

  const assignServices = async (stationId: number, selectedIds: number[]) => {
    // Assign selected services to this station
    if (selectedIds.length > 0) {
      await supabase
        .from("services")
        .update({ station_type_id: stationId })
        .in("id", selectedIds);
    }
    // Clear station from any services that were previously assigned here but are now deselected
    await supabase
      .from("services")
      .update({ station_type_id: null })
      .eq("station_type_id", stationId)
      .not("id", "in", selectedIds.length > 0 ? `(${selectedIds.join(",")})` : "(0)");

    // Refresh local services list so station cards update immediately
    const { data } = await supabase
      .from("services")
      .select("id, name, category, station_type_id")
      .order("category")
      .order("name");
    if (data) {
      setServices(
        (data as Record<string, unknown>[]).map((r) => ({
          id:              r.id as number,
          name:            r.name as string,
          category:        (r.category as string) ?? "",
          station_type_id: (r.station_type_id as number | null) ?? null,
        }))
      );
    }
  };

  const handleSaveStation = async (draft: StationTypeDraft, id?: number) => {
    const payload = { name: draft.name, count: draft.count };

    if (id !== undefined) {
      const { error } = await supabase.from("station_types").update(payload).eq("id", id);
      if (error) {
        setToast("Couldn't save changes — please try again");
      } else {
        setStations((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...draft } : s))
        );
        await assignServices(id, draft.serviceIds);
        setToast(`${draft.name} updated`);
      }
    } else {
      if (!salonId) {
        setToast("Couldn't determine your salon — please sign in again");
        return;
      }
      const { data: rows, error } = await supabase
        .from("station_types")
        .insert({ ...payload, salon_id: salonId })
        .select();
      if (error) {
        console.error("[station insert]", error);
        setToast(`Couldn't add station — ${error.message}`);
      } else {
        const created = (rows ?? [])[0] as { id: number } | undefined;
        const newId = created?.id ?? Date.now();
        setStations((prev) => [
          ...prev,
          { id: newId, name: draft.name, count: draft.count },
        ]);
        if (created) await assignServices(newId, draft.serviceIds);
        setToast(`${draft.name} added`);
      }
    }
  };

  const confirmRemoveStation = async () => {
    if (!confirmStation) return;
    const removed = confirmStation;
    setStations((prev) => prev.filter((s) => s.id !== removed.id));
    const { error } = await supabase.from("station_types").delete().eq("id", removed.id);
    if (error) {
      setStations((prev) => [...prev, removed]);
      setToast("Couldn't remove — please try again");
    } else {
      setToast(`${removed.name} removed`);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const activeCount = staff.filter((s) => s.active).length;
  const totalStationSlots = stations.reduce((sum, s) => sum + s.count, 0);

  // Map station_type_id → services that use it
  const servicesByStation = new Map<number, ServiceStub[]>();
  for (const svc of services) {
    if (svc.station_type_id == null) continue;
    const list = servicesByStation.get(svc.station_type_id) ?? [];
    list.push(svc);
    servicesByStation.set(svc.station_type_id, list);
  }

  return (
    <div className="page-app page-staff">
      <Sidebar />
      <MobileTopBar />

      <main className="main">
        <div className="page-header">
          <div className="header-row">
            <div>
              <div className="eyebrow">Your people &amp; spaces</div>
              <h1 className="page-title">Staff &amp; Stations</h1>
              <p className="page-sub">
                The team behind every appointment, and the workspaces they use.
                Station counts control how many bookings can run at the same time.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-400)", fontSize: 14 }}>
            Loading…
          </div>
        ) : (
          <>
            {/* ── Staff section ── */}
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">Staff roster</h2>
                <div className="section-aside" style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span>
                    <strong>{activeCount}</strong> of {staff.length} active
                  </span>
                  <button type="button" className="btn btn-primary" onClick={openAddStaff}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add staff
                  </button>
                </div>
              </div>

              {staff.length === 0 ? (
                <p style={{ padding: "32px 0", color: "var(--ink-400)", fontSize: 14 }}>
                  No staff added yet — add your first team member above.
                </p>
              ) : (
                <div className="staff-list">
                  {staff.map((s) => (
                    <div key={s.id} className={`staff-row ${s.active ? "" : "inactive"}`}>
                      <div className="staff-avatar">
                        {s.name.split(/\s+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()}
                      </div>
                      <div className="staff-info">
                        <div className="staff-name">{s.name}</div>
                        <div className="staff-meta">
                          {s.role || "—"}
                          {s.dob ? ` · DOB ${s.dob}` : ""}
                        </div>
                      </div>
                      <div className="staff-numbers">
                        {s.salary !== "" && s.salary != null ? (
                          <div className="staff-stat">
                            <span className="staff-stat-label">Salary</span>
                            <span className="staff-stat-value">{lkr(Number(s.salary))}/mo</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="staff-status">
                        <span className={`chip ${s.active ? "chip-success" : "chip-gray"}`}>
                          {s.active ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="staff-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Edit ${s.name}`}
                          onClick={() => openEditStaff(s)}
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
                          onClick={() => handleDeleteClick(s)}
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
                  ))}
                </div>
              )}
            </section>

            {/* ── Stations section ── */}
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">Stations</h2>
                <div className="section-aside" style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span>
                    <strong>{totalStationSlots}</strong> total slot{totalStationSlots !== 1 ? "s" : ""} across {stations.length} type{stations.length !== 1 ? "s" : ""}
                  </span>
                  <button type="button" className="btn btn-primary" onClick={openAddStation}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add station
                  </button>
                </div>
              </div>

              {stations.length === 0 ? (
                <p style={{ padding: "32px 0", color: "var(--ink-400)", fontSize: 14 }}>
                  No stations defined yet — add your first one above.
                </p>
              ) : (
                <div className="station-grid">
                  {stations.map((st) => {
                    const linked = servicesByStation.get(st.id) ?? [];
                    return (
                      <div key={st.id} className="station-card">
                        <div className="station-count">{st.count}</div>
                        <div className="station-name">{st.name}</div>
                        <div className="station-label">
                          {st.count === 1 ? "station" : "stations"}
                        </div>

                        {/* Services that use this station */}
                        {linked.length > 0 && (
                          <div className="station-services">
                            {linked.map((svc) => (
                              <span key={svc.id} className="station-service-chip">
                                {svc.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {linked.length === 0 && (
                          <div className="station-services station-services-empty">
                            No services assigned yet
                          </div>
                        )}

                        <div className="station-actions">
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Edit ${st.name}`}
                            onClick={() => openEditStation(st)}
                          >
                            <svg viewBox="0 0 24 24">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Remove ${st.name}`}
                            onClick={() => setConfirmStation(st)}
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
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <MobileTabBar active="more" />

      <StaffFormModal
        open={staffFormOpen}
        staff={editingStaff}
        onClose={() => setStaffFormOpen(false)}
        onSave={handleSaveStaff}
      />

      <StationTypeFormModal
        open={stationFormOpen}
        stationType={editingStation}
        onClose={() => setStationFormOpen(false)}
        onSave={handleSaveStation}
      />

      <ConfirmDialog
        open={!!confirmStaff}
        onClose={() => setConfirmStaff(null)}
        onConfirm={confirmRemoveStaff}
        eyebrow="Remove from roster"
        title="Remove this staff member?"
        body={
          confirmStaff ? (
            <>
              You&rsquo;re about to remove <em>{confirmStaff.name}</em> from your
              roster. Past appointments will keep their records.
            </>
          ) : null
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
      />

      <ConfirmDialog
        open={!!confirmStation}
        onClose={() => setConfirmStation(null)}
        onConfirm={confirmRemoveStation}
        eyebrow="Remove station"
        title="Remove this station type?"
        body={
          confirmStation ? (
            <>
              You&rsquo;re about to remove <em>{confirmStation.name}</em>.
              This will affect availability checks for future bookings.
            </>
          ) : null
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
      />

      <StaffReassignModal
        open={reassignMode !== null}
        mode={reassignMode ?? "deactivate"}
        staffName={reassignTarget?.name ?? ""}
        appointments={reassignAppts}
        otherStaff={staff
          .filter((s) => s.active && s.id !== reassignTarget?.id)
          .map((s) => ({ id: s.id, name: s.name }))}
        onConfirm={proceedAfterReassign}
        onCancel={() => {
          setReassignAppts([]);
          setReassignMode(null);
          setReassignTarget(null);
          setReassignDraft(null);
        }}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
