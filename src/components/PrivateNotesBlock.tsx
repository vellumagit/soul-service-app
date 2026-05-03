// Practitioner-only space — hunches, observations, anything she'd want to
// remember but never share. Visually distinct (locked-feeling) so it's
// clear nothing here ever leaves the file.
import { MarkdownRender } from "./NotesEditor";

export function PrivateNotesBlock({ body }: { body: string | null }) {
  return (
    <div className="border border-ink-200 rounded-md bg-ink-900/[0.02] p-5">
      <div className="flex items-center gap-2 mb-3">
        <svg
          className="w-3.5 h-3.5 text-ink-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <div className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">
          Just for you
        </div>
        <div className="text-[10px] text-ink-400">
          · hunches, observations, things you&apos;re sitting with quietly
        </div>
      </div>
      {body && body.trim().length > 0 ? (
        <div className="md-render text-sm text-ink-700 leading-relaxed">
          <MarkdownRender body={body} />
        </div>
      ) : (
        <div className="text-sm text-ink-400 italic">
          Nothing yet. Anything you write here stays here — never exported,
          never shared with the client.
        </div>
      )}
    </div>
  );
}
