import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

function scryptKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 32, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

// stdlib scrypt (AGENTS.md §12: never custom crypto). Hash format:
//   scrypt$<salt-hex>$<hash-hex>
// Cost params fixed (N=16364? no — N=16384, r=8, p=1); verification parses
// only salt+hash, so params are not downgradeable via env.
export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scryptKey(password, salt);
  return `scrypt$${salt}$${hash.toString("hex")}`;
}

export async function verifyAdminPassword(password: string, expected: string): Promise<boolean> {
  const parts = expected.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hex] = parts;
  let want: Buffer;
  try {
    want = Buffer.from(hex, "hex");
  } catch {
    return false;
  }
  if (salt.length < 16 || want.length !== 32) return false;
  const got = await scryptKey(password, salt);
  return timingSafeEqual(got, want);
}

/** True when ADMIN_PASS_HASH is set (production). Plaintext ADMIN_PASS is dev-only fallback. */
export function isHashConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASS_HASH);
}

export async function verifyAdminCredentials(user: string, password: string): Promise<boolean> {
  const expectedUser = process.env.ADMIN_USER ?? "admin";
  if (user !== expectedUser) return false;
  const hash = process.env.ADMIN_PASS_HASH;
  if (hash) return verifyAdminPassword(password, hash);
  return password === (process.env.ADMIN_PASS ?? "admin");
}

export function parseBasicAuth(
  header: string | string[] | undefined,
): { user: string; password: string } | null {
  const val = Array.isArray(header) ? header[0] : (header ?? "");
  const m = /^Basic\s+(.+)$/i.exec(val);
  if (!m) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  return { user: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}
