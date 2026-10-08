"use client";

// "How are they feeling?" — a 1–10 score for one session, which lifts that
// session's dot on the Journey arc ("Your work together") so the arc shows
// change over time, not just dates.
//
// Native radios (styled as pills) rather than a hidden input + buttons: they
// fire the change events the session card's unsaved-changes tracking listens
// for, and exactly one is always checked ("–" = not rated), so the form always
// submits `feelingRating` — "" clears it, a digit sets it.

export function FeelingRatingField({
  defaultValue,
  name = "feelingRating",
}: {
  defaultValue: number | null;
  name?: string;
}) {
  const options: { value: string; label: string; title: string }[] = [
    { value: "", label: "–", title: "Not rated" },
    ...Array.from({ length: 10 }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1),
      title: `${i + 1} out of 10`,
    })),
  ];
  return (
    <fieldset>
      <legend className="block text-xs font-medium text-ink-700 mb-1">
        How they&apos;re feeling{" "}
        <span className="font-normal text-ink-400">· 1 = very low, 10 = wonderful</span>
      </legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <label key={o.value || "none"} title={o.title} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              defaultChecked={(defaultValue == null ? "" : String(defaultValue)) === o.value}
              className="peer sr-only"
            />
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-ink-200 bg-white text-sm text-ink-600 tabular-nums peer-checked:bg-plum-600 peer-checked:border-plum-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-plum-300 hover:border-plum-300">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
