import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { PrivacyPolicyPage } from "@/components/StaticPages";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | PdfCrux",
  description:
    "How PdfCrux collects, uses, and protects your data. Learn about our privacy practices, cookie policy, and your rights.",
};

export default function PrivacyRoute() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <PrivacyPolicyPage />
      </main>
      <Footer />
    </div>
  );
}
