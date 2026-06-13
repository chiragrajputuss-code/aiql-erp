"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquare,
  ClipboardList,
  Plug,
  ShieldCheck,
  BarChart2,
  Key,
  Settings,
  Menu,
  LogOut,
  ChevronRight,
  Building2,
  History,
  BookOpen,
  Shield,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NewFeatureBanner } from "@/components/new-feature-banner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type User = {
  name: string | null;
  email: string;
  role: string;
  orgId: string;
};

type Org = {
  name: string;
  queriesUsed: number;
  queryLimit: number;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  allowedRoles?: string[];
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/query",   label: "Query Studio", icon: MessageSquare, allowedRoles: ["ADMIN", "MEMBER"] },
  { href: "/history", label: "History",      icon: History,       allowedRoles: ["ADMIN", "MEMBER"] },
  { href: "/close",   label: "Close Manager", icon: ClipboardList },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen, allowedRoles: ["ADMIN", "MEMBER"] },
  { href: "/llm-privacy-demo", label: "Privacy Demo", icon: Shield, allowedRoles: ["ADMIN", "MEMBER"] },
  { href: "/connections", label: "Connections", icon: Plug, allowedRoles: ["ADMIN", "MEMBER"] },
  { href: "/tokenisation/preview", label: "Tokenisation", icon: ShieldCheck, allowedRoles: ["ADMIN", "MEMBER"] },
  { href: "/usage", label: "Usage", icon: BarChart2 },
  { href: "/api-keys", label: "API Keys", icon: Key, allowedRoles: ["ADMIN"] },
  { href: "/settings/general", label: "Settings", icon: Settings, allowedRoles: ["ADMIN", "MEMBER"] },
];

function initials(name: string | null, email: string) {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function SidebarContent({ user, org, onNavigate }: { user: User; org: Org; onNavigate?: () => void }) {
  const pathname = usePathname();

  const visibleNav = NAV.filter(
    (item) => !item.allowedRoles || item.allowedRoles.includes(user.role)
  );

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-full flex-col bg-[#1B3A5C] text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 font-bold text-white">
          A
        </div>
        <span className="text-lg font-semibold tracking-tight">AIQL</span>
      </div>

      <Separator className="bg-white/10" />

      {/* Org name */}
      <div className="flex items-center gap-2 px-5 py-3">
        <Building2 className="h-3.5 w-3.5 text-white/50 shrink-0" />
        <span className="truncate text-xs text-white/60">{org.name}</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3 py-2 overflow-y-auto">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/15 text-white"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
              {active && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-white/10" />

      {/* Usage bar */}
      <div className="px-5 py-4 shrink-0">
        <div className="flex justify-between text-xs text-white/50 mb-1.5">
          <span>Queries</span>
          <span>
            {org.queriesUsed} / {org.queryLimit}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/40 transition-all"
            style={{ width: `${Math.min(100, (org.queriesUsed / org.queryLimit) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function AppShell({
  user,
  org,
  children,
}: {
  user: User;
  org: Org;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col">
        <SidebarContent user={user} org={org} />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-4 md:px-6">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <SidebarContent user={user} org={org} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="hidden md:block" />

          {/* Right: org + avatar */}
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-600 md:block">{org.name}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1B3A5C] text-xs font-semibold text-white hover:opacity-90 transition-opacity">
                  {initials(user.name, user.email)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium">{user.name ?? "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user.role.toLowerCase()}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings/general" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <NewFeatureBanner />
        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
