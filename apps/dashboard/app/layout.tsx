import "./globals.css";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../auth";

export const metadata = { title: "Sentinel", description: "Runtime policy enforcement for AI agents" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = isOidcConfigured() ? await getServerSession(authOptions) : null;
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav" aria-label="Primary">
            <strong>Sentinel</strong>
            <Link href="/">Overview</Link>
            <Link href="/decisions">Decisions</Link>
            <Link href="/approvals">Approvals</Link>
            <Link href="/policies">Policies</Link>
            <Link href="/agents">Agents</Link>
            <Link href="/tools">Tools</Link>
            <Link href="/simulate">Simulate</Link>
            <Link href="/settings">Settings</Link>
            {isOidcConfigured() && (
              <span className="muted" style={{ marginTop: 12 }}>
                {session?.user?.email ?? session?.user?.name ?? "Signed out"}
                <br />
                {session ? (
                  <a href="/api/auth/signout">Sign out</a>
                ) : (
                  <a href="/api/auth/signin">Sign in</a>
                )}
              </span>
            )}
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
