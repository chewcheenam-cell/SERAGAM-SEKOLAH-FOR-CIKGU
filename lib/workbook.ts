import type { PricingSettings, ProjectRecord, ProjectSummary } from "@/lib/calculator";

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
