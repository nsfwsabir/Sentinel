import "./globals.css";
import Link from "next/link";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../auth";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = { title: "Sentinel", description: "Runtime policy enforcement for AI agents" };

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/decisions", label: "Decisions" },
  { href: "/approvals", label: "Approvals" },
  { href: "/policies", label: "Policies" },
  { href: "/agents", label: "Agents" },
  { href: "/tools", label: "Tools" },
  { href: "/signals", label: "Signals" },
  { href: "/simulate", label: "Simulate" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = isOidcConfigured() ? await getServerSession(authOptions) : null;
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <div className="grid min-h-screen grid-cols-[220px_1fr]">
          <nav className="flex flex-col gap-1 border-r border-neutral-200 bg-white px-4 py-5" aria-label="Primary">
            <strong className="px-2 pb-3 text-[15px] tracking-tight">Sentinel</strong>
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100">
                {l.label}
              </Link>
            ))}
            {isOidcConfigured() && (
              <span className="muted mt-3 px-2 text-xs">
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
          <main className="mx-auto w-full max-w-6xl px-6 py-6 lg:px-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
