'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Upload, List, CalendarDays, Repeat, FolderOpen, Lightbulb, Settings, Menu, X, LogOut } from 'lucide-react';

const primaryNavigation = [
  { name: 'לוח בקרה', href: '/', icon: LayoutDashboard },
  { name: 'תנועות', href: '/transactions', icon: List },
  { name: 'סיכום חודשי', href: '/monthly-summary', icon: CalendarDays },
  { name: 'הוצאות קבועות', href: '/recurring', icon: Repeat },
];

const secondaryNavigation = [
  { name: 'העלאת קבצים', href: '/upload', icon: Upload },
  { name: 'קטגוריות', href: '/categories', icon: FolderOpen },
  { name: 'טיפים לחיסכון', href: '/tips', icon: Lightbulb },
  { name: 'הגדרות', href: '/settings', icon: Settings },
];

const mobileBottomNavigation = [
  { name: 'לוח', href: '/', icon: LayoutDashboard },
  { name: 'תנועות', href: '/transactions', icon: List },
  { name: 'סיכום', href: '/monthly-summary', icon: CalendarDays },
  { name: 'קבועות', href: '/recurring', icon: Repeat },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    // Warm up core pages for faster bottom-nav transitions on mobile.
    for (const item of primaryNavigation) {
      router.prefetch(item.href);
    }
  }, [router]);

  const renderNavContent = (items: typeof primaryNavigation | typeof secondaryNavigation) => (
    <nav className="flex-1 space-y-1 p-4">
      {items.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );

  const isBottomNavItemActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-16 bg-white border-b shadow-sm">
        <div className="h-full px-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">ניהול הוצאות</h1>
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-700"
            aria-label="פתח תפריט"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          className="lg:hidden fixed inset-0 z-50 bg-black/35"
          onClick={() => setMobileOpen(false)}
          aria-label="סגור תפריט"
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`lg:hidden fixed left-0 top-0 z-[60] h-screen w-[82%] max-w-72 bg-white border-r shadow-xl transform transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4 border-b">
            <h2 className="text-lg font-bold text-gray-800">ניהול הוצאות</h2>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-700"
              aria-label="סגור תפריט"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {renderNavContent(secondaryNavigation)}
          <div className="border-t p-4 space-y-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              התנתק
            </button>
            <p className="text-xs text-gray-500 text-center">
              Family Finance v1.0
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90 px-1 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
        <ul className="grid grid-cols-4 gap-1">
          {mobileBottomNavigation.map((item) => {
            const isActive = isBottomNavItemActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex h-14 flex-col items-center justify-center rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="mt-1 text-[11px] font-medium leading-none">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed right-0 top-0 z-40 h-screen w-64 bg-white shadow-lg border-l">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-center border-b">
            <h1 className="text-xl font-bold text-gray-800">ניהול הוצאות</h1>
          </div>
          {renderNavContent([...primaryNavigation, ...secondaryNavigation])}
          <div className="border-t p-4 space-y-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <LogOut className="h-4 w-4" />
              התנתק
            </button>
            <p className="text-xs text-gray-500 text-center">
              Family Finance v1.0
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
