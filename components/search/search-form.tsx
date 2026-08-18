"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icon } from "@/components/ui/icon";

type SearchFormProps = {
  readonly initialQuery: string;
};

export const SearchForm = ({ initialQuery }: SearchFormProps) => {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  return (
    <form
      className="flex items-center gap-2 border-b border-border px-4 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        router.replace(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
      }}
    >
      <Icon name="search" size={15} className="text-foreground-tertiary" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search issues by title, description, or reference…"
        aria-label="Search"
        autoFocus
        className="h-8 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground-quaternary"
      />
      {query ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            router.replace("/search");
          }}
          aria-label="Clear"
          className="rounded p-1 text-foreground-tertiary hover:text-foreground"
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </form>
  );
};
