import assert from "node:assert/strict";
import test from "node:test";
import {
  StaticAppCatalog,
  isAppAllowed,
  type InstalledAppRecord
} from "../src/apps/types";
import { resolveInstalledApp } from "../src/apps/resolver";

const apps: InstalledAppRecord[] = [
  {
    id: "bundle:com.apple.MobileSMS",
    displayName: "Messages",
    platform: "macos",
    bundleIdentifier: "com.apple.MobileSMS",
    launchName: "Messages"
  },
  {
    id: "bundle:com.apple.calculator",
    displayName: "Calculator",
    platform: "macos",
    bundleIdentifier: "com.apple.calculator",
    launchName: "Calculator"
  },
  {
    id: "bundle:com.apple.Safari",
    displayName: "Safari",
    platform: "macos",
    bundleIdentifier: "com.apple.Safari",
    launchName: "Safari"
  },
  {
    id: "bundle:com.apple.Preview",
    displayName: "Preview",
    platform: "macos",
    bundleIdentifier: "com.apple.Preview",
    launchName: "Preview"
  }
];

test("static installed-app catalogue exposes trusted records", async () => {
  const catalog = new StaticAppCatalog(apps);
  assert.deepEqual(await catalog.list(), apps);
});

for (const [input, expectedId] of [
  ["Open Messages", "bundle:com.apple.MobileSMS"],
  ["開 Calculator", "bundle:com.apple.calculator"],
  ["Open Safari", "bundle:com.apple.Safari"],
  ["Open Preview", "bundle:com.apple.Preview"]
] as const) {
  test(`resolves installed application: ${input}`, () => {
    const result = resolveInstalledApp(input, apps);
    assert.equal(result.kind, "resolved");
    if (result.kind === "resolved") {
      assert.equal(result.app.id, expectedId);
    }
  });
}

test("nonexistent application fails without selecting a different app", () => {
  assert.deepEqual(resolveInstalledApp("Open DefinitelyNotInstalled", apps), {
    kind: "not-found",
    query: "definitelynotinstalled"
  });
});

test("multiple exact installed-app matches fail as ambiguous", () => {
  const duplicates: InstalledAppRecord[] = [
    {
      id: "bundle:com.example.one",
      displayName: "Example",
      platform: "macos",
      bundleIdentifier: "com.example.one",
      launchName: "Example"
    },
    {
      id: "bundle:com.example.two",
      displayName: "Example",
      platform: "macos",
      bundleIdentifier: "com.example.two",
      launchName: "Example"
    }
  ];

  const result = resolveInstalledApp("Open Example", duplicates);
  assert.equal(result.kind, "ambiguous");
});

test("allow-all policy permits any trusted installed app", () => {
  assert.equal(
    isAppAllowed(apps[0], {
      allowAllInstalledApps: true,
      allowedAppIds: []
    }),
    true
  );
});

test("selected-app-only policy blocks disabled app and permits enabled app", () => {
  const policy = {
    allowAllInstalledApps: false,
    allowedAppIds: ["bundle:com.apple.MobileSMS"]
  };

  assert.equal(isAppAllowed(apps[0], policy), true);
  assert.equal(isAppAllowed(apps[1], policy), false);
});

test("catalogue re-scan preserves stable bundle identifiers used by policy", async () => {
  const firstScan = new StaticAppCatalog(apps);
  const secondScan = new StaticAppCatalog(apps.map((app) => ({ ...app })));
  const policy = {
    allowAllInstalledApps: false,
    allowedAppIds: ["bundle:com.apple.MobileSMS"]
  };

  const firstMessages = (await firstScan.list()).find(
    (app) => app.bundleIdentifier === "com.apple.MobileSMS"
  );
  const secondMessages = (await secondScan.list()).find(
    (app) => app.bundleIdentifier === "com.apple.MobileSMS"
  );

  assert.ok(firstMessages);
  assert.ok(secondMessages);
  assert.equal(firstMessages.id, secondMessages.id);
  assert.equal(isAppAllowed(firstMessages, policy), true);
  assert.equal(isAppAllowed(secondMessages, policy), true);
});

test("selected-only policy with no selected apps blocks every installed app", () => {
  const policy = {
    allowAllInstalledApps: false,
    allowedAppIds: []
  };

  for (const app of apps) {
    assert.equal(isAppAllowed(app, policy), false);
  }
});

test("bundle identifier suffixes are never treated as human app-name aliases", () => {
  const safariExtension: InstalledAppRecord = {
    id: "bundle:io.raindrop.mac.Safari",
    displayName: "Save to Raindrop.io",
    platform: "macos",
    bundleIdentifier: "io.raindrop.mac.Safari",
    launchName: "Save to Raindrop.io"
  };

  assert.deepEqual(
    resolveInstalledApp("Open Safari", [safariExtension]),
    {
      kind: "not-found",
      query: "safari"
    }
  );
});

test("real Safari wins when a Safari-named extension bundle is also installed", () => {
  const safari = apps.find(
    (app) => app.bundleIdentifier === "com.apple.Safari"
  );
  assert.ok(safari);

  const safariExtension: InstalledAppRecord = {
    id: "bundle:io.raindrop.mac.Safari",
    displayName: "Save to Raindrop.io",
    platform: "macos",
    bundleIdentifier: "io.raindrop.mac.Safari",
    launchName: "Save to Raindrop.io"
  };

  const result = resolveInstalledApp("Open Safari", [
    safariExtension,
    safari
  ]);

  assert.equal(result.kind, "resolved");
  if (result.kind === "resolved") {
    assert.equal(result.app.bundleIdentifier, "com.apple.Safari");
  }
});

test("macOS catalogue includes the App Cryptex applications root", async () => {
  const rust = await import("node:fs/promises").then(({ readFile }) =>
    readFile("src-tauri/src/lib.rs", "utf8")
  );

  assert.match(
    rust,
    /\/System\/Volumes\/Preboot\/Cryptexes\/App\/System\/Applications/
  );
});
