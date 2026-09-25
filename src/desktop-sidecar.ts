import * as readline from "node:readline";
import {
  handleDesktopSidecarRequestFromEnvironment,
  type DesktopSidecarRequest,
  type DesktopSidecarResponse
} from "./desktop-sidecar-service";

function writeResponse(response: DesktopSidecarResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  for await (const line of rl) {
    rl.close();

    let request: DesktopSidecarRequest;
    try {
      request = JSON.parse(line) as DesktopSidecarRequest;
    } catch {
      writeResponse({
        ok: false,
        kind: "error",
        message: "Invalid sidecar request."
      });
      return;
    }

    const response =
      await handleDesktopSidecarRequestFromEnvironment(request);
    writeResponse(response);
    return;
  }

  writeResponse({
    ok: false,
    kind: "error",
    message: "No sidecar request received."
  });
}

void main().catch(() => {
  writeResponse({
    ok: false,
    kind: "error",
    message: "Sor-Keung sidecar failed."
  });
  process.exitCode = 1;
});
