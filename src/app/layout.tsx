import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastContainer } from "@/components/ui/Toast";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "hebrew"],
});

export const metadata: Metadata = {
  title: "ניהול הוצאות משפחתי",
  description: "מערכת לניהול וניתוח הוצאות והכנסות",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${rubik.variable} font-sans antialiased bg-gray-50 overflow-x-hidden`}>
        <div className="min-h-screen">
          <Sidebar />
          <main className="flex-1 p-4 sm:p-6 pt-20 lg:pt-6 lg:mr-64">
            <div className="max-w-[1700px] mx-auto">
              {children}
            </div>
          </main>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
