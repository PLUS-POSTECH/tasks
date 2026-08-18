"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { classNames } from "@/lib/utilities/class-names";

import { Icon } from "./icon";
import { Kbd } from "./kbd";

export type SelectMenuItem = {
  readonly value: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly description?: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly group?: string;
};

/** With `external` the caller owns the query and supplies items that already match. */
export type SelectMenuSearch =
  | { readonly kind: "internal" }
  | { readonly kind: "external"; readonly value: string; readonly onChange: (value: string) => void };

type SelectMenuProps = {
  readonly items: readonly SelectMenuItem[];
  readonly selectedValues?: readonly string[];
  readonly onSelect: (value: string) => void;
  readonly multiple?: boolean;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  readonly search?: SelectMenuSearch;
  readonly emptyMessage?: string;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly onCreate?: (query: string) => void;
  readonly className?: string;
  readonly loading?: boolean;
};

const createValueToken = "__create__";

const matchesQuery = (item: SelectMenuItem, query: string): boolean => {
  if (!query) {
    return true;
  }
  const haystack = [item.label, item.description ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
};

/**
 * The surface around it — `Dialog` or `Popover` — moves the keyboard into the
 * panel when it opens, so this component does not chase focus itself.
 */
export const SelectMenu = ({
  items,
  selectedValues = [],
  onSelect,
  multiple = false,
  searchable = true,
  searchPlaceholder = "Search…",
  search = { kind: "internal" },
  emptyMessage = "No results",
  header,
  footer,
  onCreate,
  className,
  loading = false,
}: SelectMenuProps) => {
  const [internalQuery, setInternalQuery] = useState("");
  const query = search.kind === "external" ? search.value : internalQuery;
  const setQuery = (value: string) => {
    if (search.kind === "external") {
      search.onChange(value);
      return;
    }
    setInternalQuery(value);
  };
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxIdentifier = useId();

  const [lastQuery, setLastQuery] = useState(query);
  if (lastQuery !== query) {
    setLastQuery(query);
    setActiveValue(null);
  }

  const visibleItems = useMemo((): readonly SelectMenuItem[] => {
    const filtered =
      search.kind === "external" ? items : items.filter((item) => matchesQuery(item, query));
    const trimmed = query.trim();
    const canCreate =
      onCreate &&
      trimmed.length > 0 &&
      !filtered.some(
        (item) => item.label.toLowerCase() === trimmed.toLowerCase(),
      );
    return canCreate
      ? [
          ...filtered,
          {
            value: createValueToken,
            label: `Create "${trimmed}"`,
            icon: <Icon name="plus" size={14} />,
          },
        ]
      : filtered;
  }, [items, query, search.kind, onCreate]);

  /**
   * The highlighted row is remembered by value rather than by position: the
   * palette rebuilds its item list when debounced search hits land, and an
   * index would silently move to whatever slid into that slot.
   */
  const highlightedIndex = visibleItems.findIndex((item) => item.value === activeValue);
  const activeIndex = highlightedIndex === -1 ? 0 : highlightedIndex;

  const highlight = (index: number) =>
    setActiveValue(visibleItems[index]?.value ?? null);

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (item: SelectMenuItem) => {
    if (item.disabled) {
      return;
    }
    if (item.value === createValueToken) {
      onCreate?.(query.trim());
      return;
    }
    onSelect(item.value);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        highlight((activeIndex + 1) % Math.max(1, visibleItems.length));
        return;
      case "ArrowUp":
        event.preventDefault();
        highlight(
          (activeIndex - 1 + visibleItems.length) % Math.max(1, visibleItems.length),
        );
        return;
      case "Home":
        event.preventDefault();
        highlight(0);
        return;
      case "End":
        event.preventDefault();
        highlight(Math.max(0, visibleItems.length - 1));
        return;
      case "Enter": {
        event.preventDefault();
        const active = visibleItems[activeIndex];
        if (active) {
          choose(active);
        }
        return;
      }
      default: {
        // Digits only: a letter lands in the search box, where it is the start
        // of a search rather than a shortcut.
        if (
          query.length === 0 &&
          /^[0-9]$/.test(event.key) &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          const shortcutMatch = visibleItems.find((item) => item.shortcut === event.key);
          if (shortcutMatch) {
            event.preventDefault();
            choose(shortcutMatch);
          }
        }
      }
    }
  };

  const groups = useMemo(() => {
    const ordered: { readonly name: string | undefined; readonly items: { item: SelectMenuItem; index: number }[] }[] = [];
    visibleItems.forEach((item, index) => {
      const existing = ordered.find((group) => group.name === item.group);
      if (existing) {
        existing.items.push({ item, index });
      } else {
        ordered.push({ name: item.group, items: [{ item, index }] });
      }
    });
    return ordered;
  }, [visibleItems]);

  return (
    <div
      className={classNames("flex min-w-[220px] max-w-[min(360px,calc(100vw-1rem))] flex-col", className)}
      onKeyDown={handleKeyDown}
    >
      {header}
      {searchable ? (
        <div className="flex items-center gap-2 border-b border-border px-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxIdentifier}
            aria-autocomplete="list"
            aria-activedescendant={
              visibleItems[activeIndex]
                ? `${listboxIdentifier}-${activeIndex}`
                : undefined
            }
            className="h-9 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground-quaternary"
          />
          {loading ? (
            <Icon name="spinner" size={14} className="animate-spin text-foreground-tertiary" />
          ) : null}
        </div>
      ) : null}
      <div
        ref={listRef}
        id={listboxIdentifier}
        role="listbox"
        aria-multiselectable={multiple || undefined}
        tabIndex={searchable ? -1 : 0}
        className="scrollbar-thin flex-1 overflow-y-auto p-1 outline-none"
      >
        {visibleItems.length === 0 ? (
          <div className="px-2 py-3 text-center text-xs text-foreground-tertiary">
            {emptyMessage}
          </div>
        ) : (
          groups.map((group, groupIndex) => (
            <div key={group.name ?? `group-${groupIndex}`}>
              {group.name ? (
                <div className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-foreground-quaternary">
                  {group.name}
                </div>
              ) : null}
              {group.items.map(({ item, index }) => {
                const isSelected = selectedValues.includes(item.value);
                const isActive = index === activeIndex;
                return (
                  <div
                    key={item.value}
                    id={`${listboxIdentifier}-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={item.disabled || undefined}
                    onMouseEnter={() => setActiveValue(item.value)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                    className={classNames(
                      "flex h-8 select-none items-center gap-2 rounded-md px-2 text-[13px]",
                      isActive ? "bg-background-tertiary" : "",
                      item.disabled
                        ? "opacity-40"
                        : "text-foreground cursor-default",
                    )}
                  >
                    {multiple ? (
                      <span
                        className={classNames(
                          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                          isSelected
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-border-strong",
                        )}
                      >
                        {isSelected ? <Icon name="check" size={10} /> : null}
                      </span>
                    ) : null}
                    {item.icon ? (
                      <span className="flex w-4 shrink-0 items-center justify-center text-foreground-secondary">
                        {item.icon}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.description ? (
                      <span className="truncate text-xs text-foreground-tertiary">
                        {item.description}
                      </span>
                    ) : null}
                    {item.shortcut ? <Kbd keys={item.shortcut} /> : null}
                    {!multiple && isSelected ? (
                      <Icon name="check" size={14} className="text-foreground-secondary" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
      {footer}
    </div>
  );
};
