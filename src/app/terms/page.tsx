import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { TermsOfServicePage } from "@/components/StaticPages";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | PdfCrux",
  description:
    "Rules and guidelines for using PdfCrux PDF tools, including subscription terms, acceptable use, and token system.",
};

export default function TermsRoute() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <TermsOfServicePage />
      </main>
      <Footer />
    </div>
  );
}
