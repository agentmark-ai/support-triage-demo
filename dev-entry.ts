import "dotenv/config";
import { createWebhookServer } from "@agentmark-ai/cli/runner-server";
import { createExecutor } from "@agentmark-ai/prompt-core";
import { AgentMarkSDK, createWebhookRunner } from "@agentmark-ai/sdk";
import OpenAI from "openai";
import { flagUnroutableCategory } from "./routing-guard";

// Lazy: the dev server boots without a key (so the API + webhook come up for
// trace inspection / dataset import); only an actual LLM call constructs the
// client and needs OPENAI_API_KEY from env / .env.
let _openai: OpenAI | null = null;
const openai = () => (_openai ??= new OpenAI());

async function main() {
  const { client } = await import("./agentmark.client");

  new AgentMarkSDK({
    apiKey: "local-dev",
    appId: "local-dev",
    baseUrl: process.env.AGENTMARK_DEV_SERVER ?? "http://localhost:9418",
  }).initTracing({ disableBatch: true });

  const executor = createExecutor({
    name: "openai",
    text: async (formatted) => {
      const res = await openai().chat.completions.create({
        model: formatted.text_config.model_name.replace(/^openai\//, ""),
        messages: formatted.messages,
      });
      return {
        text: res.choices[0].message.content ?? "",
        usage: {
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        },
      };
    },
    object: async (formatted, ctx) => {
      const res = await openai().chat.completions.create({
        model: formatted.object_config.model_name.replace(/^openai\//, ""),
        messages: formatted.messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "response",
            schema: formatted.object_config.schema,
            strict: true,
          },
        },
      });
      const object = JSON.parse(res.choices[0].message.content ?? "{}");
      // Record the model's output FIRST so the trace shows what it produced even
      // when the next line rejects it — otherwise the throw loses the response.
      ctx.span.setAttribute("agentmark.output", JSON.stringify(object));
      // Reject an unroutable category. Throw only on a live (streaming) run so the
      // prod trace goes red; batch experiment rows (non-streaming) stay scorable.
      flagUnroutableCategory(
        (object as { category?: unknown }).category,
        ctx.span,
        ctx.shouldStream,
      );
      return {
        object,
        usage: {
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        },
      };
    },
  });

  const runner = createWebhookRunner({ client, executor });
  const port = parseInt(
    process.argv.find((arg) => arg.startsWith("--webhook-port="))?.split("=")[1] ?? "9417",
    10,
  );

  await createWebhookServer({ handler: runner, port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
