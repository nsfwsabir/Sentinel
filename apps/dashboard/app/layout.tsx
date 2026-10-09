import "./globals.css";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import Sidebar from "./components/sidebar";
import Topbar from "./components/topbar";

const voice = Space_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-voice" });
const evidence = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-evidence" });

export const metadata = { title: "Sentinel", description: "Runtime policy enforcement for AI agents" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${voice.variable} ${evidence.variable}`} suppressHydrationWarning>
      <body className="bg-paper font-voice text-neutral-800 antialiased dark:bg-neutral-950 dark:text-neutral-200">
        <Script
          id="sentinel-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sentinel-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
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
