import type { Metadata } from "next";
import { Geist, Patrick_Hand, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const title = "squig — wireframes that know they're wireframes";
const description =
  "An infinite canvas of real UI components that all render like you sketched them on a napkin. Argue about structure, not corner radius.";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const patrickHand = Patrick_Hand({
  variable: "--font-sketch",
  weight: "400",
  subsets: ["latin"],
});

// The canvas's serif — a text face rather than a display one, because it has to
// hold up at 12px inside a wireframe's caption, not just in a headline.
const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://squig.sh"),
  applicationName: "squig",
  title,
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "squig",
    title,
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "A blue doodle of a bear sketching a wireframe",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [
      {
        url: "/twitter-image",
        width: 1200,
        height: 630,
        alt: "A blue doodle of a bear sketching a wireframe",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${patrickHand.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
