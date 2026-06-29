const BASE = "";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
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
  getAuditLog: (id: string) => request<any[]>(`/sessions/${id}/audit-log`),
  refreshAuth: () => request<void>("/auth/refresh", { method: "POST" }),
};
