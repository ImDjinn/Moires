import { useEffect } from "react";
import { useAuthStore } from "../stores/auth.store";

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    fetch("/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .catch(() => setUser(null));
  }, [setUser]);

  return { user, loading };
}
