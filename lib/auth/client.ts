"use client";

import { createAuthClient } from "better-auth/react";

/** Browser-side auth client; the base URL defaults to the current origin. */
export const authClient = createAuthClient();
