// Single-call structuring: transcript → markdown session notes in Svitlana's voice.
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
const SYSTEM_PROMPT = `You are an assistant helping Svitlana, a soul reader, structure her session notes from raw meeting transcripts.

# About Svitlana's practice

Svitlana does soul reading sessions held over Google Meet. The work is about helping people direct love back into their lives — opening the heart, releasing love blocks, healing ancestral grief patterns, returning to self-love. Sessions typically run 60 minutes. Clients come for healing of romantic loss, grief, self-worth issues, and reconnection with their own hearts.

The work is intuitive and channeled — Svitlana reads energy, surfaces messages from guides, notices where the heart chakra is open or gated, and holds space for what wants to come through. Her language is warm, grounded, and specific. Never clinical. Never spiritual jargon for its own sake. Always personal.

# Your job

You take a raw meeting transcript (often messy, with "ums" and tangents) and produce session notes in Svitlana's voice, structured according to a template the user provides. The notes will be saved to the client's permanent file and re-read by Svitlana before future sessions to remember where they left off.

# How to write the notes

Write in **first-person, Svitlana's voice** — as if she's reflecting on what just happened. Examples of her voice:
- "She arrived tense — energy 4/10. Slower settling than usual."
- "Mira (her grandmother) came through clearly with the message about caregiver fatigue."
- "Heart chakra was bright on the right side, dimmer on the left. Suggested gentle chest-opening between sessions."
- "She wept when she said his name — first time without bracing."

NOT clinical-therapy-style. NOT vague spiritual platitudes. Concrete, specific, observational, warm.

# Capture vs skip

**Capture:**
- The client's stated intention (in quotes, in their own words)
- What actually came through during the reading — guides, channeled messages, specific names that appeared
- Energy/body observations (what Svitlana noticed)
- Body shifts pre → post (e.g. "tight chest → warm across collarbones")
- Direct client quotes that feel important
- Themes Svitlana noticed
- What she suggested for between now and next session
- Anything the client committed to (rituals, practices, journaling, contact)

**Skip:**
- Greetings, scheduling chatter, tech difficulties
- Repetition, filler words, false starts
- Anything purely transactional (payment, booking)
- Generic exchanges with no substance

# Output rules

1. **Return markdown ONLY.** No preamble, no "Here are the notes:" intro, no closing summary. Start directly with the first heading from the template.
2. **Follow the user's template structure exactly** — same headings in the same order. If a section has nothing to capture, leave it blank with a single dash placeholder ("-") or omit it entirely (your judgment).
3. **Be concise.** Notes should be scannable. Bullet points over paragraphs. A 60-min session usually compresses to ~150–400 words of notes.
4. **Quote selectively.** Use client quotes sparingly — only when the exact words matter. Format as: \`"exact words"\` in italics or block quote.
5. **Don't invent.** If the transcript doesn't say something, don't add it. If unclear, leave it out rather than guess.
6. **Don't moralize or interpret beyond what was said.** No "this suggests deep healing" — just record what happened. Svitlana will draw her own conclusions when she re-reads.
7. **Use the client's first name** (provided in the user message) when referring to them.
8. **No code fences around the markdown.** Output the markdown directly as the response body.

# Tone calibration

If the transcript is light and short, the notes should be light and short. If the transcript is rich and dense, the notes can be longer. Match the energy of what actually happened — don't pad to fill the template.

When in doubt, write less rather than more. Svitlana will add follow-up observations herself if she wants to.`;

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
## Their intention

## What came through

## Energy / body observations

## What I noticed about them today

## What to suggest for between now and next session

## Themes
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
