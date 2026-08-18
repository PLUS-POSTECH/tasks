import { networkInterfaces } from "node:os";

import type { NextConfig } from "next";

/**
 * Next refuses dev-server asset requests from any origin other than
 * `localhost`, so a page opened from another machine renders but never
 * hydrates. Allow every local interface plus ALLOWED_DEV_ORIGINS.
 */
const localInterfaceAddresses = Object.values(networkInterfaces())
  .flat()
  .flatMap((entry) => (entry && entry.family === "IPv4" ? [entry.address] : []));

/** A forwarding public address is not a local interface, so name it in `.env.development.local`. */
const configuredDevelopmentOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    ...new Set([
      "127.0.0.1",
      ...localInterfaceAddresses,
      ...configuredDevelopmentOrigins,
    ]),
  ],
};

export default nextConfig;
