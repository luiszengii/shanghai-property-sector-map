import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LocalResearchBanner } from "@/src/components/LocalResearchBanner";
import { isLocalResearchMode } from "@/src/lib/runtime-mode";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const title = "上海楼市互动地图｜房产板块与设施信息";
const description = "按前滩、大宁、徐泾、张江等楼市板块浏览上海配套与关注设施的互动地图工具。";

export const metadata: Metadata = {
  metadataBase: new URL("https://shfang.xyz"),
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: { title, description, type: "website", locale: "zh_CN", images: [{ url: "/og.png", width: 1730, height: 909, alt: "上海楼市互动地图" }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {isLocalResearchMode && <LocalResearchBanner />}
        {children}
      </body>
    </html>
  );
}
