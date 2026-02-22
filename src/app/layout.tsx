import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tubeours",
  description: "A continuous, lean-back YouTube curation experience.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
