'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Upload, List, CalendarDays, Repeat, FolderOpen, Lightbulb, Settings } from 'lucide-react';

const navigation = [
  { name: 'לוח בקרה', href: '/', icon: LayoutDashboard },
  { name: 'העלאת קבצים', href: '/upload', icon: Upload },
  { name: 'תנועות', href: '/transactions', icon: List },
  { name: 'סיכום חודשי', href: '/monthly-summary', icon: CalendarDays },
  { name: 'הוצאות קבועות', href: '/recurring', icon: Repeat },
  { name: 'קטגוריות', href: '/categories', icon: FolderOpen },
  { name: 'טיפים לחיסכון', href: '/tips', icon: Lightbulb },
  { name: 'הגדרות', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed right-0 top-0 z-40 h-screen w-64 bg-white shadow-lg border-l">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b">
          <h1 className="text-xl font-bold text-gray-800">ניהול הוצאות</h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

        {/* Footer */}
        <div className="border-t p-4">
          <p className="text-xs text-gray-500 text-center">
            Family Finance v1.0
          </p>
        </div>
      </div>
    </aside>
  );
}
