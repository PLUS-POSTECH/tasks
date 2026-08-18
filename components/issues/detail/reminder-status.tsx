import { Timestamp } from "@/components/ui/timestamp";

type ReminderStatusProps = {
  readonly nextRunAt: Date | null;
  readonly lastSentAt: Date | null;
  readonly lastError: string | null;
};

export const ReminderStatus = ({ nextRunAt, lastSentAt, lastError }: ReminderStatusProps) => {
  if (lastError !== null) {
    return (
      <span className="text-danger" title={lastError}>
        Last send failed ·{" "}
        {nextRunAt ? <Timestamp value={nextRunAt} format="absolute" prefix="trying again" /> : "nothing scheduled"}
      </span>
    );
  }
  if (nextRunAt) {
    return <Timestamp value={nextRunAt} format="absolute" prefix="Next" />;
  }
  return lastSentAt ? (
    <span>
      <Timestamp value={lastSentAt} format="relative" prefix="Sent" /> · nothing scheduled
    </span>
  ) : (
    <span>Nothing scheduled (no due date or already passed)</span>
  );
};
