import assert from "node:assert/strict";
import test from "node:test";
import { buildSorKeungSystemPrompt } from "../src/brain/system-prompt";

test("follow-input prompt asks for matching language and Hong Kong Traditional Chinese", () => {
  const prompt = buildSorKeungSystemPrompt({
    prompt: "解釋量子糾纏",
    responseLanguageMode: "follow-input"
  });

  assert.match(prompt, /same language as the user's message/i);
  assert.match(prompt, /Traditional Chinese/i);
  assert.match(prompt, /not Simplified Chinese/i);
});

test("fixed en-GB output requests English", () => {
  const prompt = buildSorKeungSystemPrompt({
    prompt: "你好",
    responseLanguageMode: "fixed",
    outputLanguage: "en-GB"
  });

  assert.match(prompt, /Reply in English/);
});

test("system prompt preserves the action security boundary", () => {
  const prompt = buildSorKeungSystemPrompt({
    prompt: "Delete my files",
    responseLanguageMode: "follow-input"
  });

  assert.match(prompt, /cannot execute computer actions/i);
  assert.match(prompt, /action allowlist/i);
  assert.match(prompt, /text response/i);
});
