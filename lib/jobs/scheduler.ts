/**
 * In-process background jobs, started from `instrumentation.ts`. The timers are
 * guarded on `globalThis` so hot reloads do not stack them.
 */

export type Job = {
  readonly name: string;
  readonly everyMilliseconds: number;
  readonly run: () => Promise<void>;
};

const globalStore = globalThis as typeof globalThis & {
  __tasksJobTimers?: readonly ReturnType<typeof setInterval>[];
};

/**
 * A tick arriving while the previous run is still going is dropped rather than
 * queued: two concurrent runs would load the same due rows before either had
 * marked them handled, and every reminder would go out twice.
 */
const tickOf = (job: Job): (() => void) => {
  let running = false;
  return () => {
    if (running) {
      console.warn(`[jobs] ${job.name} is still running; skipping this tick.`);
      return;
    }
    running = true;
    void job
      .run()
      .catch((error: unknown) => console.warn(`[jobs] ${job.name} failed.`, error))
      .finally(() => {
        running = false;
      });
  };
};

export const startScheduler = (jobs: readonly Job[]): void => {
  if (globalStore.__tasksJobTimers) {
    return;
  }
  globalStore.__tasksJobTimers = jobs.map((job) => {
    const tick = tickOf(job);
    tick();
    const timer = setInterval(tick, job.everyMilliseconds);
    timer.unref?.();
    return timer;
  });
  console.info(`[jobs] Scheduler started: ${jobs.map((job) => job.name).join(", ")}.`);
};
