type AdminOnlyNoticeProps = {
  /** The change only admins may make, as a verb phrase: "delete a status". */
  readonly change: string;
};

export const AdminOnlyNotice = ({ change }: AdminOnlyNoticeProps) => (
  <p className="border-b border-border px-4 py-3 text-[13px] text-foreground-tertiary last:border-b-0">
    Only admins can {change}. Admin follows the Discord server: its owner, anyone holding a role that carries
    Discord&rsquo;s Administrator permission, and anyone holding a role listed under Members.
  </p>
);
