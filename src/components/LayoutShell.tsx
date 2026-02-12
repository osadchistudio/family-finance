'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';

interface LayoutShellProps {
  children: React.ReactNode;
}

export function LayoutShell({ children }: LayoutShellProps) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  return (
    <div className="min-h-screen">
      {!isLoginPage && <Sidebar />}
      <main className={`flex-1 p-4 sm:p-6 ${isLoginPage ? '' : 'pt-20 lg:pt-6 lg:mr-64'}`}>
        <div className="max-w-[1700px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
