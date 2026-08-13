import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const envPath = process.env.AKE_CRM_ENV_FILE || resolve(projectRoot, ".env.local");
const composePrefix = [
  "compose",
  "--env-file", envPath,
  "-f", resolve(projectRoot, "compose.yaml"),
  "-f", resolve(projectRoot, "compose.local.yaml"),
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function docker(args) {
  return execFileSync("docker", args, { cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

function container(service) {
  const id = docker([...composePrefix, "ps", "-q", service]);
  assert(id, "Container is not running: " + service);
  return JSON.parse(docker(["inspect", id]))[0];
}

function networkNames(inspect) {
  return Object.keys(inspect.NetworkSettings.Networks || {}).sort();
}

function publishedBindings(inspect) {
  return Object.values(inspect.HostConfig.PortBindings || {}).flatMap((bindings) => bindings || []);
}

function assertLoopbackPort(inspect, containerPort, hostPort) {
  const bindings = inspect.HostConfig.PortBindings?.[containerPort + "/tcp"] || [];
  assert(bindings.length === 1, "Expected one published binding for " + hostPort);
  assert(bindings[0].HostIp === "127.0.0.1" && bindings[0].HostPort === String(hostPort), "Port " + hostPort + " is not loopback-only");
}

function assertNoHostPort(inspect, service) {
  assert(publishedBindings(inspect).length === 0, service + " unexpectedly publishes a host port");
}

const services = Object.fromEntries([
  "postgres",
  "redis",
  "requirement-engine",
  "revenue-core",
  "revenue-worker",
  "workspace-web",
  "chatwoot-web",
  "chatwoot-worker",
].map((service) => [service, container(service)]));

const backendName = "ake-revenue-crm_backend";
const frontendName = "ake-revenue-crm_frontend";
const egressName = "ake-revenue-crm_egress";
const backend = JSON.parse(docker(["network", "inspect", backendName]))[0];
const frontend = JSON.parse(docker(["network", "inspect", frontendName]))[0];
const egress = JSON.parse(docker(["network", "inspect", egressName]))[0];
assert(backend.Internal === true, "backend network is not internal");
assert(frontend.Internal === false, "frontend network must permit loopback publication");
assert(egress.Internal === false, "egress network is unexpectedly internal");

assert(JSON.stringify(networkNames(services.postgres)) === JSON.stringify([backendName]), "PostgreSQL network boundary drifted");
assert(JSON.stringify(networkNames(services.redis)) === JSON.stringify([backendName]), "Redis network boundary drifted");
assert(JSON.stringify(networkNames(services["requirement-engine"])) === JSON.stringify([backendName]), "Requirement engine network boundary drifted");
assert(JSON.stringify(networkNames(services["workspace-web"])) === JSON.stringify([backendName, frontendName]), "Workspace Web network boundary drifted");
assert(JSON.stringify(networkNames(services["revenue-core"])) === JSON.stringify([backendName, egressName]), "Revenue Core network boundary drifted");

for (const service of ["postgres", "redis", "requirement-engine", "revenue-worker", "chatwoot-worker"]) {
  assertNoHostPort(services[service], service);
}
assertLoopbackPort(services["workspace-web"], 3000, 3000);
assertLoopbackPort(services["revenue-core"], 4100, 4100);
assertLoopbackPort(services["chatwoot-web"], 3000, 3001);

const engine = services["requirement-engine"];
assert(engine.HostConfig.ReadonlyRootfs === true, "Requirement engine root filesystem is writable");
const engineMounts = Object.fromEntries((engine.Mounts || []).map((mount) => [mount.Destination, mount]));
for (const destination of ["/knowledge", "/opt/ake-followup", "/opt/qmd"]) {
  assert(engineMounts[destination], "Requirement engine mount is missing: " + destination);
  assert(engineMounts[destination].RW === false, "Requirement engine mount is writable: " + destination);
}
const engineEnvNames = new Set((engine.Config.Env || []).map((entry) => entry.split("=", 1)[0]));
for (const forbidden of ["DATABASE_URL", "POSTGRES_USER", "POSTGRES_PASSWORD", "REDIS_URL"]) {
  assert(!engineEnvNames.has(forbidden), "Requirement engine received forbidden credential: " + forbidden);
}

console.log(JSON.stringify({
  networks: {
    backend: { internal: backend.Internal },
    frontend: { internal: frontend.Internal, members: Object.keys(frontend.Containers || {}).length },
    egress: { internal: egress.Internal },
  },
  serviceNetworks: Object.fromEntries(Object.entries(services).map(([name, inspect]) => [name, networkNames(inspect)])),
  publishedPorts: {
    workspaceWeb: "127.0.0.1:3000",
    revenueCore: "127.0.0.1:4100",
    chatwootWeb: "127.0.0.1:3001",
    postgres: "none",
    redis: "none",
    requirementEngine: "none",
  },
  requirementEngine: {
    readOnlyRootFilesystem: engine.HostConfig.ReadonlyRootfs,
    readOnlyMounts: ["/knowledge", "/opt/ake-followup", "/opt/qmd"],
    databaseCredentialsPresent: false,
  },
}, null, 2));
