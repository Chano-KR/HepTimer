import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HepTimer",
  description: "개인용 집중 타이머와 집중 기록 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
