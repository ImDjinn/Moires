const BASE = "";

async function request<T>(path: string, options?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  // 401 = token ADO expiré (durée 1h < session 8h). On tente un refresh une fois,
  // puis on rejoue la requête ; si le refresh échoue, on relance le login Azure AD.
  if (res.status === 401 && !retried && path !== "/auth/refresh") {
    const refresh = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refresh.ok) return request<T>(path, options, true);
    if (typeof window !== "undefined") window.location.href = "/auth/login";
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
  selectOrganization: (org: string) =>
    request<{ selected: string }>("/ado/organizations/select", {
      method: "POST",
      body: JSON.stringify({ org }),
    }),
  getProjects: () => request<{ id: string; name: string }[]>("/ado/projects"),
  getIterations: (projectId: string) =>
    request<{ id: string; name: string; startDate: string; finishDate: string }[]>(
      `/ado/projects/${projectId}/iterations`,
    ),
  getAreas: (projectId: string) =>
    request<{ path: string }[]>(`/ado/projects/${projectId}/areas`),
  getTeamMembers: (projectId: string) =>
    request<{ id: string; displayName: string; capacityHoursPerDay: number }[]>(
      `/ado/projects/${projectId}/team-members`,
    ),
  createSession: (body: { adoProjectId: string; adoIterationIds?: string[]; areaPaths?: string[] }) =>
    request<any>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  getSnapshot: (id: string) => request<any>(`/sessions/${id}`),
  syncSession: (id: string) => request<any>(`/sessions/${id}/sync`, { method: "POST" }),
  setCapacity: (
    sessionId: string,
    cap: { memberId: string; iterationPath: string; storyPoints: number },
  ) =>
    request<any>(`/sessions/${sessionId}/capacities`, {
      method: "PUT",
      body: JSON.stringify(cap),
    }),
  setMemberMeta: (
    sessionId: string,
    meta: { memberId: string; poste: string; role: string },
  ) =>
    request<any>(`/sessions/${sessionId}/member-meta`, {
      method: "PUT",
      body: JSON.stringify(meta),
    }),
  getTypeFields: (sessionId: string, type: string) =>
    request<{ referenceName: string; name: string; defaultValue: string | number | boolean | null; alwaysRequired?: boolean; allowedValues?: string[] }[]>(
      `/sessions/${sessionId}/field-defs/${encodeURIComponent(type)}`,
    ),
  duplicateTicket: (sessionId: string, ticketId: string) =>
    request<import("@moires/shared").Ticket>(`/sessions/${sessionId}/tickets/${ticketId}/duplicate`, { method: "POST" }),
  getAuditLog: (id: string) => request<any[]>(`/sessions/${id}/audit-log`),
  refreshAuth: () => request<void>("/auth/refresh", { method: "POST" }),

  // --- Jalons & flags (entités propres, persistées en base) ---
  getAnnotations: (id: string) =>
    request<{ milestones: import("@moires/shared").Milestone[]; rowPins: import("@moires/shared").RowPin[] }>(
      `/sessions/${id}/annotations`,
    ),
  createMilestone: (id: string, body: { title: string; iter: number; color: string }) =>
    request<import("@moires/shared").Milestone>(`/sessions/${id}/milestones`, { method: "POST", body: JSON.stringify(body) }),
  updateMilestone: (id: string, mid: string, body: Partial<{ title: string; iter: number; color: string }>) =>
    request<import("@moires/shared").Milestone>(`/sessions/${id}/milestones/${mid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMilestone: (id: string, mid: string) =>
    request<void>(`/sessions/${id}/milestones/${mid}`, { method: "DELETE" }),
  createRowPin: (id: string, body: { rowKey: string; iter: number; title: string; color: string }) =>
    request<import("@moires/shared").RowPin>(`/sessions/${id}/row-pins`, { method: "POST", body: JSON.stringify(body) }),
  updateRowPin: (id: string, pid: string, body: Partial<{ iter: number; title: string; color: string }>) =>
    request<import("@moires/shared").RowPin>(`/sessions/${id}/row-pins/${pid}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteRowPin: (id: string, pid: string) =>
    request<void>(`/sessions/${id}/row-pins/${pid}`, { method: "DELETE" }),
};
