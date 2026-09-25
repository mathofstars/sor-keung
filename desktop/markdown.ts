import { fromMarkdown } from "mdast-util-from-markdown";
import { toHast } from "mdast-util-to-hast";
import { sanitize, type Schema } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";

const SAFE_MARKDOWN_SCHEMA: Schema = {
  tagNames: [
    "p",
    "strong",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "code",
    "pre",
    "blockquote",
    "br"
  ],
  attributes: {}
};

function neutraliseRawHtml(markdown: string): string {
  return markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function markdownToSafeHtml(markdown: string): string {
  const markdownTree = fromMarkdown(neutraliseRawHtml(markdown));
  const htmlTree = toHast(markdownTree, {
    allowDangerousHtml: false
  });

  if (!htmlTree) {
    return "";
  }

  const safeTree = sanitize(htmlTree, SAFE_MARKDOWN_SCHEMA);
  return toHtml(safeTree, {
    allowDangerousHtml: false
  });
}

export function renderAssistantMarkdown(
  element: HTMLElement,
  markdown: string
): void {
  const safeHtml = markdownToSafeHtml(markdown);
  const parsed = new DOMParser().parseFromString(safeHtml, "text/html");
  const fragment = document.createDocumentFragment();

  for (const node of Array.from(parsed.body.childNodes)) {
    fragment.append(document.importNode(node, true));
  }

  element.replaceChildren(fragment);
}
