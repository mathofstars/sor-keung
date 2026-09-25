import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ActionDispatcher } from "./actions/dispatcher";
import { MacOsActionAdapter } from "./actions/macos";
import { WindowsActionAdapter } from "./actions/windows";
import { SorKeungBrain } from "./brain/service";
import { t, type SupportedUiLanguage } from "./i18n";
import { OpenRouterJevDecisionProvider } from "./providers/openrouter-jev";

function getUiLanguage(): SupportedUiLanguage {
  return process.env.UI_LANGUAGE === "en-GB" ? "en-GB" : "zh-HK";
}

async function main(): Promise<void> {
  const locale = getUiLanguage();
  const rl = readline.createInterface({ input, output });

  try {
    output.write(`${t("app.name", locale)}\n`);
    const text = await rl.question(t("cli.prompt", locale));

    const adapter =
      process.platform === "darwin"
        ? new MacOsActionAdapter()
        : process.platform === "win32"
          ? new WindowsActionAdapter()
          : null;

    if (!adapter) {
      output.write(`${t("platform.unsupported", locale)}\n`);
      return;
    }

    const brain = new SorKeungBrain(
      new OpenRouterJevDecisionProvider(),
      new ActionDispatcher(adapter)
    );

    const result = await brain.handle({
      text,
      inputLanguage: process.env.INPUT_LANGUAGE ?? "yue-HK",
      outputLanguage: process.env.OUTPUT_LANGUAGE ?? "yue-HK",
      responseLanguageMode:
        process.env.RESPONSE_LANGUAGE_MODE === "fixed" ? "fixed" : "follow-input"
    });

    const app =
      result.data && typeof result.data.app === "string" ? result.data.app : "";

    output.write(`${t(result.messageKey, locale, { app })}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    output.write(`${t("error.runtime", locale, { message })}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

void main();
