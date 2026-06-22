import { createAgentMark } from "@agentmark-ai/prompt-core";
import { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";

// Local dev (no app id): prompts come from `agentmark dev`'s API server.
// Linked to cloud (app id present): prompts come from AgentMark Cloud.
const loader = process.env.AGENTMARK_APP_ID
  ? ApiLoader.cloud({
      apiKey: process.env.AGENTMARK_API_KEY!,
      appId: process.env.AGENTMARK_APP_ID,
      baseUrl: process.env.AGENTMARK_BASE_URL,
    })
  : ApiLoader.local({ baseUrl: "http://localhost:9418" });

// The four routing queues the downstream router actually accepts. The whole
// point of the demo: v1 of the prompt lets the model free-text a category, so
// production emits labels like "Billing Issue" that this set rejects → misroute.
const VALID_QUEUES = [
  "billing_disputes",
  "tech_support",
  "account_access",
  "general_inquiry",
];

// object_config outputs arrive as a JSON string on some paths and a parsed
// object on others; expected_output is authored as a JSON string in the
// dataset. Parse defensively so the scorer is shape-agnostic.
const asObject = (v: unknown): any => {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return { category: v };
    }
  }
  return v ?? {};
};

// Scorers register here; the webhook runner sources them from the client, so they
// run in experiments and `passed` is what run-experiment's --threshold gate counts.
export const client = createAgentMark({
  loader,
  scorers: {
    exact_match: ({ output, expectedOutput }) => ({
      score: output === expectedOutput ? 1 : 0,
      passed: output === expectedOutput,
    }),
    // Passes only when the routed category is a real queue AND matches the
    // expected queue for that ticket. v1 fails both ways (free-text label);
    // v2 (enum-constrained) passes.
    valid_category: ({ output, expectedOutput }) => {
      const category = asObject(output).category;
      const expected = expectedOutput ? asObject(expectedOutput).category : undefined;
      const isRealQueue = VALID_QUEUES.includes(category);
      const matchesExpected = expected == null || category === expected;
      const passed = isRealQueue && matchesExpected;
      return {
        score: passed ? 1 : 0,
        passed,
        reason: passed
          ? `routed to ${category}`
          : !isRealQueue
            ? `"${category}" is not a valid routing queue`
            : `routed to "${category}", expected "${expected}"`,
      };
    },
  },
});
