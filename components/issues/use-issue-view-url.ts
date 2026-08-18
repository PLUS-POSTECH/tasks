"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { issueFilterParameters } from "@/lib/issues/filters";

export type SearchParameterPatch = Readonly<
  Record<string, string | readonly string[] | null>
>;

/**
 * `useSearchParams()` only reports a change once `router.replace` has finished
 * its RSC round trip, so a second edit made inside that window would read the
 * stale query and drop the first. Module scope because every menu writing to
 * the address bar shares one address bar; it is discarded as soon as the router
 * reports a query it was not built from.
 */
let requestedQuery: {
  readonly pathname: string;
  readonly builtFrom: string;
  readonly requested: string;
} | null = null;

export const useIssueViewUrl = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParameters = useSearchParams();

  const reportedQuery = searchParameters.toString();

  /** Read on every call rather than once per render, so two edits in the same render see each other's work. */
  const currentParameters = (): URLSearchParams =>
    new URLSearchParams(
      requestedQuery?.pathname === pathname && requestedQuery.builtFrom === reportedQuery
        ? requestedQuery.requested
        : reportedQuery,
    );

  useEffect(() => {
    if (
      requestedQuery &&
      (requestedQuery.pathname !== pathname || requestedQuery.builtFrom !== reportedQuery)
    ) {
      requestedQuery = null;
    }
  }, [pathname, reportedQuery]);

  const listOf = (key: string): readonly string[] =>
    currentParameters()
      .getAll(key)
      .flatMap((value) => value.split(","))
      .filter((value) => value.length > 0);

  const update = (patch: SearchParameterPatch) => {
    const next = currentParameters();
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (value === null) {
        continue;
      }
      if (typeof value === "string") {
        if (value.length > 0) {
          next.set(key, value);
        }
      } else if (value.length > 0) {
        next.set(key, value.join(","));
      }
    }
    const query = next.toString();
    requestedQuery = { pathname, builtFrom: reportedQuery, requested: query };
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const toggleInList = (key: string, value: string) => {
    const current = listOf(key);
    update({
      [key]: current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    });
  };

  return {
    get: (key: string) => currentParameters().get(key),
    listOf,
    update,
    toggleInList,
    clearFilters: () => update(Object.fromEntries(issueFilterParameters.map((parameter) => [parameter, null]))),
  };
};
