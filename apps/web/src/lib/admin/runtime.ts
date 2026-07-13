import "server-only";

import { PostgresInventoryRepository, type PostgresPoolLike } from "@gacha/inventory";

import { AdminAuthService } from "./auth-service";
import { getAdminConfiguration } from "./config";
import { getAdminDatabase } from "./database";
import { AdminInventoryService } from "./inventory-service";
import { PostgresAdminAuthStore } from "./postgres-auth-store";
import type { AdminRuntimeConfig } from "./types";

export type AdminRuntime = {
  auth: AdminAuthService;
  config: AdminRuntimeConfig;
  database: PostgresPoolLike;
  inventory: AdminInventoryService;
};

let runtime: AdminRuntime | null | undefined;

export const getAdminRuntime = (): AdminRuntime | null => {
  if (runtime !== undefined) return runtime;
  const configuration = getAdminConfiguration();
  if (!configuration.configured) {
    runtime = null;
    return runtime;
  }
  const database = getAdminDatabase(configuration.config);
  runtime = {
    auth: new AdminAuthService(new PostgresAdminAuthStore(database), configuration.config),
    config: configuration.config,
    database,
    inventory: new AdminInventoryService(new PostgresInventoryRepository(database))
  };
  return runtime;
};
