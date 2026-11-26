import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth/customer";
import { AppError } from "@/lib/errors";
import ContactForm from "./contact-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact Us" };

/** Only this route is protected: the session is checked on the server, so a guest never sees the form. */
export default async function Page() {
  let signedIn = true;
  try {
    const cookie = (await headers()).get("cookie") ?? "";
    await requireCustomer(new Request("http://internal/contact", { headers: { cookie } }));
  } catch (e) {
    if (!(e instanceof AppError) || (e.status !== 401 && e.status !== 403)) throw e; // an outage is not "signed out"
    signedIn = false;
  }
  if (!signedIn) redirect("/login?next=/contact");
  return <ContactForm />;
}
