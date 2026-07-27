import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";
import { ChunkReloadGuard } from "@/components/ChunkReloadGuard";
import { BrandProvider } from "@/components/BrandProvider";
import { getBrand } from "@/lib/brand";

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

// The browser-tab icon is HERS, set in Settings → Branding, so it has to be
// read at request time rather than baked in at build time — otherwise
// changing it would need a redeploy. Next's file convention (app/icon.png)
// is deliberately NOT used, so this stays the single source of truth.
//
// Defensive by design: any DB hiccup falls back to the plain title rather
// than failing the render of every page in the app.
export async function generateMetadata(): Promise<Metadata> {
  const base: Metadata = {
    title: "Soul Service",
    description:
      "A quiet, personal client workspace for one-on-one practitioners.",
  };
  // Hers if she's uploaded one, otherwise the bundled on-brand mark. Always
  // emitting exactly one icon keeps browsers from picking between competing
  // links (which is why the Next starter's app/favicon.ico was removed —
  // its auto-injected tag would sometimes beat her upload).
  const { faviconUrl } = await getBrand();
  const icon = faviconUrl || "/favicon-default.svg";
  return { ...base, icons: { icon, shortcut: icon, apple: icon } };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Same cached read generateMetadata used — one query for the whole request.
  const { logoUrl } = await getBrand();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full text-ink-800">
        <ChunkReloadGuard />
        <BrandProvider logoUrl={logoUrl}>{children}</BrandProvider>
      </body>
    </html>
  );
}
