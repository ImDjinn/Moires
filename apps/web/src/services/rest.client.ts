import type { SessionSnapshot, Capacity, MemberMeta, Ticket, Milestone, RowPin } from "@moirai/shared";

const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  // 401 = PAT Azure DevOps invalide/révoqué. On efface la session et on renvoie
  // à l'écran de connexion (le PAT n'a pas de refresh — il est saisi à la main).
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      await fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" });
      window.location.href = "/";
    }
    throw new Error("Session Azure DevOps expirée — reconnectez-vous");
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getOrganizations: () =>
    request<{ organizations: { id: string; name: string }[]; selected: string | null }>(
      "/ado/organizations",
    ),
  getProjects: () => request<{ id: string; name: string }[]>("/ado/projects"),
  createSession: (body: { adoProjectId: string; adoIterationIds?: string[]; areaPaths?: string[] }) =>
    request<SessionSnapshot>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  getSnapshot: (id: string) => request<SessionSnapshot>(`/sessions/${id}`),
  syncSession: (id: string) => request<SessionSnapshot>(`/sessions/${id}/sync`, { method: "POST" }),
  setCapacity: (
    sessionId: string,
    cap: { memberId: string; iterationPath: string; storyPoints: number },
  ) =>
    request<Capacity[]>(`/sessions/${sessionId}/capacities`, {
      method: "PUT",
      body: JSON.stringify(cap),
    }),
  setMemberMeta: (
    sessionId: string,
    meta: { memberId: string; poste: string; role: string },
  ) =>
    request<MemberMeta[]>(`/sessions/${sessionId}/member-meta`, {
      method: "PUT",
      body: JSON.stringify(meta),
    }),
  getTypeFields: (sessionId: string, type: string) =>
    request<{ referenceName: string; name: string; defaultValue: string | number | boolean | null; alwaysRequired?: boolean; allowedValues?: string[] }[]>(
      `/sessions/${sessionId}/field-defs/${encodeURIComponent(type)}`,
    ),
  duplicateTicket: (sessionId: string, ticketId: string) =>
    request<Ticket>(`/sessions/${sessionId}/tickets/${ticketId}/duplicate`, { method: "POST" }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // --- Jalons & flags (entités propres, persistées en base) ---
  getAnnotations: (id: string) =>
    request<{ milestones: Milestone[]; rowPins: RowPin[] }>(`/sessions/${id}/annotations`),
  createMilestone: (id: string, body: { title: string; iter: number; color: string }) =>
    request<Milestone>(`/sessions/${id}/milestones`, { method: "POST", body: JSON.stringify(body) }),
  updateMilestone: (id: string, mid: string, body: Partial<{ title: string; iter: number; color: string }>) =>
    request<Milestone>(`/sessions/${id}/milestones/${mid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMilestone: (id: string, mid: string) =>
    request<void>(`/sessions/${id}/milestones/${mid}`, { method: "DELETE" }),
  createRowPin: (id: string, body: { rowKey: string; iter: number; title: string; color: string }) =>
    request<RowPin>(`/sessions/${id}/row-pins`, { method: "POST", body: JSON.stringify(body) }),
  updateRowPin: (id: string, pid: string, body: Partial<{ iter: number; title: string; color: string }>) =>
    request<RowPin>(`/sessions/${id}/row-pins/${pid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRowPin: (id: string, pid: string) =>
    request<void>(`/sessions/${id}/row-pins/${pid}`, { method: "DELETE" }),
};
