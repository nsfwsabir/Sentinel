import "./globals.css";
import { Inter } from "next/font/google";
import Sidebar from "./components/sidebar";
import Topbar from "./components/topbar";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = { title: "Sentinel", description: "Runtime policy enforcement for AI agents" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-neutral-50 text-neutral-900 antialiased">
        <div className="grid min-h-screen grid-cols-[230px_1fr]">
          <Sidebar />
          <div className="flex min-h-screen min-w-0 flex-col">
            <Topbar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6 lg:px-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
