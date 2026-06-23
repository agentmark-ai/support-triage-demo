import "dotenv/config";
import { AgentMarkSDK, createWebhookRunner } from "@agentmark-ai/sdk";
import { createExecutor } from "@agentmark-ai/prompt-core";
import type { WebhookRequest } from "@agentmark-ai/prompt-core/webhook-runner";
import { client } from "./agentmark.client";
import OpenAI from "openai";
import { flagUnroutableCategory } from "./routing-guard";

let _openai: OpenAI | null = null;
const openai = () => (_openai ??= new OpenAI());

const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY!,
  appId: process.env.AGENTMARK_APP_ID!,
  baseUrl: process.env.AGENTMARK_BASE_URL,
});
sdk.initTracing({ registerGlobally: true });

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
    // Explain an unroutable category on the span (routing_error) so the prod
    // trace says why the output fails, next to the misroute it recorded.
    flagUnroutableCategory((object as { category?: unknown }).category, ctx.span);
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

export default (body: WebhookRequest) => runner.dispatch(body);
