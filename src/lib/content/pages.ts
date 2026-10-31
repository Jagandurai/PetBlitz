export interface Section { heading: string; body: string[] }
export interface PageContent { title: string; intro: string; sections: Section[] }

/** Single place to maintain customer-facing static copy. {windowDays} and {petsPolicy} are filled from public store settings. */
export const SUPPORT_EMAIL = "Support@petblitz.in";

export const PAGES: Record<string, PageContent> = {
  about: {
    title: "About PetBlitz",
    intro: "PetBlitz is an online store for dogs, cats and pet accessories, delivered across India.",
    sections: [
      { heading: "What we offer", body: ["Browse dogs and cats listed by our team, and a range of accessories organised by category. Every listing shows its current price, availability and details as maintained by PetBlitz."] },
      { heading: "How ordering works", body: ["Sign in with Google, add items to your cart, check out and pay securely online. You can follow each order from placement to delivery from your account."] },
      { heading: "Need help?", body: [`Email us at ${SUPPORT_EMAIL} or use the Contact Us page and we will get back to you.`] },
    ],
  },
  "refund-policy": {
    title: "Refund Policy",
    intro: "How refunds are handled for cancelled or returned orders.",
    sections: [
      { heading: "Cancelled orders", body: ["Orders can be cancelled by you from My Orders until they are shipped. If you had already paid, the paid amount is refunded to your PetBlitz wallet."] },
      { heading: "Returns", body: ["Refunds for approved returns are issued after the return has been reviewed. You can follow the status of a return under My Account → Returns."] },
      { heading: "Refund status", body: [`The order page shows whether a refund has been initiated or completed. If you have a question, contact ${SUPPORT_EMAIL}.`] },
    ],
  },
  "return-policy": {
    title: "Return Policy",
    intro: "When and how items can be returned.",
    sections: [
      { heading: "Accessories", body: ["Delivered accessories can be returned within {windowDays} days of delivery. Request a return from the delivered order in My Orders."] },
      { heading: "Pets", body: ["{petsPolicy}"] },
      { heading: "How to request", body: ["Open the delivered order, choose the item and submit a return request. Our team will review it and update the status under My Account → Returns."] },
    ],
  },
  "privacy-policy": {
    title: "Privacy Policy",
    intro: "What information PetBlitz collects and how you can control it.",
    sections: [
      { heading: "Information we collect", body: ["When you sign in with Google we receive your name and email address. We also store the delivery addresses, phone number, orders and support messages you provide."] },
      { heading: "How it is used", body: ["Your information is used to create your account, process and deliver orders, handle payments and refunds, and respond to your enquiries."] },
      { heading: "Payments", body: ["Payments are processed by our payment provider. PetBlitz does not store your card details."] },
      { heading: "Your controls", body: ["You can update your profile, export your data or request account deletion from My Account → Privacy & data."] },
      { heading: "Contact", body: [`Questions about privacy: ${SUPPORT_EMAIL}.`] },
    ],
  },
  terms: {
    title: "Terms & Conditions",
    intro: "The terms that apply when you use PetBlitz.",
    sections: [
      { heading: "Using the store", body: ["You must sign in to place an order and are responsible for the accuracy of the details you provide, including delivery addresses."] },
      { heading: "Prices and availability", body: ["Prices and availability are confirmed again when you add to cart and place an order. Pets are individual listings and may be sold or reserved before checkout completes."] },
      { heading: "Payments", body: ["An order is confirmed as paid only after the payment provider has confirmed the payment to us."] },
      { heading: "Cancellations and returns", body: ["See our Refund Policy and Return Policy for details."] },
      { heading: "Contact", body: [`For questions about these terms, contact ${SUPPORT_EMAIL}.`] },
    ],
  },
};
