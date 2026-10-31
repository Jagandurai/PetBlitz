import { expireUnpaidOrders } from "./order.service";
import { releaseExpiredPetReservations } from "./pet.service";
import { reconcilePendingWalletRefunds } from "./payment.service";
import { processOutbox } from "./email.service";

/**
 * Idempotent housekeeping, safe to run every few minutes and safe to overlap:
 *  1. cancel unpaid orders past the reservation TTL (releases stock + pet reservations; a payment that races in is auto-refunded to the wallet)
 *  2. release any remaining expired pet reservations
 *  3. finish wallet refunds that were reserved but never marked succeeded
 *  4. send queued e-mails (skipped while SMTP is not configured)
 */
export async function runMaintenance() {
  const ordersCancelled = await expireUnpaidOrders();
  const petReservationsReleased = await releaseExpiredPetReservations();
  const walletRefundsFinalised = await reconcilePendingWalletRefunds();
  const email = await processOutbox();
  return { ordersCancelled, petReservationsReleased, walletRefundsFinalised, email };
}
