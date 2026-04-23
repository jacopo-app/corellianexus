import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Corellia Nexus",
  description: "Competitive tracking for Star Wars: Unlimited",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.className}>
      <body className="min-h-screen bg-gray-950 text-gray-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
