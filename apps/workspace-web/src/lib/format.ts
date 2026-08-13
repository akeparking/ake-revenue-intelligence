export function formatRelative(value: string, now = Date.now()): string {
  const deltaMinutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (deltaMinutes < 1) return "now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function countryName(code?: string): string {
  if (!code) return "Unspecified";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

export function conversionRate(qualified: number, total: number): string {
  return total ? `${Math.round((qualified / total) * 100)}%` : "—";
}
