import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ContactUsPage } from "@/components/StaticPages";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us | PdfCrux",
  description:
    "Get in touch with PdfCrux support. Find answers to frequently asked questions or reach our team directly.",
};

export default function ContactRoute() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <ContactUsPage />
      </main>
      <Footer />
    </div>
  );
}
