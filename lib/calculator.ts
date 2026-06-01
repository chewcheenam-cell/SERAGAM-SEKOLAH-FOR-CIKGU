export type PricingSettings = {
  kainPasangPerMeter: number;
  kemeja: number;
  kurungPahang: number;
  kurungModen: number;
  addonPocket: number;
  addonExtraSize: number;
  deliveryCharge: number;
  discountAmount: number;
};

export type RawUploadRow = {
  Nama?: string;
  Jawatan?: string;
  "Jenis Pakaian"?: string;
  Saiz?: string;
  "Poket (Yes/No)"?: string;
  "Extra Size (Yes/No)"?: string;
  Kuantiti?: string | number;
};

export type CalculatedRow = {
  id: string;
  nama: string;
  jawatan: string;
  jenisPakaian: string;
  saiz: string;
  poket: boolean;
  extraSize: boolean;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  paid: boolean;
  deliveryFee: number;
};

export type ProjectSummary = {
  totalPax: number;
  totalQuantity: number;
  itemSubtotal: number;
  deliveryTotal: number;
  deliveryPerPax: number;
  grandTotal: number;
  averageCostPerPax: number;
  paidCount: number;
  pendingCount: number;
  paidTotal: number;
  pendingTotal: number;
};

export type ProjectRecord = {
  id: string;
  schoolName: string;
  quotationNo: string;
  projectNo: string;
  schoolLogo?: string;
  companyLogo?: string;
  sourceFileName?: string;
  pricing: PricingSettings;
  rows: CalculatedRow[];
  summary: ProjectSummary;
  createdAt: string;
};

export const DEFAULT_PRICING: PricingSettings = {
  kainPasangPerMeter: 35,
  kemeja: 65,
  kurungPahang: 95,
  kurungModen: 110,
  addonPocket: 3,
  addonExtraSize: 5,
  deliveryCharge: 0,
  discountAmount: 0
};

export function createReference() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return {
    id: crypto.randomUUID(),
    quotationNo: `BQ-${stamp}-${suffix}`,
    projectNo: `BP-${stamp}-${suffix}`,
  };
}

export function createEmptyProjectMeta() {
  const refs = createReference();
  return {
    ...refs,
    schoolName: "",
    schoolLogo: "",
    companyLogo: "",
    createdAt: new Date().toISOString()
  };
}

export function normalizeUploadRows(rows: Record<string, unknown>[]) {
  const flexible = normalizeTeacherPaymentRows(rows);
  return {
    rows: flexible.rows.map((row) => ({
      Nama: row.nama,
      Jawatan: row.jawatan,
      "Jenis Pakaian": row.jenisPakaian,
      Saiz: row.saiz,
      "Poket (Yes/No)": "No",
      "Extra Size (Yes/No)": "No",
      Kuantiti: row.quantity
    })),
    errors: flexible.errors
  };
}

export function normalizeTeacherPaymentRows(rows: Record<string, unknown>[]) {
  const errors: string[] = [];
  const normalized = rows.map((row, index): CalculatedRow => {
    const nama = readLoose(row, ["Nama", "Name", "Cikgu", "Teacher", "Guru"]) || firstTextValue(row);
    const jawatan = readLoose(row, ["Jawatan", "Position", "Role"]);
    const jenisPakaian = readLoose(row, ["Jenis Pakaian", "Item", "Baju", "Pakaian", "Uniform"]) || "Seragam";
    const saiz = readLoose(row, ["Saiz", "Size"]);
    const quantity = readNumber(row, ["Kuantiti", "Quantity", "Qty", "PCS", "Pcs"]) || 1;
    const amount = readNumber(row, ["Bayaran", "Amount", "Harga", "Total", "Jumlah", "Perlu Bayar"]) || 0;
    const paid = parsePaidStatus(readLoose(row, ["Status", "Paid", "Bayar", "Payment Status"]));

    if (!nama) {
      errors.push(`Row ${index + 2}: missing Nama.`);
    }

    return {
      id: crypto.randomUUID(),
      nama,
      jawatan,
      jenisPakaian,
      saiz,
      poket: false,
      extraSize: false,
      quantity,
      unitPrice: amount,
      totalPrice: amount * quantity,
      paid,
      deliveryFee: 0
    };
  });

  if (!rows.length) {
    errors.push("The uploaded file has no rows.");
  }

  return { rows: normalized.filter((row) => row.nama), errors };
}

export function createBlankPaymentRow(): CalculatedRow {
  return {
    id: crypto.randomUUID(),
    nama: "",
    jawatan: "",
    jenisPakaian: "Seragam",
    saiz: "",
    poket: false,
    extraSize: false,
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    paid: false,
    deliveryFee: 0
  };
}

export function normalizeCalculatedRow(row: Partial<CalculatedRow> | Record<string, unknown>, index = 0): CalculatedRow {
  const data = row as Record<string, unknown>;
  const nama = String(data.nama ?? data.Nama ?? "").trim();
  const jawatan = String(data.jawatan ?? data.Jawatan ?? "").trim();
  const jenisPakaian = String(data.jenisPakaian ?? data["Jenis Pakaian"] ?? data.Item ?? "Seragam").trim() || "Seragam";
  const saiz = String(data.saiz ?? data.Saiz ?? "").trim();
  const quantity = safePositiveNumber(data.quantity ?? data.Kuantiti, 1);
  const unitPrice = safeNumber(data.unitPrice ?? data["Amount to Pay"] ?? data.Bayaran ?? data.Harga ?? data.Jumlah ?? data.Total, 0);

  return {
    id: String(data.id ?? `${index}-${nama || crypto.randomUUID()}`),
    nama,
    jawatan,
    jenisPakaian,
    saiz,
    poket: Boolean(data.poket),
    extraSize: Boolean(data.extraSize),
    quantity,
    unitPrice,
    totalPrice: safeNumber(data.totalPrice, unitPrice * quantity),
    paid: Boolean(data.paid) || parsePaidStatus(data.Status ?? data.status),
    deliveryFee: safeNumber(data.deliveryFee, 0)
  };
}

export function calculatePaymentSummary(rows: CalculatedRow[], deliveryTotal = 0): ProjectSummary {
  const cleanRows = rows.map((row, index) => normalizeCalculatedRow(row, index)).filter((row) => row.nama.trim());
  const totalPax = cleanRows.length;
  const totalQuantity = cleanRows.reduce((sum, row) => sum + row.quantity, 0);
  const itemSubtotal = cleanRows.reduce((sum, row) => sum + row.totalPrice, 0);
  const deliveryPerPax = totalPax ? deliveryTotal / totalPax : 0;
  const grandTotal = itemSubtotal + deliveryTotal;
  const paidRows = cleanRows.filter((row) => row.paid);
  const paidTotal = paidRows.reduce((sum, row) => sum + row.totalPrice + deliveryPerPax, 0);
  const paidCount = paidRows.length;
  return {
    totalPax,
    totalQuantity,
    itemSubtotal,
    deliveryTotal,
    deliveryPerPax,
    grandTotal,
    averageCostPerPax: totalPax ? grandTotal / totalPax : 0,
    paidCount,
    pendingCount: totalPax - paidCount,
    paidTotal,
    pendingTotal: grandTotal - paidTotal
  };
}

export function calculateRows(rows: RawUploadRow[], pricing: PricingSettings) {
  const errors: string[] = [];
  const calculated: CalculatedRow[] = [];

  rows.forEach((row, index) => {
    const jenisPakaian = String(row["Jenis Pakaian"] ?? "").trim();
    const base = resolveBasePrice(jenisPakaian, pricing);
    const quantity = Number(row.Kuantiti);

    if (base === null) {
      errors.push(`Row ${index + 2}: unknown Jenis Pakaian "${jenisPakaian}".`);
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Row ${index + 2}: Kuantiti must be greater than 0.`);
      return;
    }

    const poket = parseYesNo(row["Poket (Yes/No)"]);
    const extraSize = parseYesNo(row["Extra Size (Yes/No)"]);
    const unitPrice = base + (poket ? pricing.addonPocket : 0) + (extraSize ? pricing.addonExtraSize : 0);

    calculated.push({
      id: `${index}-${String(row.Nama ?? "")}`,
      nama: String(row.Nama ?? "").trim(),
      jawatan: String(row.Jawatan ?? "").trim(),
      jenisPakaian,
      saiz: String(row.Saiz ?? "").trim(),
      poket,
      extraSize,
      quantity,
      unitPrice,
      totalPrice: unitPrice * quantity,
      paid: false,
      deliveryFee: 0
    });
  });

  const subtotal = calculated.reduce((sum, row) => sum + row.totalPrice, 0);
  const totalPax = new Set(calculated.map((row) => row.nama.toLowerCase()).filter(Boolean)).size;
  const totalQuantity = calculated.reduce((sum, row) => sum + row.quantity, 0);
  const grandTotal = Math.max(0, subtotal + pricing.deliveryCharge - pricing.discountAmount);

  return {
    rows: calculated,
    errors,
    summary: {
      totalPax,
      totalQuantity,
      itemSubtotal: subtotal,
      deliveryTotal: pricing.deliveryCharge,
      deliveryPerPax: totalPax ? pricing.deliveryCharge / totalPax : 0,
      grandTotal,
      averageCostPerPax: totalPax ? grandTotal / totalPax : 0,
      paidCount: 0,
      pendingCount: totalPax,
      paidTotal: 0,
      pendingTotal: grandTotal
    }
  };
}

function resolveBasePrice(value: string, pricing: PricingSettings) {
  const normalized = value.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.includes("kain")) return pricing.kainPasangPerMeter;
  if (normalized.includes("kemeja")) return pricing.kemeja;
  if (normalized.includes("pahang")) return pricing.kurungPahang;
  if (normalized.includes("moden") || normalized.includes("modern")) return pricing.kurungModen;
  return null;
}

function parseYesNo(value: unknown) {
  return ["yes", "y", "true", "1", "ya"].includes(String(value ?? "").trim().toLowerCase());
}

function parsePaidStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["paid", "yes", "y", "true", "1", "sudah", "dah", "settled", "done", "bayar", "paid already"].includes(normalized);
}

function readLoose(row: Record<string, unknown>, names: string[]) {
  const keys = Object.keys(row);
  const match = keys.find((key) => names.some((name) => key.trim().toLowerCase() === name.toLowerCase()));
  return match ? String(row[match] ?? "").trim() : "";
}

function readNumber(row: Record<string, unknown>, names: string[]) {
  const raw = readLoose(row, names).replace(/[^\d.-]/g, "");
  return safeNumber(raw, 0);
}

function firstTextValue(row: Record<string, unknown>) {
  const value = Object.values(row).find((item) => String(item ?? "").trim());
  return value ? String(value).trim() : "";
}

function safeNumber(value: unknown, fallback: number) {
  const raw = typeof value === "string" ? value.replace(/[^\d.-]/g, "") : value;
  const number = Number(raw);
  return Number.isFinite(number) ? number : fallback;
}

function safePositiveNumber(value: unknown, fallback: number) {
  const number = safeNumber(value, fallback);
  return number > 0 ? number : fallback;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("ms-MY", {
    style: "currency",
    currency: "MYR"
  }).format(value);
}
