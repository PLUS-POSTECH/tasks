type ActivitySubject = {
  readonly identifier: string;
  readonly name: string;
};

/**
 * Reads the `<subject>Identifier` / `<subject>Name` pair a payload records: the
 * name the subject carries now, and the recorded words only when no row is left
 * to read, so renaming a label updates every past entry that mentions it.
 *
 * `project_changed` deliberately records no words, and must stay that way: the
 * feed resolves projects against the access-filtered list, where a restricted
 * project is as absent as a deleted one, so recorded words would name it to
 * anybody who can read the issue. `parent_changed` and the relation entries
 * name issues and are the same case.
 */
export const nameOfActivitySubject = (
  subjects: readonly ActivitySubject[],
  identifier: string | number | null | undefined,
  nameAtTheTime: string | number | null | undefined,
): string | null => {
  const current = subjects.find((subject) => subject.identifier === identifier);
  if (current) {
    return current.name;
  }
  return typeof nameAtTheTime === "string" && nameAtTheTime.length > 0 ? nameAtTheTime : null;
};
