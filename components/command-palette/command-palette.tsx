"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { useCreateIssueDialog } from "@/components/issues/create-issue/create-issue-dialog-context";
import { StateIcon } from "@/components/issues/state-icon";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { SelectMenu, type SelectMenuItem } from "@/components/ui/select-menu";
import { useToast } from "@/components/ui/toast-provider";
import { useWorkspaceData } from "@/components/workspace/workspace-data-provider";
import { searchIssues, type IssueSearchResult } from "@/lib/search/actions";
import { issuePathForReference } from "@/lib/issues/reference";

type CommandPaletteProps = {
  readonly open: boolean;
  readonly initialQuery: string;
  readonly onClose: () => void;
};

type Command = SelectMenuItem & { readonly run: () => void };

const searchDebounceMilliseconds = 120;

export const CommandPalette = ({ open, initialQuery, onClose }: CommandPaletteProps) => {
  const router = useRouter();
  const { projects } = useWorkspaceData();
  const { openCreateIssue } = useCreateIssueDialog();
  const { showToast } = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [searchResult, setSearchResult] = useState<{ query: string; hits: readonly IssueSearchResult[] }>({ query: "", hits: [] });
  const [searching, startSearch] = useTransition();
  const trimmedQuery = query.trim();
  const hits = useMemo(
    (): readonly IssueSearchResult[] =>
      trimmedQuery.length >= 2 && searchResult.query === trimmedQuery ? searchResult.hits : [],
    [trimmedQuery, searchResult],
  );

  useEffect(() => {
    if (!open || trimmedQuery.length < 2) {
      return;
    }
    const timer = window.setTimeout(() => {
      startSearch(async () => {
        const results = await searchIssues(trimmedQuery);
        setSearchResult({ query: trimmedQuery, hits: results });
      });
    }, searchDebounceMilliseconds);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery, open]);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose],
  );

  const commands = useMemo((): readonly Command[] => {
    const navigation: readonly Command[] = [
      { value: "create-issue", label: "Create new issue", icon: <Icon name="plus" size={14} />, shortcut: "C", group: "Actions", keywords: ["new"], run: () => { onClose(); openCreateIssue(); } },
      { value: "go-inbox", label: "Go to Inbox", icon: <Icon name="inbox" size={14} />, shortcut: "G I", group: "Navigation", run: () => go("/inbox") },
      { value: "go-my-issues", label: "Go to My Issues", icon: <Icon name="my-issues" size={14} />, shortcut: "G M", group: "Navigation", run: () => go("/my-issues") },
      { value: "go-projects", label: "Go to Projects", icon: <Icon name="projects" size={14} />, shortcut: "G P", group: "Navigation", run: () => go("/projects") },
      { value: "go-active", label: "Go to Active issues", icon: <Icon name="issues" size={14} />, group: "Navigation", run: () => go("/issues/active") },
      { value: "go-backlog", label: "Go to Backlog", icon: <Icon name="issues" size={14} />, shortcut: "G B", group: "Navigation", run: () => go("/issues/backlog") },
      { value: "go-issues", label: "Go to All issues", icon: <Icon name="issues" size={14} />, shortcut: "G A", group: "Navigation", run: () => go("/issues") },
      { value: "search-page", label: query.trim().length >= 2 ? `Search “${query.trim()}” in all issues` : "Open search page", icon: <Icon name="search" size={14} />, group: "Actions", keywords: ["find"], run: () => go(query.trim().length >= 2 ? `/search?q=${encodeURIComponent(query.trim())}` : "/search") },
      { value: "go-settings", label: "Go to Settings", icon: <Icon name="settings" size={14} />, shortcut: "G S", group: "Navigation", run: () => go("/settings") },
      { value: "copy-url", label: "Copy current URL", icon: <Icon name="link" size={14} />, group: "Actions", run: () => { void navigator.clipboard.writeText(window.location.href); showToast({ title: "Link copied" }); onClose(); } },
    ];
    const projectCommands: readonly Command[] = projects.map((project) => ({
      value: `project-${project.identifier}`,
      label: project.name,
      icon: <span style={{ color: project.color }}>{project.icon}</span>,
      group: "Projects",
      run: () => go(`/project/${project.identifier}`),
    }));
    const issueCommands: readonly Command[] = hits.map((hit) => ({
      value: `issue-${hit.identifier}`,
      label: hit.title,
      description: hit.reference,
      keywords: [hit.reference, hit.title],
      icon: <StateIcon type={hit.stateType} color={hit.stateColor} />,
      group: "Issues",
      run: () => go(issuePathForReference(hit.reference)),
    }));
    return [...issueCommands, ...navigation, ...projectCommands];
  }, [projects, hits, onClose, openCreateIssue, showToast, go, query]);

  const commandByValue = new Map(commands.map((command) => [command.value, command]));

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Command menu" placement="top" className="max-w-[640px]">
      <SelectMenu
        items={commands}
        search={{ kind: "external", value: query, onChange: setQuery }}
        searchPlaceholder="Type a command or search…"
        emptyMessage={query.trim().length < 2 ? "Type to search issues" : "No results"}
        loading={searching}
        className="max-w-none"
        onSelect={(value) => commandByValue.get(value)?.run()}
        footer={
          <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-2xs text-foreground-quaternary">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
        }
      />
    </Dialog>
  );
};

export default CommandPalette;
