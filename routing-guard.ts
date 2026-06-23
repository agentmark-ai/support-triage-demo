/**
 * The four routing queues the downstream router accepts. The demo's "prod
 * failure": v1 of the prompt free-texts a category (e.g. "Billing Issue") that
 * is not one of these, so the ticket can't be routed anywhere.
 */
export const ROUTING_QUEUES = [
  "billing_disputes",
  "tech_support",
  "account_access",
  "general_inquiry",
] as const;

/**
 * If the classified `category` isn't one of the router's queues, stamp the
 * reason on the span as `agentmark.metadata.routing_error` — so the prod trace
 * *explains* why the output is a failure ("Unroutable category 'Billing Issue' —
 * the router accepts only: …") right next to the misrouted output, instead of
 * leaving a viewer to know the valid queue set by heart. No-op for a valid queue.
 *
 * The `agentmark.metadata.*` namespace is the one that actually renders: those
 * keys flow into the span's Metadata and show in the trace's Attributes panel.
 * A bare `agentmark.routing_error` would be dropped (the trace view only surfaces
 * known/metadata keys, not arbitrary span attributes).
 *
 * Always records the reason as `agentmark.metadata.routing_error` (renders in the
 * trace's Attributes panel). Then, when `throwOnUnroutable` is set, it THROWS —
 * the router rejects the ticket. As of prompt-core 1.2.3 a thrown executor on a
 * streaming run marks the span ERROR, so a live prod run shows a real red error.
 *
 * The caller passes `ctx.shouldStream`: a live `run-prompt` streams (→ throw →
 * red prod trace), while a batch `run-experiment` row does NOT stream (→ no
 * throw) so the `valid_category` scorer evaluates the row and gates CI. A thrown
 * row would make `run-experiment` exit 0 and silently defeat that gate.
 */
export function flagUnroutableCategory(
  category: unknown,
  span: { setAttribute(key: string, value: string): void },
  throwOnUnroutable: boolean,
): void {
  if (
    typeof category === "string" &&
    (ROUTING_QUEUES as readonly string[]).includes(category)
  ) {
    return;
  }
  const message = `Unroutable category ${JSON.stringify(
    category,
  )} — the router accepts only: ${ROUTING_QUEUES.join(", ")}`;
  span.setAttribute("agentmark.metadata.routing_error", message);
  if (throwOnUnroutable) throw new Error(message);
}
