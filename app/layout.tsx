import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HANA",
  description: "조사 일정과 번지별 사진 보관함",
  robots: {index:false,follow:false},
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
