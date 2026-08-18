/**
 * The app is reachable only through the proxy that joins the compose network,
 * and Docker hands those networks addresses out of its default pool: the whole
 * pool, because the address a network gets is assigned at creation and changes
 * when the stack is recreated. A deployment whose pool was configured elsewhere
 * names its ranges in `TRUSTED_PROXY_CIDRS` instead.
 */
const dockerDefaultAddressPool = "172.16.0.0/12";

export type TrustedProxyEnvironment = {
  readonly TRUSTED_PROXY_CIDRS?: string;
  /** `process.env` carries far more than this; the index signature is what lets it be passed. */
  readonly [name: string]: string | undefined;
};

/**
 * Getting this wrong is not a security hole — better-auth refuses a forwarded
 * chain it cannot resolve against these — but it does collapse rate limiting
 * onto one bucket shared by everyone.
 */
export const trustedProxyRanges = (
  environment: TrustedProxyEnvironment = process.env,
): readonly string[] => {
  const configured = (environment.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((range) => range.trim())
    .filter((range) => range.length > 0);
  return configured.length > 0 ? configured : [dockerDefaultAddressPool];
};
