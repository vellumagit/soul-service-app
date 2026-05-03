// Single-call structuring: transcript → clean markdown session notes.
// The prompt is deliberately worldview-neutral — it organizes what the
// practitioner and client actually said, in plain observational prose,
// rather than imitating any particular modality or vocabulary.
//
// Why these design choices:
// - Model: claude-sonnet-4-6 (per spec for v1).
// - System prompt holds the stable practitioner voice + format rules — sized
//   above 2048 tokens so Sonnet 4.6's caching threshold is met. The
//   `cache_control` marker on it makes every subsequent call a cache READ
//   (~0.1× cost) instead of a re-write.
// - Template body + client context + transcript live in the user message so
//   switching templates per call does NOT bust the cache (see
//   shared/prompt-caching.md → Silent invalidators: "tools=build_tools(user)
//   varies per user → nothing caches across users"; same logic applies if a
//   per-call template were placed in `system`).
// - No streaming, no thinking. Single round-trip, ~16k max output tokens —
//   well under the SDK's non-streaming HTTP-timeout guard.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

// Stable across every call. Substantive enough (>2048 tokens for Sonnet 4.6)
// to actually be cached.
const SYSTEM_PROMPT = `You are a notes assistant helping a practitioner turn raw meeting transcripts from one-on-one sessions with their clients into clean, structured session notes.

# About this work

The practitioner runs one-on-one sessions over video. The notes you produce go into the client's permanent file and the practitioner re-reads them before future sessions. The work is personal and relational — these aren't medical or legal records. They're a private working notebook.

Important: you do NOT know the practitioner's specific modality, vocabulary, or style. You are NOT trying to imitate their voice. You are organizing what they (and the client) actually said in the transcript into the structure the user gives you. The practitioner will edit and personalize the notes after — your job is to give them a clean draft to work from.

# Your job

You take a raw meeting transcript (often messy, with "ums," tangents, and overlapping speakers) and produce structured session notes following a template the user provides. The output is markdown.

# How to write the notes

Write in third-person, observational. Plain, warm, specific. Examples:
- "She arrived feeling worn down from the week. Settled after the first ten minutes."
- "Brought up her conversation with her sister on Tuesday — said it was the first time she'd been able to name the resentment out loud."
- "Wants to try the morning pages practice again — committed to seven days, no editing."
- "Mentioned wanting to revisit the boundary conversation with her manager next session."

Avoid:
- Clinical / diagnostic language ("the client presented with...", "exhibits symptoms of...")
- Interpretive layering ("this suggests unresolved...", "indicating a pattern of...")
- Therapy or coaching jargon the practitioner didn't use themselves
- Spiritual or somatic framing ("energy was low," "heart chakra," "what came through") UNLESS the transcript shows the practitioner actually using that vocabulary
- Adding emotional color the transcript doesn't support

When in doubt, prefer the client's exact words over a paraphrase, and prefer plain description over interpretation.

# Capture vs skip

**Capture:**
- What the client said they wanted from the session (quote them when possible)
- What actually came up — topics covered, stories told, realizations, insights
- The practitioner's observations and reflections (only what they actually said)
- Direct client quotes that feel substantive (one sentence is usually enough)
- Anything the client committed to between now and next session
- Things the practitioner wants to remember or follow up on next time

**Skip:**
- Greetings, scheduling, tech setup ("can you hear me?"), payment chatter
- Filler words, false starts, repetition
- Long verbatim back-and-forth — summarize the gist
- Anything you'd be inventing or filling in

# Output rules

1. **Return markdown ONLY.** No preamble, no "Here are the notes:" intro. Start directly with the first heading from the template.
2. **Follow the user's template structure exactly** — same headings in the same order. If a section has nothing real to put in it, leave a single dash ("-") or omit it (your judgment).
3. **Be concise.** Notes should be scannable. Bullets over paragraphs. A 60-min session usually compresses to ~150–400 words.
4. **Quote selectively.** Only when the exact words matter. Format as: \`"exact words"\`.
5. **Don't invent.** If the transcript doesn't say it, don't add it. If unclear, omit rather than guess.
6. **Don't moralize or interpret.** No "this suggests..." or "she's clearly working through..." — just record what happened.
7. **Use the client's first name** (provided in the user message) when referring to them.
8. **No code fences around the markdown.** Output the markdown directly as the response body.

# Tone calibration

Match the weight of what actually happened. A short, light session gets short, light notes. A dense one can run longer. Don't pad to fill the template.

When in doubt: write less, leave more for the practitioner to add when they re-read.`;

// Lazy client — never throws at module load (so build doesn't break without the key).
let _client: Anthropic | null = null;
function getClient() {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local (and Vercel env vars for production). Get one at https://console.anthropic.com"
    );
  }
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export type GenerateNotesInput = {
  transcript: string;
  // Optional template body — pre-filled markdown with the headings to follow.
  // If omitted, Claude uses a sensible default based on the system prompt's guidance.
  templateName?: string | null;
  templateBody?: string | null;
  // Lightweight context to anchor the notes
  clientFirstName?: string | null;
  clientWorkingOn?: string | null;
  sessionType?: string | null;
};

export type GenerateNotesResult = {
  notes: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};

// One round-trip: transcript → markdown notes.
// System prompt is cached; template + transcript vary per call.
export async function generateNotesFromTranscript(
  input: GenerateNotesInput
): Promise<GenerateNotesResult> {
  if (!input.transcript || input.transcript.trim().length < 50) {
    throw new Error(
      "Transcript is too short. Paste the full meeting transcript."
    );
  }

  const client = getClient();

  const userMessage = buildUserMessage(input);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    // System block is the stable, cacheable prefix. Marker placed here.
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  if (!textBlock) {
    throw new Error("Claude returned no text content");
  }

  return {
    notes: stripCodeFence(textBlock.text.trim()),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

function buildUserMessage(input: GenerateNotesInput): string {
  const parts: string[] = [];

  // Context block — gives the AI just enough to anchor the writing
  const contextLines: string[] = [];
  if (input.clientFirstName)
    contextLines.push(`- Client first name: ${input.clientFirstName}`);
  if (input.sessionType)
    contextLines.push(`- Session type: ${input.sessionType}`);
  if (input.clientWorkingOn)
    contextLines.push(
      `- What they're working on: ${input.clientWorkingOn}`
    );
  if (contextLines.length > 0) {
    parts.push(`# Client context\n\n${contextLines.join("\n")}`);
  }

  // Template — varies per call, so it lives in the user message (not system)
  if (input.templateBody && input.templateBody.trim().length > 0) {
    parts.push(
      `# Use this template structure exactly\n\n` +
        (input.templateName
          ? `Template: **${input.templateName}**\n\n`
          : "") +
        "```markdown\n" +
        input.templateBody.trim() +
        "\n```"
    );
  } else {
    parts.push(
      `# Use this default structure

\`\`\`markdown
## What they came in with

## What we covered

## Observations

## What they're taking away

## Follow up next time
\`\`\``
    );
  }

  // Transcript — the volatile part, last in the message
  parts.push(`# Transcript\n\n${input.transcript.trim()}`);

  parts.push(
    `# Now produce the session notes\n\nReturn the markdown notes only — no preamble, no closing remarks. Start directly with the first heading.`
  );

  return parts.join("\n\n---\n\n");
}

// If Claude wraps the whole output in a fence despite the instruction not to,
// strip it so the markdown lands cleanly in the notes field.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}
