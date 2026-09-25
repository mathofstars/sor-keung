import type { InstalledAppRecord } from "./types";

export type AppResolution =
  | { kind: "resolved"; app: InstalledAppRecord }
  | { kind: "ambiguous"; query: string; matches: readonly InstalledAppRecord[] }
  | { kind: "not-found"; query: string };

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/\.app$/i, "")
    .replace(/[“”"'‘’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function extractRequestedAppName(input: string): string {
  let value = input.trim();

  value = value.replace(
    /^\s*(?:please\s+)?(?:open|launch|start)\s+/i,
    ""
  );
  value = value.replace(
    /^\s*請?(?:幫我)?(?:打開|開啟|啟動|開)\s*/u,
    ""
  );
  value = value.replace(/\s+please[.!?。！]*\s*$/i, "");
  value = value.replace(/[.!?。！]+\s*$/u, "");

  return value.trim();
}

function aliases(app: InstalledAppRecord): string[] {
  const values = [
    app.displayName,
    app.launchName,
    app.bundleIdentifier?.split(".").at(-1) ?? ""
  ]
    .map(normalize)
    .filter((value) => value.length >= 2);

  return [...new Set(values)];
}

export function resolveInstalledApp(
  input: string,
  apps: readonly InstalledAppRecord[]
): AppResolution {
  const query = normalize(extractRequestedAppName(input));
  if (!query) return { kind: "not-found", query: "" };

  const exact = apps.filter((app) => aliases(app).includes(query));
  if (exact.length === 1) return { kind: "resolved", app: exact[0] };
  if (exact.length > 1) {
    return { kind: "ambiguous", query, matches: exact };
  }

  const phraseMatches = apps.filter((app) =>
    aliases(app).some((alias) => {
      const paddedInput = ` ${normalize(input)} `;
      return paddedInput.includes(` ${alias} `);
    })
  );

  if (phraseMatches.length === 1) {
    return { kind: "resolved", app: phraseMatches[0] };
  }

  if (phraseMatches.length > 1) {
    return { kind: "ambiguous", query, matches: phraseMatches };
  }

  return { kind: "not-found", query };
}
