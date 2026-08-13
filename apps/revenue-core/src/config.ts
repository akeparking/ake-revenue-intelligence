export interface AppConfig {
  port: number;
  defaultWorkspaceId: string;
  defaultUserId: string;
  defaultRole: string;
  apiAuthMode: "demo" | "api-key";
  apiKey?: string;
  storeDriver: "memory" | "postgres";
  databaseUrl?: string;
  redisUrl?: string;
  demoSeed: boolean;
  adsMode: "mock" | "live";
  fieldEncryptionKey?: string;
  google: {
    webhookKey?: string;
    accessToken?: string;
    adsAccountId?: string;
    conversionActionId?: string;
    validateOnly: boolean;
  };
  meta: {
    verifyToken?: string;
    appSecret?: string;
    accessToken?: string;
    datasetId?: string;
    graphVersion: string;
    leadEventSource: string;
  };
  ai: {
    autoSend: false;
    provider: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
  erp: {
    provider: string;
    baseUrl?: string;
    apiKey?: string;
  };
  okki: {
    enabled: boolean;
    baseUrl: string;
    clientId?: string;
    clientSecret?: string;
    defaultLimit: number;
  };
  requirementEngine: {
    baseUrl: string;
    token?: string;
    timeoutMs: number;
  };
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env.AI_AUTO_SEND && env.AI_AUTO_SEND.toLowerCase() !== "false") {
    throw new Error("AI_AUTO_SEND is locked to false for the MVP");
  }

  return {
    port: Number(env.PORT || 4100),
    defaultWorkspaceId: env.DEFAULT_WORKSPACE_ID || "ake-demo",
    defaultUserId: env.DEFAULT_USER_ID || "ake-admin",
    defaultRole: env.DEFAULT_ROLE || "admin",
    apiAuthMode: env.API_AUTH_MODE === "api-key" ? "api-key" : "demo",
    apiKey: env.API_KEY,
    storeDriver: env.STORE_DRIVER === "postgres" ? "postgres" : "memory",
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    demoSeed: bool(env.DEMO_SEED, true),
    adsMode: env.ADS_MODE === "live" ? "live" : "mock",
    fieldEncryptionKey: env.FIELD_ENCRYPTION_KEY,
    google: {
      webhookKey: env.GOOGLE_LEAD_WEBHOOK_KEY,
      accessToken: env.GOOGLE_DATA_MANAGER_ACCESS_TOKEN,
      adsAccountId: env.GOOGLE_ADS_ACCOUNT_ID,
      conversionActionId: env.GOOGLE_CONVERSION_ACTION_ID,
      validateOnly: bool(env.GOOGLE_VALIDATE_ONLY, true),
    },
    meta: {
      verifyToken: env.META_VERIFY_TOKEN,
      appSecret: env.META_APP_SECRET,
      accessToken: env.META_ACCESS_TOKEN,
      datasetId: env.META_DATASET_ID,
      graphVersion: env.META_GRAPH_VERSION || "v26.0",
      leadEventSource: env.META_LEAD_EVENT_SOURCE || "AKE Revenue CRM",
    },
    ai: {
      autoSend: false,
      provider: env.MODEL_PROVIDER || "mock",
      baseUrl: env.MODEL_BASE_URL,
      model: env.MODEL_NAME,
      apiKey: env.MODEL_API_KEY,
    },
    erp: {
      provider: env.ERP_PROVIDER || "mock",
      baseUrl: env.ERP_BASE_URL,
      apiKey: env.ERP_API_KEY,
    },
    okki: {
      enabled: bool(env.OKKI_SYNC_ENABLED, false),
      baseUrl: env.OKKI_BASE_URL || "https://api-sandbox.xiaoman.cn",
      clientId: env.OKKI_CLIENT_ID,
      clientSecret: env.OKKI_CLIENT_SECRET,
      defaultLimit: Math.max(1, Math.min(Number(env.OKKI_SYNC_LIMIT || 25), 100)),
    },
    requirementEngine: {
      baseUrl: env.REQUIREMENT_ENGINE_URL || "http://127.0.0.1:4200",
      token: env.REQUIREMENT_ENGINE_TOKEN,
      timeoutMs: Math.max(1_000, Math.min(Number(env.REQUIREMENT_ENGINE_TIMEOUT_MS || 35_000), 120_000)),
    },
  };
}
