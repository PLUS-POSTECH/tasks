export type LabelSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly color: string;
};

/**
 * `issue_labels` cascades, so the count is what deleting the label takes off
 * other people's issues; the settings page says it before offering the button.
 */
export type LabelWithIssueCount = LabelSummary & {
  readonly issueCount: number;
};
