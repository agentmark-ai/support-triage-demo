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
 * Deliberately non-throwing: the run still completes and records its output, so
 * the captured `valid_category` scorer stays the thing that flags the failure in
 * eval (RED → GREEN) — exactly the loop the demo teaches.
 */
export function flagUnroutableCategory(
  category: unknown,
  span: { setAttribute(key: string, value: string): void },
): void {
  if (
    typeof category === "string" &&
    (ROUTING_QUEUES as readonly string[]).includes(category)
  ) {
    return;
  }
  span.setAttribute(
    "agentmark.metadata.routing_error",
    `Unroutable category ${JSON.stringify(
      category,
    )} — the router accepts only: ${ROUTING_QUEUES.join(", ")}`,
  );
}
