# support-triage demo

Launch-week Day 1 demo for AgentMark: **fix a failing agent without leaving your editor.**

A support-ticket router (`agentmark/support-triage.prompt.mdx`) classifies tickets into
routing queues. In production it emits free-text categories like `"Billing Issue"` that the
downstream router doesn't accept — so a refund ticket gets misrouted.

The whole loop runs from a coding agent (Claude Code / Cursor) via the AgentMark local MCP + CLI:

1. **Investigate** the failing trace via the local MCP (`list_traces` / `get_trace`).
2. **Capture** it as a regression test (`import_dataset_rows_from_traces`), then shape it into a test.
3. **Fix** the prompt — constrain `category` to the real routing-queue enum.
4. **Prove it** — `agentmark run-experiment --threshold 100` goes red → green.
5. **Open a PR** — the eval gates the merge in CI (`.github/workflows/eval.yml`).

## Run it locally

```bash
npm install
cp .env.example .env            # add your OPENAI_API_KEY
npx agentmark dev --no-ui       # API :9418 + webhook :9417
# in another shell:
npx agentmark run-experiment agentmark/support-triage.prompt.mdx --threshold 100
```

On `main` (the broken prompt) the eval fails. The fix branch
(`fix/triage-billing-disputes-routing-enum`) passes 4/4.

## Structure

| File | Role |
|------|------|
| `agentmark/support-triage.prompt.mdx` | the prompt (the thing you edit) |
| `agentmark/support-triage-data.jsonl` | the regression dataset |
| `agentmark.client.ts` | the `valid_category` scorer |
| `dev-entry.ts` / `handler.ts` | the OpenAI executor |
| `.github/workflows/eval.yml` | the CI eval gate |
