import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Gate dashboard",
  description: "Retrieval quality runs, regression baselines and checked answers",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="top" aria-label="Pages">
          <Link href="/">Runs and baselines</Link>
          <Link href="/answers">Grounded answers</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
