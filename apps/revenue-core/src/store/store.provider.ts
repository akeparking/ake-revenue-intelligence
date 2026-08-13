import type { Provider } from "@nestjs/common";
import { loadConfig } from "../config";
import { MemoryRevenueStore } from "./memory.store";
import { PostgresRevenueStore } from "./postgres.store";
import { REVENUE_STORE } from "./store.types";

export const revenueStoreProvider: Provider = {
  provide: REVENUE_STORE,
  useFactory: () => {
    const config = loadConfig();
    if (config.storeDriver === "postgres") {
      if (!config.databaseUrl) throw new Error("DATABASE_URL is required when STORE_DRIVER=postgres");
      return new PostgresRevenueStore(config.databaseUrl, config.fieldEncryptionKey);
    }
    return new MemoryRevenueStore();
  },
};
