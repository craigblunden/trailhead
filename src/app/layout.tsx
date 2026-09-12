import type { Metadata } from "next";
import { Karla, Source_Serif_4 } from "next/font/google";
import "./globals.css";

import { BRAND_NAME } from "@/lib/brand";

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND_NAME} — every application, one trail`,
    template: `%s · ${BRAND_NAME}`,
  },
  description:
    "Track every role from first spark to signed offer — with the resume you used, the posting link, and the details that matter, all in one basecamp.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${karla.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
