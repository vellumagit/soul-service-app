// Help Buddy chat endpoint.
//
// Receives the full conversation each turn and asks Claude to respond as
// the in-app help buddy (system prompt at src/lib/help-prompt.ts).
//
// Caching: the system prompt is sized to be cacheable. `cache_control:
// ephemeral` on the system block makes every follow-up message in the same
// 5-minute window a cache READ — roughly 0.1× the input cost — which keeps
// this feature cheap even if she chats a lot.
//
// Non-streaming for v1 — total output is bounded (one paragraph + maybe a
// short list), well inside the SDK's HTTP timeout. Can upgrade to streaming
// later if we want a typewriter effect.
import "server-only";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireSession } from "@/lib/session-cookies";
import { HELP_SYSTEM_PROMPT } from "@/lib/help-prompt";

export const dynamic = "force-dynamic";

const MODEL = "claude-opus-4-7";

// Lazy client — never throws at module load so the build doesn't break
// without the key. Mirrors the pattern in src/lib/ai-notes.ts.
let _client: Anthropic | null = null;
function getClient() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (and Vercel env vars for production)."
    );
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// Message shape the client sends in. Kept narrow on purpose — only role + text.
type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

function isValidMessages(value: unknown): value is IncomingMessage[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  return value.every(
    (m) =>
      m &&
      typeof m === "object" &&
      (m as { role?: unknown }).role !== undefined &&
      ((m as { role: string }).role === "user" ||
        (m as { role: string }).role === "assistant") &&
      typeof (m as { content?: unknown }).content === "string" &&
      (m as { content: string }).content.trim().length > 0
  );
}

export async function POST(request: Request) {
  // Gate to authenticated users — this is hers, not a public endpoint.
  await requireSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: unknown }).messages;
  if (!isValidMessages(messages)) {
    return NextResponse.json(
      { error: "Body must include a non-empty `messages` array of {role, content}." },
      { status: 400 }
    );
  }

  // Trim the history if it grows huge — keep the last 30 turns. The system
  // prompt + that much chat is well under the model's context, and protects
  // us from someone leaving the panel open for days.
  const trimmed = messages.slice(-30);

  let client: Anthropic;
  try {
    client = getClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI not configured";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      // Adaptive thinking is the only on-mode for Opus 4.7 — and it's worth
      // having for "how do I X" answers where she'd benefit from Claude
      // briefly considering the right page/flow before answering.
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: HELP_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: trimmed.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Concatenate every text block — adaptive thinking can return a thinking
    // block first (its text is empty by default on Opus 4.7), then the real
    // answer in a text block.
    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!reply) {
      return NextResponse.json(
        { error: "No reply produced. Try rephrasing." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[help] Claude call failed:", err);
    const msg =
      err instanceof Error
        ? err.message
        : "Something went wrong reaching the AI.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
