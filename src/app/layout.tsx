import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ChunkReloadGuard } from "@/components/ChunkReloadGuard";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

// Fraunces — a variable display serif. Warm, contemporary but contemplative.
// Used sparingly for headers, pull-quotes, and section titles to give the app
// a journal/book feel instead of CRM-table feel. The italic variant has a
// soulful pen-stroke quality that fits the practitioner's voice.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

export const metadata: Metadata = {
  title: "Soul Service",
  description: "A quiet, personal client workspace for one-on-one practitioners.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full text-ink-800">
        <ChunkReloadGuard />
        {children}
      </body>
    </html>
  );
}
