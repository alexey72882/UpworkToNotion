import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

const NAV = [
  {
    label: "Home",
    href: "/dashboard",
    disabled: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" fill="none" stroke="currentColor" className="inline-block size-5">
        <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>
        <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      </svg>
    ),
  },
  {
    label: "Integrations",
    href: "/settings",
    disabled: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" fill="none" stroke="currentColor" className="inline-block size-5">
        <path d="M12 22v-5"/>
        <path d="M9 8V2"/>
        <path d="M15 8V2"/>
        <path d="M18 8H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z"/>
      </svg>
    ),
  },
  {
    label: "Filters",
    href: "/filters",
    disabled: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" fill="none" stroke="currentColor" className="inline-block size-5">
        <path d="M20 7h-9"/>
        <path d="M14 17H5"/>
        <circle cx="17" cy="17" r="3"/>
        <circle cx="7" cy="7" r="3"/>
      </svg>
    ),
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname, replace } = useRouter();
  const [initials, setInitials] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("sidebar") !== "closed" : true
  );

  function toggleSidebar() {
    const next = !sidebarOpen;
    setSidebarOpen(next);
    localStorage.setItem("sidebar", next ? "open" : "closed");
  }

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await getSupabaseBrowser().auth.getUser();
      if (!user) return;
      const d = await fetch("/api/user/settings").then((r) => r.json());
      const name: string = d.ok ? (d.settings?.upwork_name ?? "") : "";
      if (name) {
        setInitials(name[0].toUpperCase());
      } else {
        setInitials((user.email ?? "").slice(0, 2).toUpperCase());
      }
    }
    loadUser();
  }, []);

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    replace("/auth/signin");
  }

  return (
    <div className="drawer lg:drawer-open min-h-screen bg-base-300">
      <input id="app-drawer" type="checkbox" className="drawer-toggle" checked={sidebarOpen} onChange={toggleSidebar} />

      {/* Main content */}
      <div className="drawer-content flex flex-col min-h-screen">
        {/* Navbar */}
        <nav className="navbar bg-base-100 shadow-sm px-4 h-[58px] shrink-0">
          <label htmlFor="app-drawer" aria-label="toggle sidebar" className="btn btn-square btn-ghost mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" strokeLinejoin="round" strokeLinecap="round" strokeWidth="2" fill="none" stroke="currentColor" className={`size-5 transition-transform duration-300 ${sidebarOpen ? "-scale-x-100" : ""}`}>
              <path d="M4 4m0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2z"/>
              <path d="M9 4v16"/>
              <path d="M14 10l2 2l-2 2"/>
            </svg>
          </label>
          <Logo />
          <div className="flex-1" />
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar avatar-placeholder">
              <div className="bg-neutral text-neutral-content w-10 rounded-full">
                <span className="text-sm">{initials}</span>
              </div>
            </div>
            <ul tabIndex={-1} className="menu menu-sm dropdown-content bg-base-100 rounded-box z-10 mt-3 w-40 p-2 shadow">
              <li><Link href="/profile">Profile</Link></li>
              <li><button onClick={signOut}>Logout</button></li>
            </ul>
          </div>
        </nav>

        {/* Page content */}
        <main className="flex-1 flex flex-col p-8">
          <div className="w-full max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Sidebar */}
      <div className="drawer-side is-drawer-close:overflow-visible z-40">
        <label htmlFor="app-drawer" aria-label="close sidebar" className="drawer-overlay" />
        <div
          className="flex min-h-full flex-col items-start is-drawer-close:w-14 is-drawer-open:w-52 bg-[#2F4F82]"
        >
          <ul className="menu w-full grow px-1 py-4">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href} className={item.disabled ? "disabled" : ""}>
                  {item.disabled ? (
                    <span
                      className="is-drawer-close:tooltip is-drawer-close:tooltip-right text-white cursor-not-allowed opacity-30"
                      data-tip={item.label}
                    >
                      {item.icon}
                      <span className="is-drawer-close:hidden">{item.label}</span>
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className={`is-drawer-close:tooltip is-drawer-close:tooltip-right text-white hover:bg-white/10 ${active ? "bg-white/20 opacity-100" : "opacity-70"}`}
                      data-tip={item.label}
                    >
                      {item.icon}
                      <span className="is-drawer-close:hidden">{item.label}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
