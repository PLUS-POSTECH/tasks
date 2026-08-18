/**
 * What the reminder form offers. The stored model is two plain minute counts,
 * so the API and MCP can pick others between the same bounds.
 */
export const reminderLeadChoices = [
  { minutes: 0, label: "At the deadline" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 1_440, label: "1 day before" },
  { minutes: 2_880, label: "2 days before" },
  { minutes: 4_320, label: "3 days before" },
  { minutes: 10_080, label: "1 week before" },
  { minutes: null, label: "From now on" },
] as const;

export const reminderRepeatChoices = [
  { minutes: null, label: "Don't repeat" },
  { minutes: 60, label: "Every hour" },
  { minutes: 360, label: "Every 6 hours" },
  { minutes: 1_440, label: "Every day" },
  { minutes: 10_080, label: "Every week" },
] as const;
