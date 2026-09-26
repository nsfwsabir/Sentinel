import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Sentinel", description: "Runtime policy enforcement for AI agents" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
            <Link href="/simulate">Simulate</Link>
            <Link href="/settings">Settings</Link>
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
