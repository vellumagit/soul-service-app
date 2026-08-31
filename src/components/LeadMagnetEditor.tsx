"use client";

// The lead-magnet editor — a full page (not a modal), because a modal couldn't
// hold this and stay legible. Two panes: a flow-ordered form on the left
// (① the resource → ② the sign-up page → ③ what they receive → ④ follow-ups),
// and a LIVE PREVIEW of the public /free page on the right so it's always clear
// where each field lands. Every visitor-facing string is edited EN + УКР side
// by side, so the Ukrainian can't be silently forgotten.
//
// The form is controlled (so the preview updates as she types) but still
// submits as FormData through the same saveLeadMagnet action — each input keeps
// its name, so nothing about the server contract changed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { saveLeadMagnet } from "@/lib/lead-magnet-actions";
import type { LeadMagnetRow } from "./LeadMagnetsManager";
import { notify } from "./FlashNotifier";

type FU = {
  delayDays: string;
  subjectEn: string;
  subjectUk: string;
  bodyEn: string;
  bodyUk: string;
};

const inCls =
  "w-full px-2.5 py-1.5 text-sm border border-ink-200 rounded-md bg-white text-ink-900 placeholder:text-ink-300 focus:outline-none focus:border-plum-400";

function pick(en: string, uk: string, lang: "en" | "uk") {
  const primary = (lang === "uk" ? uk : en).trim();
  const fallback = (lang === "uk" ? en : uk).trim();
  return primary || fallback;
}

export function LeadMagnetEditor({
  magnet,
  accountId,
  origin,
}: {
  magnet: LeadMagnetRow | null;
  accountId: string;
  origin: string;
}) {
  const router = useRouter();
  const isEdit = !!magnet;

  const [titleEn, setTitleEn] = useState(magnet?.titleEn ?? "");
  const [titleUk, setTitleUk] = useState(magnet?.titleUk ?? "");
  const [subtitleEn, setSubtitleEn] = useState(magnet?.subtitleEn ?? "");
  const [subtitleUk, setSubtitleUk] = useState(magnet?.subtitleUk ?? "");
  const [descriptionEn, setDescriptionEn] = useState(magnet?.descriptionEn ?? "");
  const [descriptionUk, setDescriptionUk] = useState(magnet?.descriptionUk ?? "");
  const [buttonEn, setButtonEn] = useState(magnet?.buttonEn ?? "");
  const [buttonUk, setButtonUk] = useState(magnet?.buttonUk ?? "");
  const [assetLabelEn, setAssetLabelEn] = useState(magnet?.assetLabelEn ?? "");
  const [assetLabelUk, setAssetLabelUk] = useState(magnet?.assetLabelUk ?? "");
  const [ctaLabelEn, setCtaLabelEn] = useState(magnet?.ctaLabelEn ?? "");
  const [ctaLabelUk, setCtaLabelUk] = useState(magnet?.ctaLabelUk ?? "");
  const [ctaHref, setCtaHref] = useState(magnet?.ctaHref ?? "");
  const [slug, setSlug] = useState(magnet?.slug ?? "");
  const [published, setPublished] = useState(magnet?.published ?? false);

  const [kind, setKind] = useState(magnet?.assetKind ?? "pdf");
  const fileKind = kind === "pdf" || kind === "image";
  const [assetUrl, setAssetUrl] = useState(
    magnet && magnet.assetKind !== "video_link" ? magnet.assetUrl ?? "" : ""
  );
  const [assetName, setAssetName] = useState(magnet?.assetName ?? "");
  const [videoUrl, setVideoUrl] = useState(
    magnet?.assetKind === "video_link" ? magnet.assetUrl ?? "" : ""
  );
  const [uploading, setUploading] = useState(false);

  const [fus, setFus] = useState<FU[]>(
    (magnet?.followups ?? []).map((f) => ({
      delayDays: String(Math.round(f.delayHours / 24)),
      subjectEn: f.subjectEn,
      subjectUk: f.subjectUk,
      bodyEn: f.bodyEn,
      bodyUk: f.bodyUk,
    }))
  );

  const [previewLang, setPreviewLang] = useState<"en" | "uk">("en");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setFu(i: number, k: keyof FU, v: string) {
    setFus((prev) => prev.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  }
  function addFu() {
    if (fus.length >= 2) return;
    setFus((prev) => [
      ...prev,
      { delayDays: prev.length === 0 ? "2" : "5", subjectEn: "", subjectUk: "", bodyEn: "", bodyUk: "" },
    ]);
  }
  function removeFu(i: number) {
    setFus((prev) => prev.filter((_, j) => j !== i));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const blob = await upload(
        `accounts/${accountId}/lead-magnets/${safe}`,
        file,
        { access: "public", handleUploadUrl: "/api/lead-magnets/upload" }
      );
      setAssetUrl(blob.url);
      setAssetName(file.name);
    } catch {
      setError("That upload didn't go through — try again.");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || uploading) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await saveLeadMagnet(new FormData(e.currentTarget));
      if (!res.ok) {
        setError(res.error);
        setSubmitting(false);
        return;
      }
      notify({
        kind: "success",
        title: isEdit ? "Lead magnet updated" : "Lead magnet created",
      });
      router.push("/lead-magnets");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
      setSubmitting(false);
    }
  }

  // Preview values (fall back across languages so it's never blank).
  const pTitle = pick(titleEn, titleUk, previewLang) || "Your title";
  const pSub = pick(subtitleEn, subtitleUk, previewLang);
  const pDesc = pick(descriptionEn, descriptionUk, previewLang);
  const pButton =
    pick(buttonEn, buttonUk, previewLang) ||
    (previewLang === "uk" ? "Надішліть мені" : "Send it to me");
  const pSlug = slug.trim() || "your-resource";
  const hasFu = fus.some((f) => (f.subjectEn || f.subjectUk) && (f.bodyEn || f.bodyUk));

  return (
    <form onSubmit={onSubmit}>
      {isEdit && <input type="hidden" name="id" value={magnet.id} />}
      <input type="hidden" name="assetKind" value={kind} />
      <input type="hidden" name="assetUrl" value={assetUrl} />
      <input type="hidden" name="assetName" value={assetName} />
      {published && <input type="hidden" name="published" value="on" />}

      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_.85fr] gap-6">
        {/* ── FORM ─────────────────────────────────────────────────── */}
        <div className="space-y-4 min-w-0">
          {/* ① The resource */}
          <Section n="1" title="The resource" sub="what you're giving away">
            <div className="flex gap-2 mb-3">
              {[
                { k: "pdf", label: "PDF" },
                { k: "image", label: "Image" },
                { k: "video_link", label: "Video link" },
              ].map((o) => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => {
                    setKind(o.k);
                    if (magnet && o.k === magnet.assetKind) {
                      setAssetUrl(magnet.assetKind !== "video_link" ? magnet.assetUrl ?? "" : "");
                      setAssetName(magnet.assetName ?? "");
                    } else if (o.k !== "video_link") {
                      setAssetUrl("");
                      setAssetName("");
                    }
                  }}
                  className={
                    kind === o.k
                      ? "text-xs font-medium px-3 py-1.5 rounded-md bg-plum-700 text-white"
                      : "text-xs font-medium px-3 py-1.5 rounded-md bg-ink-100 text-ink-600 hover:bg-ink-200"
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>

            {fileKind ? (
              <div>
                <input
                  type="file"
                  accept={kind === "pdf" ? "application/pdf" : "image/*"}
                  onChange={onFile}
                  disabled={uploading}
                  className="block w-full text-sm text-ink-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-plum-50 file:text-plum-700 hover:file:bg-plum-100"
                />
                <div className="text-[11px] mt-1 leading-relaxed">
                  {uploading ? (
                    <span className="text-plum-700">Uploading…</span>
                  ) : assetUrl ? (
                    <span className="text-green-700">
                      ✓ {assetName || "File ready"} —{" "}
                      <a href={assetUrl} target="_blank" rel="noopener noreferrer" className="underline">
                        view
                      </a>
                      . Choose another to replace it.
                    </span>
                  ) : (
                    <span className="text-ink-400">
                      Uploads straight to your storage — up to 30 MB.
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <input
                  name="assetVideoUrl"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  className={inCls}
                  placeholder="https://youtu.be/…  ·  Loom, Vimeo, Google Drive all work"
                />
              </div>
            )}

            <div className="mt-3">
              <BiField
                label="Title"
                hint="The name people see — the page heading and the email subject."
                en={titleEn}
                uk={titleUk}
                setEn={setTitleEn}
                setUk={setTitleUk}
                nameEn="titleEn"
                nameUk="titleUk"
                phEn="The Coming-Home Workbook"
                phUk="Робочий зошит «Повернення до себе»"
              />
            </div>
          </Section>

          {/* ② The sign-up page */}
          <Section n="2" title="The sign-up page" sub="what visitors read — see it →">
            <BiField
              label="Subtitle"
              hint="One line under the title. Optional."
              en={subtitleEn}
              uk={subtitleUk}
              setEn={setSubtitleEn}
              setUk={setSubtitleUk}
              nameEn="subtitleEn"
              nameUk="subtitleUk"
              phEn="A quiet 15-minute practice for hearing your own voice."
              phUk="Тиха 15-хвилинна практика, щоб почути власний голос."
            />
            <BiField
              label="Description"
              hint="A short invitation. Blank lines start new paragraphs."
              en={descriptionEn}
              uk={descriptionUk}
              setEn={setDescriptionEn}
              setUk={setDescriptionUk}
              nameEn="descriptionEn"
              nameUk="descriptionUk"
              multiline
            />
            <BiField
              label="Sign-up button"
              hint="The button that captures their email."
              en={buttonEn}
              uk={buttonUk}
              setEn={setButtonEn}
              setUk={setButtonUk}
              nameEn="buttonEn"
              nameUk="buttonUk"
              phEn="Send it to me"
              phUk="Надішліть мені"
            />
          </Section>

          {/* ③ What they receive */}
          <Section n="3" title="What they receive" sub="the delivery email">
            <BiField
              label="Download button"
              hint="The 'get it' button in the email and on the page after they sign up."
              en={assetLabelEn}
              uk={assetLabelUk}
              setEn={setAssetLabelEn}
              setUk={setAssetLabelUk}
              nameEn="assetLabelEn"
              nameUk="assetLabelUk"
              phEn="Download the workbook"
              phUk="Завантажити зошит"
            />
            <BiField
              label="A gentle next step (optional)"
              hint="A nudge shown after they get it — e.g. book a Circle."
              en={ctaLabelEn}
              uk={ctaLabelUk}
              setEn={setCtaLabelEn}
              setUk={setCtaLabelUk}
              nameEn="ctaLabelEn"
              nameUk="ctaLabelUk"
              phEn="When you're ready, come to a Circle →"
              phUk="Коли будете готові, завітайте до Кола →"
            />
            <label className="block">
              <span className="text-[11px] text-ink-500">Where that step links</span>
              <input
                name="ctaHref"
                value={ctaHref}
                onChange={(e) => setCtaHref(e.target.value)}
                className={inCls}
                placeholder="/#contact  or  https://…"
              />
            </label>
          </Section>

          {/* ④ Follow-up emails */}
          <Section n="4" title="Follow-up emails" sub="optional nurture">
            <p className="text-[11px] text-ink-400 leading-relaxed mb-3">
              Automatic emails after someone signs up. Type{" "}
              <code className="text-ink-500">{"{first}"}</code> for their first
              name; each is signed with your name.
            </p>
            <div className="space-y-3">
              {fus.map((f, i) => (
                <div
                  key={i}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--color-honey-50, #fbf3e4)",
                    border: "1px solid rgba(176,92,54,0.2)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
                      Follow-up {i + 1}
                      <span className="text-xs text-ink-500">· send after</span>
                      <input
                        name={`fuDelayDays${i + 1}`}
                        type="number"
                        min={0}
                        max={365}
                        value={f.delayDays}
                        onChange={(e) => setFu(i, "delayDays", e.target.value)}
                        className="w-14 px-1.5 py-0.5 text-sm border border-honey-300 rounded bg-white text-center"
                      />
                      <span className="text-xs text-ink-500">days</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFu(i)}
                      className="text-[11px] text-ink-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                  <BiField
                    label="Subject"
                    en={f.subjectEn}
                    uk={f.subjectUk}
                    setEn={(v) => setFu(i, "subjectEn", v)}
                    setUk={(v) => setFu(i, "subjectUk", v)}
                    nameEn={`fuSubjectEn${i + 1}`}
                    nameUk={`fuSubjectUk${i + 1}`}
                    phEn="How is it landing?"
                    phUk="Як воно відгукується?"
                    tight
                  />
                  <BiField
                    label="Message"
                    en={f.bodyEn}
                    uk={f.bodyUk}
                    setEn={(v) => setFu(i, "bodyEn", v)}
                    setUk={(v) => setFu(i, "bodyUk", v)}
                    nameEn={`fuBodyEn${i + 1}`}
                    nameUk={`fuBodyUk${i + 1}`}
                    multiline
                    tight
                  />
                </div>
              ))}
              {fus.length < 2 && (
                <button
                  type="button"
                  onClick={addFu}
                  className="text-xs font-medium text-plum-700 hover:underline"
                >
                  + Add {fus.length === 0 ? "a" : "another"} follow-up
                </button>
              )}
            </div>
          </Section>

          {/* Publish bar */}
          <div className="paper-card p-4 space-y-3">
            <label className="block">
              <span className="text-[11px] text-ink-500">
                Web address — the public link is{" "}
                <span className="font-mono">/free/{pSlug}</span>
              </span>
              <input
                name="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className={inCls}
                placeholder="Leave blank to build it from the title"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="rounded border-ink-300"
              />
              Publish it — the <span className="font-mono text-xs">/free</span>{" "}
              page goes live
            </label>
            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">
                {error}
              </div>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || uploading}
                className="px-5 py-2 text-sm font-medium bg-plum-700 hover:bg-plum-800 text-white rounded-md disabled:opacity-60"
              >
                {uploading ? "Uploading…" : submitting ? "Saving…" : isEdit ? "Save changes" : "Create"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/lead-magnets")}
                className="text-sm text-ink-500 hover:text-ink-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* ── LIVE PREVIEW ─────────────────────────────────────────── */}
        <div className="min-w-0">
          <div className="lg:sticky lg:top-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-ink-400 font-mono">
                Live preview
              </span>
              <div className="flex gap-1">
                {(["en", "uk"] as const).map((lg) => (
                  <button
                    key={lg}
                    type="button"
                    onClick={() => setPreviewLang(lg)}
                    className={
                      previewLang === lg
                        ? "text-[10px] px-2 py-0.5 rounded bg-plum-700 text-white"
                        : "text-[10px] px-2 py-0.5 rounded bg-ink-100 text-ink-500"
                    }
                  >
                    {lg === "en" ? "EN" : "УКР"}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-ink-200 bg-white">
              <div className="h-6 bg-ink-50 border-b border-ink-100 flex items-center px-3 gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ink-200" />
                <span className="w-1.5 h-1.5 rounded-full bg-ink-200" />
                <span className="font-mono text-[9px] text-ink-400 ml-1 truncate">
                  {origin.replace(/^https?:\/\//, "")}/free/{pSlug}
                </span>
              </div>
              <div className="px-5 py-7 text-center" style={{ background: "var(--color-app-bg, #faf6f0)" }}>
                <h3 className="serif text-lg text-ink-900 mb-1.5" style={{ fontWeight: 500 }}>
                  {pTitle}
                </h3>
                {pSub && <p className="text-xs text-ink-600 mb-2.5">{pSub}</p>}
                {pDesc
                  .split(/\n{2,}/)
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .slice(0, 3)
                  .map((p, i) => (
                    <p key={i} className="text-[11px] text-ink-500 leading-relaxed max-w-[85%] mx-auto mb-2">
                      {p}
                    </p>
                  ))}
                <span className="inline-block bg-plum-700 text-white text-xs rounded-lg px-4 py-2 mt-1">
                  {pButton}
                </span>
              </div>
            </div>

            <div className="paper-card p-3.5">
              <p className="text-[11px] font-medium text-ink-700 mb-2">
                What happens after they sign up
              </p>
              <ol className="space-y-1.5 text-[11px] text-ink-500">
                <li className="flex gap-2">
                  <span className="text-plum-600 font-mono">1.</span>
                  <span>They get the resource instantly, plus a delivery email</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-plum-600 font-mono">2.</span>
                  <span>They land in your <strong>Inbox</strong> as a lead</span>
                </li>
                {hasFu && (
                  <li className="flex gap-2">
                    <span className="text-plum-600 font-mono">3.</span>
                    <span>
                      Follow-up email{fus.length > 1 ? "s" : ""} go out on your
                      schedule
                    </span>
                  </li>
                )}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

// ── Section wrapper — a numbered flat card ──────────────────────────────────
function Section({
  n,
  title,
  sub,
  children,
}: {
  n: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="paper-card p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-5 h-5 rounded-full bg-plum-100 text-plum-700 text-[11px] font-semibold flex items-center justify-center shrink-0">
          {n}
        </span>
        <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
        {sub && <span className="text-[11px] text-ink-400 ml-auto">{sub}</span>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// ── One field, English + Ukrainian side by side ─────────────────────────────
function BiField({
  label,
  hint,
  en,
  uk,
  setEn,
  setUk,
  nameEn,
  nameUk,
  phEn = "",
  phUk = "",
  multiline,
  tight,
}: {
  label: string;
  hint?: string;
  en: string;
  uk: string;
  setEn: (v: string) => void;
  setUk: (v: string) => void;
  nameEn: string;
  nameUk: string;
  phEn?: string;
  phUk?: string;
  multiline?: boolean;
  tight?: boolean;
}) {
  return (
    <div className={tight ? "mb-2" : ""}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[11px] font-medium text-ink-600">{label}</span>
        {hint && <span className="text-[10px] text-ink-400">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { code: "EN", val: en, set: setEn, name: nameEn, ph: phEn },
          { code: "УКР", val: uk, set: setUk, name: nameUk, ph: phUk },
        ].map((c) => (
          <div key={c.code} className="relative">
            <span className="absolute left-2 top-1.5 text-[9px] font-mono text-plum-400 pointer-events-none">
              {c.code}
            </span>
            {multiline ? (
              <textarea
                name={c.name}
                value={c.val}
                onChange={(e) => c.set(e.target.value)}
                rows={3}
                placeholder={c.ph}
                className={`${inCls} pt-4`}
              />
            ) : (
              <input
                name={c.name}
                value={c.val}
                onChange={(e) => c.set(e.target.value)}
                placeholder={c.ph}
                className={`${inCls} pl-8`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
