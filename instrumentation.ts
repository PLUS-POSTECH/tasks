const onOneLine = (message: string): string => message.replace(/\s+/g, " ").trim();

const describeFailure = (error: unknown, depth = 0): string => {
  if (!(error instanceof Error)) {
    return onOneLine(String(error));
  }
  if (error.cause === undefined || depth >= 5) {
    return onOneLine(error.message);
  }
  return `${onOneLine(error.message)} ← ${describeFailure(error.cause, depth + 1)}`;
};

/**
 * Next does not stop when this hook throws: it retries it per request and
 * answers 500 — including on `/api/health` — while the container stays "Up".
 * Exiting instead turns a bad deploy into a crash-loop that the restart policy
 * and the proxy's health check both act on.
 */
export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    // Opening the handle is what applies pending migrations.
    const { getDatabaseHandle } = await import("./lib/database/client");
    await getDatabaseHandle();

    const { isDevelopmentEnvironment } = await import("./lib/database/configuration");
    if (isDevelopmentEnvironment()) {
      const { seedDevelopmentDatabase } = await import("./lib/database/development");
      await seedDevelopmentDatabase();
    }

    const { startBackgroundJobs } = await import("./lib/jobs");
    startBackgroundJobs();
  } catch (error) {
    console.error(`[startup] The server cannot serve requests and is exiting: ${describeFailure(error)}`);
    process.exit(1);
  }
};
