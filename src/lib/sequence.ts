import { connectDB } from "@/lib/db/connection";
import { Counter } from "@/models/Counter";

/** Atomic, concurrency-safe sequence generator (single findOneAndUpdate with $inc + upsert). */
export async function nextSequence(key: string): Promise<number> {
  await connectDB();
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return doc!.seq;
}

const pad = (n: number, w = 6) => String(n).padStart(w, "0");
export const nextOrderNumber = async () => {
  const y = new Date().getUTCFullYear();
  return `PB-${y}-${pad(await nextSequence(`order:${y}`))}`;
};
export const nextTicketNumber = async () => `TKT-${pad(await nextSequence("ticket"))}`;
export const nextPetCode = async () => `PET-${pad(await nextSequence("pet"))}`;
export const nextPaymentRef = async () => `PAY-${pad(await nextSequence("payment"))}`;
