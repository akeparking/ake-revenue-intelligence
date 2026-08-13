import type { DashboardSnapshot } from "@ake/contracts";

export const emptyDashboard: DashboardSnapshot = {
  metrics: { totalLeads: 0, qualifiedLeads: 0, opportunities: 0, acceptedDeliveries: 0, failedDeliveries: 0 },
  leads: [],
  opportunities: [],
  deliveries: [],
};

export async function getDashboard(): Promise<{ data: DashboardSnapshot; connected: boolean }> {
  const baseUrl = process.env.SERVER_API_URL || "http://127.0.0.1:4100";
  try {
    const response = await fetch(`${baseUrl}/api/v1/dashboard`, {
      headers: {
        "x-workspace-id": process.env.DEFAULT_WORKSPACE_ID || "ake-demo",
        ...(process.env.API_KEY ? { "x-api-key": process.env.API_KEY } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error(`Revenue Core returned ${response.status}`);
    return { data: (await response.json()) as DashboardSnapshot, connected: true };
  } catch {
    return { data: emptyDashboard, connected: false };
  }
}
