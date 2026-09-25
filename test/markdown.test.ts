import assert from "node:assert/strict";
import test from "node:test";
import { markdownToSafeHtml } from "../desktop/markdown";

test("assistant Markdown renders bold text", () => {
  const html = markdownToSafeHtml("**Downloads**");
  assert.match(html, /<strong>Downloads<\/strong>/);
});

test("assistant Markdown renders headings", () => {
  const html = markdownToSafeHtml("### macOS");
  assert.match(html, /<h3>macOS<\/h3>/);
});

test("assistant Markdown renders unordered and ordered lists", () => {
  const unordered = markdownToSafeHtml("- One\n- Two");
  const ordered = markdownToSafeHtml("1. One\n2. Two");
  assert.match(unordered, /<ul>/);
  assert.match(unordered, /<li>One<\/li>/);
  assert.match(unordered, /<li>Two<\/li>/);
  assert.match(ordered, /<ol>/);
});

test("assistant Markdown renders fenced code blocks and inline code", () => {
  const block = markdownToSafeHtml("```sh\necho hello\n```");
  const inline = markdownToSafeHtml("Use `npm test`.");
  assert.match(block, /<pre><code>echo hello\n<\/code><\/pre>/);
  assert.match(inline, /<code>npm test<\/code>/);
});

test("assistant Markdown renders blockquotes and emphasis", () => {
  const html = markdownToSafeHtml("> *Important*");
  assert.match(html, /<blockquote>/);
  assert.match(html, /<em>Important<\/em>/);
});

test("raw HTML and active DOM content are neutralised", () => {
  const html = markdownToSafeHtml('<script>alert("x")</script>\n<img src=x onerror="alert(1)">\n**safe**');
  assert.doesNotMatch(html, /<script(?:\s|>)/i);
  assert.doesNotMatch(html, /<img(?:\s|>)/i);
  assert.match(html, /&#x3C;script>/);
  assert.match(html, /onerror="alert\(1\)"/);
  assert.match(html, /<strong>safe<\/strong>/);
});

test("Markdown safe policy does not allow links or arbitrary attributes", () => {
  const html = markdownToSafeHtml("[click](javascript:alert(1))");
  assert.doesNotMatch(html, /href=|javascript:/i);
  assert.match(html, /click/);
});
