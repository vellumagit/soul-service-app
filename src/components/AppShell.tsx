import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({
  breadcrumb,
  children,
}: {
  breadcrumb: { label: string; href?: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <TopBar breadcrumb={breadcrumb} />
        <div className="flex-1 overflow-auto">
          <div className="px-6 py-5">{children}</div>
        </div>
        <footer className="border-t border-ink-100 px-6 h-7 flex items-center gap-4 text-[11px] text-ink-500">
          <div className="flex items-center gap-1.5">
            <span className="dot bg-green-500" />
            <span>Held with care</span>
          </div>
          <div>for Maya · v0.4</div>
          <div className="flex-1" />
          <div>
            Last backup{" "}
            <span className="font-mono text-ink-700">2025-04-19 13:12</span>
          </div>
          <div>
            <span className="kbd">?</span> shortcuts
          </div>
        </footer>
      </main>
    </div>
  );
}
