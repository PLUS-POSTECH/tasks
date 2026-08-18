/**
 * The key that signs session cookies, generated when the workspace row is
 * created rather than on first read: a lazy read path that writes lets two
 * concurrent first requests mint two secrets, invalidating each other's cookies.
 */
export const generateAuthSecret = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
};
