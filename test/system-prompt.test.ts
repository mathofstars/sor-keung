import assert from "node:assert/strict";
import test from "node:test";
import { buildSorKeungSystemPrompt } from "../src/brain/system-prompt";

test("default Chinese response style is natural Hong Kong conversational Cantonese", () => {
  const prompt = buildSorKeungSystemPrompt({
    prompt: "解釋量子糾纏",
    responseLanguageMode: "follow-input"
  });

  assert.match(prompt, /same language as the user's message/i);
  assert.match(prompt, /conversational Hong Kong Cantonese/i);
  assert.match(prompt, /Traditional Chinese/i);
  assert.match(prompt, /not.*Simplified Chinese/i);
});

test("written Hong Kong Chinese style explicitly requires standard written grammar", () => {
  const prompt = buildSorKeungSystemPrompt({
    prompt: "解釋量子糾纏",
    responseLanguageMode: "follow-input",
    responseStyle: "written-zh-hk"
  });

  assert.match(prompt, /standard written Hong Kong Traditional Chinese/i);
  assert.match(prompt, /standard written Chinese grammar/i);
  assert.match(prompt, /not conversational Cantonese/i);
  assert.match(prompt, /Do not use Simplified Chinese/i);
  assert.match(prompt, /係、唔、佢、佢哋、點解、咁、嚟、嘅、喺、咗/);
  assert.match(prompt, /是、不/);
  assert.doesNotMatch(prompt, /natural written conversational Hong Kong Cantonese/i);
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
