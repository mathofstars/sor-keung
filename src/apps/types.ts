export interface InstalledAppRecord {
  id: string;
  displayName: string;
  platform: "macos" | "windows";
  bundleIdentifier?: string;
  launchName: string;
}

export interface AppCatalog {
  list(): Promise<readonly InstalledAppRecord[]>;
}

export interface AppAccessPolicy {
  allowAllInstalledApps: boolean;
  allowedAppIds: readonly string[];
}

export const DEFAULT_APP_ACCESS_POLICY: AppAccessPolicy = {
  allowAllInstalledApps: true,
  allowedAppIds: []
};

export class StaticAppCatalog implements AppCatalog {
  constructor(private readonly apps: readonly InstalledAppRecord[]) {}

  async list(): Promise<readonly InstalledAppRecord[]> {
    return this.apps;
  }
}

export function isAppAllowed(
  app: InstalledAppRecord,
  policy: AppAccessPolicy = DEFAULT_APP_ACCESS_POLICY
): boolean {
  return (
    policy.allowAllInstalledApps ||
    new Set(policy.allowedAppIds).has(app.id)
  );
}
