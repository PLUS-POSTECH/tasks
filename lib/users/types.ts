export type UserSummary = {
  readonly identifier: string;
  readonly name: string;
  readonly displayName: string;
  readonly avatarColor: string;
  /** Discord picture; the avatar falls back to initials when absent. */
  readonly image: string | null;
  /** True once the person left the Discord server; shown as "Former member". */
  readonly hasLeft?: boolean;
};
