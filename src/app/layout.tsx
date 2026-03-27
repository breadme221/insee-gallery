import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "InSee | Design Reference Gallery",
  description: "UX 디자인 레퍼런스 갤러리 — AI 태깅 기반 스크린샷 검색",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${inter.variable} antialiased`}>
      <head>
        <Script src="/data_tagged.js" strategy="beforeInteractive" />
        <Script src="/data_similarity.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
