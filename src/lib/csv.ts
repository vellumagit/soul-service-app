// Tiny CSV helper. RFC 4180-ish — quotes any field containing comma, quote,
// newline; doubles internal quotes. UTF-8 BOM prepended so Excel doesn't
// mangle non-ASCII (Russian/Ukrainian names, accented characters).
//
// Not a substitute for a real CSV library if you need wider type support,
// but enough for our exports.

export type CsvValue = string | number | boolean | Date | null | undefined;

export function rowsToCsv(
  headers: string[],
  rows: CsvValue[][]
): string {
  const all = [headers, ...rows.map((r) => r.map(formatCell))];
  return "﻿" + all.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

function formatCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function csvEscape(v: string): string {
  if (/[",\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** Build a Response with the right CSV headers + a filename for download. */
export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
