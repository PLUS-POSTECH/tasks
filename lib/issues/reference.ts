export const formatIssueReference = (issueNumber: number): string =>
  `#${issueNumber}`;

const issueReferencePattern = /^#?(\d{1,9})$/;

export const parseIssueReference = (reference: string): number | null => {
  const match = issueReferencePattern.exec(reference.trim());
  const digits = match?.[1];
  return digits ? Number(digits) : null;
};

export const issuePath = (issueNumber: number): string => `/issue/${issueNumber}`;

export const issuePathForReference = (reference: string): string =>
  `/issue/${reference.replace(/^#/, "")}`;
