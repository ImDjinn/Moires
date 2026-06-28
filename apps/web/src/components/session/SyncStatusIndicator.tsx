import type { Ticket } from "@moires/shared";

interface Props {
  status: Ticket["syncStatus"];
  onRetry?: () => void;
}

export function SyncStatusIndicator({ status, onRetry }: Props) {
  if (status === "synced") {
    return <span style={{ color: "var(--color-synced)", fontSize: 10 }} title="Synchronisé">●</span>;
  }
  if (status === "pending") {
    return (
      <span
        style={{ color: "var(--color-pending)", fontSize: 10, animation: "pulse 1.5s infinite" }}
        title="En attente de sync"
      >
        ◐
      </span>
    );
  }
  return (
    <span
      style={{ color: "var(--color-error)", fontSize: 12, cursor: onRetry ? "pointer" : "default" }}
      title="Erreur de sync — cliquer pour réessayer"
      onClick={onRetry}
    >
      ⚠
    </span>
  );
}
