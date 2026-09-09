// Turn a client's free-text pronouns ("she/her", "he/him", "they/them",
// "elle", blank…) into the words UI copy needs. Anything unrecognised — and
// blank, which is most clients — reads as they/them, so the app never
// assumes a gender it wasn't told.

export type PronounSet = {
  subject: string; // they
  object: string; // them
  possessive: string; // their
};

const THEY: PronounSet = { subject: "they", object: "them", possessive: "their" };
const SHE: PronounSet = { subject: "she", object: "her", possessive: "her" };
const HE: PronounSet = { subject: "he", object: "him", possessive: "his" };

export function pronounSet(raw: string | null | undefined): PronounSet {
  const s = (raw ?? "").toLowerCase();
  if (!s.trim()) return THEY;
  // "she" is checked first: "she" contains "he", and \bhe\b would not match
  // inside it anyway, but be explicit.
  if (/\bshe\b|\bher\b|\bhers\b/.test(s)) return SHE;
  if (/\bhe\b|\bhim\b|\bhis\b/.test(s)) return HE;
  return THEY;
}
