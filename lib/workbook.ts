import type { PricingSettings, ProjectRecord, ProjectSummary } from "@/lib/calculator";

export async function parseOrderFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return parseDocxFile(file);
  if (name.endsWith(".doc")) {
    throw new Error("Old .doc files are not supported yet. Please ask customer to send .docx, Excel, CSV, or paste the text into WhatsApp list.");
  }
  if (name.endsWith(".txt")) {
    return parseTextOrderRows(await file.text());
  }
  return parseWorkbook(file);
}

export async function parseWorkbook(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" }) as unknown[][];
  const rows = matrix
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some(Boolean));

  if (!rows.length) return [];

  const headerIndex = rows.findIndex((row) => row.some((cell) => isKnownHeader(cell)));
  if (headerIndex >= 0) {
    const headers = rows[headerIndex].map((header, index) => header || `Column ${index + 1}`);
    return rows.slice(headerIndex + 1).map((row) => rowToObject(headers, row));
  }

  const width = Math.max(...rows.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, index) => index === 0 ? "Nama" : `Column ${index + 1}`);
  return rows.map((row) => rowToObject(headers, row));
}

async function parseDocxFile(file: File) {
  const buffer = await file.arrayBuffer();
  const xml = await readZipTextFile(buffer, "word/document.xml");
  const tableRows = parseDocxTableOrderRows(xml);
  if (tableRows.length) return tableRows;
  const text = docxXmlToText(xml);
  return parseTextOrderRows(text);
}

function parseDocxTableOrderRows(xml: string) {
  const tables = xml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) ?? [];
  const rows: Record<string, unknown>[] = [];

  tables.forEach((tableXml) => {
    const tableText = xmlFragmentToText(tableXml).toLowerCase();
    if (!tableText.includes("nama guru")) return;

    const tableType = tableText.includes("(l)") || tableText.includes("lelaki") ? "Kemeja" : "Kurung Moden";
    const tableRows = tableXml.match(/<w:tr[\s\S]*?<\/w:tr>/g) ?? [];
    const headerCells = tableRows.length ? extractDocxCells(tableRows[0] ?? "") : [];
    const nameIndex = headerCells.findIndex((cell) => cell.toLowerCase().includes("nama"));
    const sizeIndex = headerCells.findIndex((cell) => cell.toLowerCase().includes("size") || cell.toLowerCase().includes("saiz"));
    const kainIndex = headerCells.findIndex((cell) => cell.toLowerCase().includes("kain") || cell.toLowerCase().includes("meter"));

    tableRows.slice(1).forEach((rowXml) => {
      const cells = extractDocxCells(rowXml);
      const nama = cleanDocxCell(cells[nameIndex] ?? "");
      if (!nama) return;

      const size = normalizeDocxSize(cells[sizeIndex] ?? "");
      const kainMeter = parseKainMeter(cells[kainIndex] ?? "");
      if (size) {
        rows.push({
          Nama: nama,
          Item: tableType,
          Saiz: size,
          Poket: "No",
          "Extra Size": ["3XL", "4XL", "5XL"].includes(size) ? "Yes" : "No",
          Kuantiti: 1
        });
      }
      if (kainMeter > 0) {
        rows.push({
          Nama: nama,
          Item: "Kain Pasang",
          Saiz: "",
          Poket: "No",
          "Extra Size": "No",
          Kuantiti: kainMeter
        });
      }
    });
  });

  return rows;
}

function extractDocxCells(rowXml: string) {
  return (rowXml.match(/<w:tc[\s\S]*?<\/w:tc>/g) ?? []).map(xmlFragmentToText);
}

function xmlFragmentToText(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDocxCell(value: string) {
  const cleaned = value.trim();
  if (!cleaned || cleaned === "-") return "";
  return cleaned;
}

function normalizeDocxSize(value: string) {
  const cleaned = value.trim().toUpperCase();
  if (!cleaned || cleaned === "-") return "";
  const match = cleaned.match(/\b(CUSTOM SIZE|XS|S|M|L|XL|2XL|3XL|4XL|5XL)\b/);
  if (!match) return "";
  return match[1] === "CUSTOM SIZE" ? "Custom Size" : match[1];
}

function parseKainMeter(value: string) {
  const cleaned = value.trim().toUpperCase();
  if (!cleaned || cleaned === "-") return 0;
  const match = cleaned.match(/(\d+(?:[.,]\d+)?)\s*M?/);
  return match ? Number(match[1].replace(",", ".")) : 0;
}

function parseTextOrderRows(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const groupedRows = parseGroupedTextRows(lines);
  if (groupedRows.length) return groupedRows;
  return lines.map((line) => textLineToOrderRow(line));
}

function parseGroupedTextRows(lines: string[]) {
  const rows: Record<string, unknown>[] = [];
  let currentItem = "";
  let cikguNumber = 1;

  lines.forEach((line) => {
    const lower = line.toLowerCase();
    const headingItem = detectGroupedTextItem(lower);
    if (headingItem) {
      currentItem = headingItem;
      return;
    }
    if (!currentItem || lower.includes("jumlah")) return;

    const match = line.toUpperCase().match(/\b(CUSTOM SIZE|XS|S|M|L|XL|2XL|3XL|4XL|5XL)\b\s*[-:=]?\s*(\d+)/);
    if (!match) return;

    const size = match[1] === "CUSTOM SIZE" ? "Custom Size" : match[1];
    const count = Math.max(0, Number(match[2]));
    for (let index = 0; index < count; index += 1) {
      rows.push({
        Nama: `Cikgu ${cikguNumber}`,
        Item: currentItem,
        Saiz: size,
        Poket: "No",
        "Extra Size": ["3XL", "4XL", "5XL"].includes(size) ? "Yes" : "No",
        Kuantiti: 1
      });
      cikguNumber += 1;
    }
  });

  return rows;
}

function detectGroupedTextItem(lower: string) {
  if (!lower.includes("baju") && !lower.includes("kain")) return "";
  if (lower.includes("kemeja")) return "Kemeja";
  if (lower.includes("pahang")) return "Kurung Pahang";
  if (lower.includes("kurung")) return "Kurung Moden";
  if (lower.includes("kain")) return "Kain Pasang";
  return "";
}

function textLineToOrderRow(line: string) {
  const cleaned = line.replace(/^[\d\s.)-]+/, "").replace(/\s+/g, " ").trim();
  const lower = cleaned.toLowerCase();
  const item = detectTextItem(lower);
  const size = detectTextSize(cleaned);
  const poket = /\b(poket|pocket)\b/.test(lower) && !/\b(no poket|no pocket|tanpa poket|tak poket)\b/.test(lower);
  const extra = /\b(extra size|saiz besar|3xl|4xl|5xl)\b/.test(lower);
  const quantity = detectTextQuantity(lower);
  const nama = extractTextName(cleaned, item, size) || cleaned;
  return {
    Nama: nama,
    Item: item,
    Saiz: size,
    Poket: poket ? "Yes" : "No",
    "Extra Size": extra ? "Yes" : "No",
    Kuantiti: quantity
  };
}

function detectTextItem(lower: string) {
  if (lower.includes("kain")) return "Kain Pasang";
  if (lower.includes("pahang")) return "Kurung Pahang";
  if (lower.includes("kurung")) return "Kurung Moden";
  if (lower.includes("kemeja") || lower.includes("shirt")) return "Kemeja";
  return "";
}

function detectTextSize(text: string) {
  const match = text.toUpperCase().match(/\b(CUSTOM SIZE|XS|S|M|L|XL|2XL|3XL|4XL|5XL)\b/);
  if (!match) return "";
  return match[1] === "CUSTOM SIZE" ? "Custom Size" : match[1];
}

function detectTextQuantity(lower: string) {
  const match = lower.match(/\b(\d+)\s*(x|pcs|pc|helai)\b/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function extractTextName(line: string, item: string, size: string) {
  const wordsToRemove = [item, item.replace("Moden", "Modern"), size, "poket", "pocket", "extra size", "saiz besar"].filter(Boolean);
  return wordsToRemove
    .reduce((value, word) => value.replace(new RegExp(escapeRegExp(word), "ig"), " "), line)
    .replace(/\b\d+\s*(x|pcs|pc|helai)\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function docxXmlToText(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function readZipTextFile(buffer: ArrayBuffer, filename: string) {
  const bytes = new Uint8Array(buffer);
  const entry = findZipEntry(bytes, filename);
  if (!entry) throw new Error(`Cannot find ${filename} in Word file.`);
  const compressed = readZipEntryBytes(bytes, entry);
  const data = entry.compression === 0 ? compressed : await inflateRaw(compressed);
  return new TextDecoder("utf-8").decode(data);
}

type ZipEntry = {
  compression: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findZipEntry(bytes: Uint8Array, filename: string): ZipEntry | null {
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  let offset = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (offset < end && view.getUint32(offset, true) === 0x02014b50) {
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder("utf-8").decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === filename) return { compression, compressedSize, localHeaderOffset };
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) {
      return offset;
    }
  }
  return -1;
}

function readZipEntryBytes(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error("Invalid Word file.");
  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const dataOffset = offset + 30 + nameLength + extraLength;
  return bytes.slice(dataOffset, dataOffset + entry.compressedSize);
}

async function inflateRaw(compressed: Uint8Array) {
  const bytes = compressed.slice().buffer as ArrayBuffer;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function rowToObject(headers: string[], row: string[]) {
  return headers.reduce<Record<string, unknown>>((object, header, index) => {
    object[header] = row[index] ?? "";
    return object;
  }, {});
}

function isKnownHeader(value: string) {
  return [
    "nama",
    "name",
    "cikgu",
    "teacher",
    "guru",
    "jawatan",
    "item",
    "jenis pakaian",
    "saiz",
    "size",
    "kuantiti",
    "quantity",
    "qty",
    "poket",
    "pocket",
    "extra size",
    "bayaran",
    "amount",
    "harga",
    "jumlah",
    "total"
  ].includes(value.trim().toLowerCase());
}

export async function exportQuotationWorkbook(project: {
  meta: { schoolName: string; quotationNo: string; projectNo: string; invoiceNo?: string; designCode?: string };
  pricing: PricingSettings;
  rows: ProjectRecord["rows"];
  summary: ProjectSummary;
}) {
  const XLSX = await import("xlsx");
  const header = [
    ["Batikara Seragam Payment Summary"],
    ["School", project.meta.schoolName],
    ["Quotation No.", project.meta.quotationNo],
    ["Project No.", project.meta.projectNo],
    ["Invoice No.", project.meta.invoiceNo ?? ""],
    ["Design Batik Code", project.meta.designCode ?? ""],
    []
  ];
  const rows = project.rows.map((row) => ({
    Nama: row.nama,
    Jawatan: row.jawatan,
    Item: row.jenisPakaian,
    Saiz: formatSizeRemark(row.saiz),
    Poket: row.poket ? "Yes (+RM3)" : "No",
    Qty: row.quantity,
    "Amount to Pay": row.unitPrice,
    Status: row.paid ? "Paid" : "Not Yet",
    Total: row.totalPrice
  }));
  const summary = [
    [],
    ["Total Cikgu", project.summary.totalPax],
    ["Total Pieces", project.summary.totalQuantity],
    ["Item Subtotal", project.summary.itemSubtotal ?? project.summary.grandTotal],
    ["Delivery", project.summary.deliveryTotal ?? 0],
    ["Delivery Per Person", project.summary.deliveryPerPax ?? 0],
    ["Final Total", project.summary.grandTotal],
    ["Paid", `${project.summary.paidCount ?? 0} / ${project.summary.paidTotal ?? 0}`],
    ["Not Yet", `${project.summary.pendingCount ?? project.summary.totalPax} / ${project.summary.pendingTotal ?? project.summary.grandTotal}`],
    ["Average Per Cikgu", project.summary.averageCostPerPax],
    [],
    ["Guru Belum Bayar", project.rows.filter((row) => row.nama.trim() && !row.paid).map((row) => row.nama).join(", ") || "Semua guru sudah bayar"]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(header);
  XLSX.utils.sheet_add_json(sheet, rows, { origin: "A8" });
  XLSX.utils.sheet_add_aoa(sheet, summary, { origin: `A${rows.length + 10}` });
  sheet["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Quotation");
  XLSX.writeFile(workbook, `${project.meta.quotationNo}.xlsx`);
}

function formatSizeRemark(size: string) {
  const normalized = size.trim().toLowerCase();
  if (normalized === "custom size") return "Custom Size (+RM10)";
  if (["3xl", "4xl", "5xl"].includes(normalized)) return `${size} (+RM5)`;
  return size;
}
