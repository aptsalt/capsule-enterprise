import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAPSULE — Knowledge Graph · 8090 Software Factory",
  description: "Capture every agent session as a compressed capsule, surface it on the Software Factory knowledge graph, and compound it into versioned skills — the reinforcement-learning loop for the enterprise.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
