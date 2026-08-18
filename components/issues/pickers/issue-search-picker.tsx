"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";

import { StateIcon } from "@/components/issues/state-icon";
import { Popover } from "@/components/ui/popover";
import { SelectMenu } from "@/components/ui/select-menu";
import { searchIssues, type IssueSearchResult } from "@/lib/search/actions";

type IssueSearchPickerProps = {
  readonly trigger: ReactNode;
  readonly onSelect: (issue: IssueSearchResult) => void;
  readonly excludeIdentifiers?: readonly string[];
  readonly placeholder?: string;
};

export const IssueSearchPicker = ({
  trigger,
  onSelect,
  excludeIdentifiers = [],
  placeholder = "Search issues…",
}: IssueSearchPickerProps) => {
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState<{ query: string; hits: readonly IssueSearchResult[] }>({ query: "", hits: [] });
  const [searching, startSearch] = useTransition();
  const trimmedQuery = query.trim();
  const hits = trimmedQuery.length >= 2 && searchResult.query === trimmedQuery ? searchResult.hits : [];

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      return;
    }
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        const results = await searchIssues(trimmedQuery, 10);
        setSearchResult({ query: trimmedQuery, hits: results });
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery]);

  const visibleHits = hits.filter((hit) => !excludeIdentifiers.includes(hit.identifier));

  return (
    <Popover trigger={trigger}>
      {(close) => (
        <SelectMenu
          items={visibleHits.map((hit) => ({
            value: hit.identifier,
            label: hit.title,
            description: hit.reference,
            icon: <StateIcon type={hit.stateType} color={hit.stateColor} />,
          }))}
          search={{ kind: "external", value: query, onChange: setQuery }}
          searchPlaceholder={placeholder}
          loading={searching}
          emptyMessage={query.trim().length < 2 ? "Type to search" : "No issues found"}
          onSelect={(value) => {
            const hit = visibleHits.find((candidate) => candidate.identifier === value);
            if (hit) {
              onSelect(hit);
              close();
            }
          }}
        />
      )}
    </Popover>
  );
};
