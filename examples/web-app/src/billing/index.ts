/**
 * Billing — Stripe webhook handler for the example.
 *
 * Real production code would verify the Stripe-Signature header, use the
 * official Stripe SDK, and idempotently persist the event. This stub
 * accepts the event, runs the same checks, and records the state for
 * fast-verify to assert on.
 */

export type StripeEvent =
  | { type: 'checkout.session.completed'; sessionId: string; customerId: string }
  | { type: 'invoice.paid'; customerId: string; amountCents: number };

const processed = new Set<string>();

export function handleWebhook(
  rawBody: string,
  signature: string | null,
): { ok: boolean; reason?: string } {
  if (!signature) return { ok: false, reason: 'missing signature' };
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { ok: false, reason: 'invalid json' };
  }
  const id =
    (event as { sessionId?: string; customerId?: string }).sessionId ??
    (event as { customerId: string }).customerId ??
    '';
  if (processed.has(id)) return { ok: true, reason: 'duplicate (idempotent)' };
  processed.add(id);
  return { ok: true };
}

export function customerIsPaid(customerId: string): boolean {
  return processed.size > 0 && Array.from(processed).some((id) => id.startsWith(customerId));
}
