import Link from "next/link";
import type { ReactNode } from "react";

import { classNames } from "@/lib/utilities/class-names";

type MarkdownProps = {
  readonly source: string;
  readonly className?: string;
};

type Block =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "paragraph"; readonly text: string }
  | { readonly kind: "code"; readonly language: string; readonly code: string }
  | { readonly kind: "quote"; readonly text: string }
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly ListItem[] }
  | { readonly kind: "rule" };

type ListItem = {
  readonly text: string;
  readonly checked: boolean | null;
};


const parseBlocks = (source: string): readonly Block[] => {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", language: fence[1] ?? "", code: codeLines.join("\n") });
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]?.length === 1 ? 1 : heading[1]?.length === 2 ? 2 : 3;
      blocks.push({ kind: "heading", level, text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
        quoteLines.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: quoteLines.join("\n") });
      continue;
    }

    const listMatch = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = listMatch[2] !== undefined;
      const items: ListItem[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const itemMatch = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(current);
        if (!itemMatch || (itemMatch[2] !== undefined) !== ordered) {
          break;
        }
        const body = itemMatch[3] ?? "";
        const checkbox = /^\[( |x|X)\]\s*(.*)$/.exec(body);
        items.push(
          checkbox
            ? { text: checkbox[2] ?? "", checked: checkbox[1] !== " " }
            : { text: body, checked: null },
        );
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (
        current.trim().length === 0 ||
        /^```/.test(current) ||
        /^#{1,3}\s/.test(current) ||
        /^>/.test(current) ||
        /^\s*(?:[-*+]|\d+[.)])\s+/.test(current)
      ) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
};

const isSafeHref = (href: string): boolean =>
  /^(https?:\/\/|mailto:|\/)/i.test(href);

/** Inline markdown: code, bold, italic, strikethrough, links, bare URLs, issue references. */
const renderInline = (text: string, keyPrefix: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<]+)|((?<![\w&])#\d{1,9}\b)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let counter = 0;
  const nextKey = () => `${keyPrefix}-${counter++}`;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (match[1]) {
      nodes.push(<code key={nextKey()}>{token.slice(1, -1)}</code>);
    } else if (match[2] || match[3]) {
      nodes.push(<strong key={nextKey()}>{renderInline(token.slice(2, -2), nextKey())}</strong>);
    } else if (match[4] || match[5]) {
      nodes.push(<em key={nextKey()}>{renderInline(token.slice(1, -1), nextKey())}</em>);
    } else if (match[6]) {
      nodes.push(<s key={nextKey()}>{renderInline(token.slice(2, -2), nextKey())}</s>);
    } else if (match[7]) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      const label = linkMatch?.[1] ?? token;
      const href = linkMatch?.[2] ?? "";
      nodes.push(
        isSafeHref(href) ? (
          <a key={nextKey()} href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          <span key={nextKey()}>{label}</span>
        ),
      );
    } else if (match[8]) {
      nodes.push(
        <a key={nextKey()} href={token} target="_blank" rel="noopener noreferrer">
          {token}
        </a>,
      );
    } else if (match[9]) {
      nodes.push(
        <Link key={nextKey()} href={`/issue/${token.slice(1)}`} className="font-medium">
          {token}
        </Link>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
};

const renderTextWithBreaks = (text: string, keyPrefix: string): ReactNode[] =>
  text.split("\n").flatMap((line, lineIndex, all) =>
    lineIndex < all.length - 1
      ? [...renderInline(line, `${keyPrefix}-l${lineIndex}`), <br key={`${keyPrefix}-br${lineIndex}`} />]
      : renderInline(line, `${keyPrefix}-l${lineIndex}`),
  );

/**
 * Renders a safe subset of Markdown to React elements. No raw HTML is ever
 * emitted, so user content cannot inject markup.
 *
 * Keep this on the server. A Client Component that needs a rendered body takes
 * the elements as a prop — see `MarkdownField` — so the parser never reaches
 * the browser bundle.
 */
export const Markdown = ({ source, className }: MarkdownProps) => {
  const blocks = parseBlocks(source);
  return (
    <div className={classNames("prose-issue", className)}>
      {blocks.map((block, blockIndex) => {
        const key = `block-${blockIndex}`;
        switch (block.kind) {
          case "heading": {
            const content = renderInline(block.text, key);
            return block.level === 1 ? (
              <h1 key={key}>{content}</h1>
            ) : block.level === 2 ? (
              <h2 key={key}>{content}</h2>
            ) : (
              <h3 key={key}>{content}</h3>
            );
          }
          case "paragraph":
            return <p key={key}>{renderTextWithBreaks(block.text, key)}</p>;
          case "code":
            return (
              <pre key={key} data-language={block.language || undefined}>
                <code>{block.code}</code>
              </pre>
            );
          case "quote":
            return <blockquote key={key}>{renderTextWithBreaks(block.text, key)}</blockquote>;
          case "rule":
            return <hr key={key} className="border-border" />;
          case "list":
            return block.ordered ? (
              <ol key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item.text, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            ) : (
              <ul key={key} className={block.items.some((item) => item.checked !== null) ? "list-none pl-0" : undefined}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`} className={item.checked !== null ? "flex items-start gap-2" : undefined}>
                    {item.checked !== null ? (
                      <input type="checkbox" checked={item.checked} readOnly aria-label="Task" className="mt-1.5 accent-accent" />
                    ) : null}
                    <span className={item.checked ? "text-foreground-tertiary line-through" : undefined}>
                      {renderInline(item.text, `${key}-${itemIndex}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
};

