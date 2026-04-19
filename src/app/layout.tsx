import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import CoachSidebar from "@/components/CoachSidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "English Journal",
  description: "영어 일기로 실력을 키우세요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <Nav />
        <div className="flex-1 flex max-w-7xl w-full mx-auto">
          <main className="flex-1 min-w-0 px-3 sm:px-4 py-4 sm:py-8 pb-20 md:pb-8">
            {children}
          </main>
          <CoachSidebar />
        </div>
      </body>
    </html>
  );
}
