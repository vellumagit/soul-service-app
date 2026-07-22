"use client";

// Settings → Landing page → storefront copy, in BOTH languages.
//
// Each field shows the CURRENT wording as its placeholder, so she can see what
// she's replacing. Leaving a box blank keeps the built-in copy — which means
// clearing a field is how you revert it. Both language panels stay mounted
// (the inactive one is just hidden) so every value submits with the form; if we
// unmounted it, switching tabs before saving would silently wipe the other
// language.

import { useState } from "react";
import { inputCls } from "./Form";
import { getLandingCopy, type LandingLang } from "@/lib/landing-copy";
import {
  LANDING_OVERRIDE_FIELDS,
  LANDING_OVERRIDE_GROUPS,
  landingOverrideInputName,
  type LandingCopyOverrides,
} from "@/lib/landing-overrides";

const LANGS: { id: LandingLang; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "uk", label: "УКР" },
];

export function LandingCopyEditor({
  initial,
}: {
  initial: LandingCopyOverrides | null;
}) {
  const [active, setActive] = useState<LandingLang>("en");

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setActive(l.id)}
            className={
              active === l.id
                ? "text-xs font-medium px-3 py-1.5 rounded-md bg-plum-700 text-white"
                : "text-xs font-medium px-3 py-1.5 rounded-md bg-ink-100 text-ink-600 hover:bg-ink-200"
            }
          >
            {l.label}
          </button>
        ))}
        <span className="text-[11px] text-ink-500 italic ml-1">
          Editing the {active === "en" ? "English" : "Ukrainian"} storefront
        </span>
      </div>

      <p className="text-[12px] text-ink-500 italic mb-4 leading-relaxed">
        Leave a box empty to keep the wording that&apos;s already on the site —
        the grey text in each box is what visitors see right now. Both languages
        save together.
      </p>

      {LANGS.map((l) => (
        <div key={l.id} style={{ display: active === l.id ? "block" : "none" }}>
          <LangPanel lang={l.id} initial={initial?.[l.id] ?? {}} />
        </div>
      ))}
    </div>
  );
}

function LangPanel({
  lang,
  initial,
}: {
  lang: LandingLang;
  initial: Record<string, string>;
}) {
  const current = getLandingCopy(lang);

  return (
    <div className="space-y-6">
      {LANDING_OVERRIDE_GROUPS.map((group) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-wider font-mono text-ink-500 mb-2">
            {group}
          </div>
          <div className="space-y-3">
            {LANDING_OVERRIDE_FIELDS.filter((f) => f.group === group).map(
              (f) => {
                const name = landingOverrideInputName(lang, f.key);
                const placeholder = f.plain ? f.plain(current) : "";
                return (
                  <div key={f.key}>
                    <label className="block text-[12px] text-ink-700 mb-1">
                      {f.label}
                    </label>
                    {f.multiline ? (
                      <textarea
                        name={name}
                        defaultValue={initial[f.key] ?? ""}
                        placeholder={placeholder}
                        rows={3}
                        maxLength={4000}
                        className={inputCls}
                      />
                    ) : (
                      <input
                        type="text"
                        name={name}
                        defaultValue={initial[f.key] ?? ""}
                        placeholder={placeholder}
                        maxLength={4000}
                        className={inputCls}
                      />
                    )}
                    {f.hint && (
                      <p className="text-[11px] text-ink-500 italic mt-1">
                        {f.hint}
                      </p>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
