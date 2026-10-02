/**
 * Report file formats without third-party dependencies: CSV, a plain-text PDF
 * and an XLSX workbook (a zip of SpreadsheetML parts).
 */

import { deflateRawSync } from "zlib";

// ============================================================================
// TABULAR VIEW
// ============================================================================

/**
 * Flatten a report into rows: arrays of records stay rows, a single object
 * becomes one row per leaf ("overview.totalRevenue" -> value)
 */
export function toRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map((item) =>
      item && typeof item === "object" ? flattenObject(item as Record<string, unknown>) : { value: item }
    );
  }
  if (data && typeof data === "object") {
    return Object.entries(flattenObject(data as Record<string, unknown>)).map(([field, value]) => ({
      field,
      value,
    }));
  }
  return [{ value: data }];
}

function flattenObject(value: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      Object.assign(out, flattenObject(child as Record<string, unknown>, path));
    } else if (Array.isArray(child)) {
      child.forEach((item, i) => {
        if (item && typeof item === "object") {
          Object.assign(out, flattenObject(item as Record<string, unknown>, `${path}[${i}]`));
        } else {
          out[`${path}[${i}]`] = item;
        }
      });
    } else {
      out[path] = child;
    }
  }
  return out;
}

function headersOf(rows: Record<string, unknown>[]): string[] {
  const headers: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!headers.includes(key)) headers.push(key);
    }
  }
  return headers;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

// ============================================================================
// CSV
// ============================================================================

export function toCsv(data: unknown): Buffer {
  const rows = toRows(data);
  if (rows.length === 0) return Buffer.from("");

  const headers = headersOf(rows);
  const escape = (text: string) => (/[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(cellText(row[h]))).join(",")),
  ];
  return Buffer.from(lines.join("\n"));
}

// ============================================================================
// PDF
// ============================================================================

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const FONT_SIZE = 10;
const LINE_HEIGHT = 14;
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);
const MAX_LINE_CHARS = 95;

/** PDF string literal escaping; non-Latin-1 characters become "?" */
function pdfText(text: string): string {
  return text
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(line: string): string[] {
  if (line.length <= MAX_LINE_CHARS) return [line];
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += MAX_LINE_CHARS) {
    parts.push((i === 0 ? "" : "    ") + line.slice(i, i + MAX_LINE_CHARS));
  }
  return parts;
}

/**
 * A text PDF: title, then one "field: value" line per report value
 */
export function toPdf(title: string, data: unknown): Buffer {
  const rows = toRows(data);
  const lines: string[] = [title, `Generated ${new Date().toISOString()}`, ""];
  rows.forEach((row, i) => {
    if (rows.length > 1 && "field" in row && "value" in row && Object.keys(row).length === 2) {
      lines.push(`${row.field}: ${cellText(row.value)}`);
    } else {
      if (i > 0) lines.push("");
      for (const [key, value] of Object.entries(row)) lines.push(`${key}: ${cellText(value)}`);
    }
  });
  if (rows.length === 0) lines.push("No data for this period.");

  const wrapped = lines.flatMap(wrap);
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += LINES_PER_PAGE) {
    pages.push(wrapped.slice(i, i + LINES_PER_PAGE));
  }

  // Objects: 1 catalog, 2 pages, 3 font, then (page, content) per page
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 4 + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((pageLines, i) => {
    const stream = [
      "BT",
      `/F1 ${FONT_SIZE} Tf`,
      `${LINE_HEIGHT} TL`,
      `${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`,
      ...pageLines.map((line) => `(${pdfText(line)}) Tj T*`),
      "ET",
    ].join("\n");
    objects[pageIds[i]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`;
    objects[pageIds[i] + 1] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ============================================================================
// XLSX
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A deflate-compressed zip archive
 */
export function zip(files: { name: string; content: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = deflateRawSync(file.content);
    const crc = crc32(file.content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // time/date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, ...centrals, end]);
}

/** Escape text for XML content and attributes */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Characters XML 1.0 does not allow
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/**
 * A single-sheet workbook with a header row
 */
export function toXlsx(sheetName: string, data: unknown): Buffer {
  const rows = toRows(data);
  const headers = headersOf(rows);
  const table = [headers, ...rows.map((row) => headers.map((h) => row[h]))];

  const cell = (value: unknown, ref: string) =>
    typeof value === "number" && Number.isFinite(value)
      ? `<c r="${ref}"><v>${value}</v></c>`
      : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cellText(value))}</t></is></c>`;
  const sheetRows = table
    .map((values, r) =>
      `<row r="${r + 1}">${values.map((v, c) => cell(v, `${columnName(c)}${r + 1}`)).join("")}</row>`
    )
    .join("");

  const safeSheetName = xmlEscape(sheetName.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report");
  const xml = (body: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`);

  return zip([
    {
      name: "[Content_Types].xml",
      content: xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          "</Types>"
      ),
    },
    {
      name: "_rels/.rels",
      content: xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          "</Relationships>"
      ),
    },
    {
      name: "xl/workbook.xml",
      content: xml(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${safeSheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          "</Relationships>"
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: xml(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
          `<sheetData>${sheetRows}</sheetData></worksheet>`
      ),
    },
  ]);
}
