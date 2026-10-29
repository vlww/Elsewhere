import type { Metadata, Viewport } from "next";
import { Manrope, Pirata_One } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Display face for titles and headings (single weight; blackletter, so no true italic).
const serif = Pirata_One({ variable: "--font-serif", subsets: ["latin", "latin-ext"], weight: "400" });
const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Elsewhere",
  description: "Find places you'd genuinely enjoy spending time in: to study, read, think, or meet a friend.",
};

export const viewport: Viewport = {
  themeColor: "#FFF9F4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Browser extensions often inject attributes into <body>; don't treat that as an app hydration error. */}
      <body className="h-full overflow-hidden" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
