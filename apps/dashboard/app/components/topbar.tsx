import { getServerSession } from "next-auth";
import { authOptions, isOidcConfigured } from "../../auth";
import SearchBox from "./search-box";

export default async function Topbar() {
  const session = isOidcConfigured() ? await getServerSession(authOptions) : null;
  const apiHost = (() => {
    try {
      return new URL(process.env.SENTINEL_API_URL ?? "http://localhost:3001").host;
    } catch {
      return "localhost:3001";
    }
  })();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-neutral-200 bg-neutral-50/90 px-6 py-3 backdrop-blur lg:px-8">
      <SearchBox />
      <div className="ml-auto flex items-center gap-3">
        <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-neutral-500">
          {apiHost}
        </span>
        {isOidcConfigured() && (
          <span className="text-[13px] text-neutral-600">
            {session?.user?.email ?? session?.user?.name ?? "Signed out"}{" "}
            {session ? (
              <a className="font-medium text-neutral-900 underline" href="/api/auth/signout">Sign out</a>
            ) : (
              <a className="font-medium text-neutral-900 underline" href="/api/auth/signin">Sign in</a>
            )}
          </span>
        )}
      </div>
    </header>
  );
}
