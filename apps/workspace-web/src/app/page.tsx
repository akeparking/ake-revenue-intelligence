import { getDashboard } from "../lib/api";
import { WorkspaceClient } from "./workspace-client";

export default async function Home() {
  const { data, connected } = await getDashboard();
  return <WorkspaceClient initialData={data} connected={connected} />;
}
