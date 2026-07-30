import type { Metadata } from "next";
import { Geist, Patrick_Hand, Source_Serif_4 } from "next/font/google";
import "./globals.css";

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
  title: "squig — wireframes that know they're wireframes",
  description:
    "An infinite canvas of real UI components that all render like you sketched them on a napkin. Argue about structure, not corner radius.",
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
