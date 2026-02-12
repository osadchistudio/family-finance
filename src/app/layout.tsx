import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { LayoutShell } from "@/components/LayoutShell";
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
        <LayoutShell>{children}</LayoutShell>
        <ToastContainer />
      </body>
    </html>
  );
}
