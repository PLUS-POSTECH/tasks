"use client";

import { Dialog } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useModifierKeyLabel } from "@/components/ui/use-modifier-key-label";

type ShortcutGroup = {
  readonly title: string;
  readonly shortcuts: readonly { readonly keys: string; readonly description: string }[];
};

type KeyboardShortcutsSheetProps = {
  readonly open: boolean;
  readonly onClose: () => void;
};

export const KeyboardShortcutsSheet = ({ open, onClose }: KeyboardShortcutsSheetProps) => {
  const modifier = useModifierKeyLabel();
  const groups: readonly ShortcutGroup[] = [
    {
      title: "General",
      shortcuts: [
        { keys: `${modifier} K`, description: "Open command menu" },
        { keys: "C", description: "Create new issue" },
        { keys: "/", description: "Search" },
        { keys: "?", description: "Show keyboard shortcuts" },
        { keys: "Esc", description: "Close dialog / clear selection" },
      ],
    },
    {
      title: "Navigation",
      shortcuts: [
        { keys: "G I", description: "Go to Inbox" },
        { keys: "G M", description: "Go to My issues" },
        { keys: "G P", description: "Go to Projects" },
        { keys: "G A", description: "Go to All issues" },
        { keys: "G B", description: "Go to Backlog" },
        { keys: "G S", description: "Go to Settings" },
      ],
    },
    {
      title: "Issue list",
      shortcuts: [
        { keys: "J / ↓", description: "Move down" },
        { keys: "K / ↑", description: "Move up" },
        { keys: "↵", description: "Open issue" },
        { keys: "X", description: "Select issue" },
        { keys: "⇧ Click", description: "Select range" },
      ],
    },
    {
      title: "Issue properties",
      shortcuts: [
        { keys: "S", description: "Change status" },
        { keys: "P", description: "Change priority" },
        { keys: "A", description: "Change assignee" },
        { keys: "L", description: "Change labels" },
        { keys: "D", description: "Set due date" },
        { keys: "1 - 9", description: "Pick option in an open menu" },
      ],
    },
    {
      title: "Issue page",
      shortcuts: [
        { keys: "E", description: "Edit description" },
        { keys: "R", description: "Reply / comment" },
        { keys: `${modifier} ⇧ .`, description: "Copy issue link" },
        { keys: `${modifier} ↵`, description: "Submit form" },
      ],
    },
  ];

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Keyboard shortcuts" className="max-w-[720px]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">Keyboard shortcuts</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-foreground-tertiary hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="scrollbar-thin grid max-h-[65vh] grid-cols-1 gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-2xs font-medium uppercase tracking-wide text-foreground-quaternary">
              {group.title}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {group.shortcuts.map((shortcut) => (
                <li key={shortcut.keys} className="flex items-center justify-between gap-4 text-[13px]">
                  <span className="text-foreground-secondary">{shortcut.description}</span>
                  <Kbd keys={shortcut.keys} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
};

export default KeyboardShortcutsSheet;
