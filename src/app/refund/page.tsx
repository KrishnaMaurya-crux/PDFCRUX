import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { RefundPolicyPage } from "@/components/StaticPages";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | PdfCrux",
  description:
    "Our commitment to fair and transparent refunds. Learn about eligibility, 7-day money-back guarantee, and how to request a refund.",
};

export default function RefundRoute() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <RefundPolicyPage />
      </main>
      <Footer />
    </div>
  );
}
