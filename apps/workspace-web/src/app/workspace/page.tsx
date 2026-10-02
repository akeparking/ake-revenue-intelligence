import { getDashboard } from "../../lib/api";
import { WorkspaceClient } from "../workspace-client";

export const dynamic = "force-dynamic";
export default async function Workspace() {
  const { data, connected } = await getDashboard();
  return <WorkspaceClient initialData={data} connected={connected} />;
}
