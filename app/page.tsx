"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, Copy, Download, ExternalLink, FileDown, FileSpreadsheet, History, LogIn, Plus, Printer, Save, Search, Settings, Shield, Trash2, Upload, XCircle } from "lucide-react";
import { calculatePaymentSummary, createBlankPaymentRow, createEmptyProjectMeta, createReference, DEFAULT_PRICING, formatCurrency, normalizeCalculatedRow, normalizeTeacherPaymentRows, type CalculatedRow, type PricingSettings, type ProjectRecord } from "@/lib/calculator";
import { exportQuotationPdf } from "@/lib/pdf";
import { exportQuotationWorkbook, parseWorkbook } from "@/lib/workbook";
import { createRepository, type SharePayloadRecord } from "@/lib/repository";
import { sendProjectToGoogleSheets } from "@/lib/googleSheets";

const repo = createRepository();

type BulkOrderConfig = {
  kemejaQty: number;
  kemejaPocketQty: number;
  kemejaExtraQty: number;
  kurungQty: number;
  kurungPocketQty: number;
  kurungExtraQty: number;
  deliveryFee: number;
};

const ITEM_OPTIONS = ["Kemeja", "Kurung Moden", "Kurung Pahang", "Kain Pasang"];
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "Custom Size"];
const EXTRA_SIZE_OPTIONS = new Set(["3XL", "4XL", "5XL"]);
const CUSTOM_SIZE_ADDON = 10;

export default function Home() {
  const [isAuthed, setIsAuthed] = useState(false);
  const [loginEmail, setLoginEmail] = useState(process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "admin@batikara.local");
  const [loginPassword, setLoginPassword] = useState("");
  const [pricing, setPricing] = useState<PricingSettings>(DEFAULT_PRICING);
  const [meta, setMeta] = useState(createEmptyProjectMeta());
  const [paymentRows, setPaymentRows] = useState<CalculatedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"payment" | "pricing" | "history">("payment");
  const [sourceFileName, setSourceFileName] = useState("");
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const [notice, setNotice] = useState("");
  const [shareLink, setShareLink] = useState("");

  const normalizedPaymentRows = useMemo(() => paymentRows.map((row, index) => normalizeCalculatedRow(row, index)), [paymentRows]);
  const validRows = normalizedPaymentRows.filter((row) => row.nama.trim());
  const summary = useMemo(() => calculatePaymentSummary(normalizedPaymentRows, deliveryTotal), [normalizedPaymentRows, deliveryTotal]);
  const allErrors = errors;

  useEffect(() => {
    void repo.getPricing().then(setPricing);
    void repo.listProjects().then(setProjects);
    void repo.getSession().then((session) => setIsAuthed(Boolean(session)));
  }, []);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await repo.signIn(loginEmail, loginPassword);
    setIsAuthed(result.ok);
    setNotice(result.message);
  }

  async function handlePricingSave() {
    await repo.savePricing(pricing);
    setNotice("Pricing settings saved.");
  }

  async function handleFile(file: File) {
    setSourceFileName(file.name);
    setNotice("");
    const parsed = await parseWorkbook(file);
    const normalized = normalizeTeacherPaymentRows(parsed);
    setPaymentRows(normalized.rows);
    setErrors(normalized.errors);
  }

  async function handleLogo(file: File, type: "schoolLogo" | "companyLogo") {
    const reader = new FileReader();
    reader.onload = () => setMeta((current) => ({ ...current, [type]: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  async function saveProject() {
    if (!validRows.length || allErrors.length) {
      setNotice("Fix upload errors before saving this project.");
      return;
    }

    try {
      const record = await repo.saveProject({
        id: meta.id,
        schoolName: meta.schoolName || "Unnamed School",
        quotationNo: meta.quotationNo,
        projectNo: meta.projectNo,
        invoiceNo: meta.invoiceNo,
        designCode: meta.designCode,
        schoolLogo: meta.schoolLogo,
        companyLogo: meta.companyLogo,
        sourceFileName,
        pricing,
        rows: validRows,
        summary,
        createdAt: meta.createdAt
      });

      await sendProjectToGoogleSheets(record);
      setProjects(await repo.listProjects());
      setMeta((current) => ({ ...current, id: record.id }));
      setNotice("Project saved. Open the History tab to see it.");
    } catch (error) {
      setNotice(error instanceof Error ? `Could not save project: ${error.message}` : "Could not save project.");
    }
  }

  async function openShareView() {
    if (!validRows.length) {
      setNotice("Generate or add rows first before creating the share view.");
      return;
    }

    const payload: SharePayloadRecord = {
      schoolName: meta.schoolName || "School Name",
      quotationNo: meta.quotationNo,
      projectNo: meta.projectNo,
      invoiceNo: meta.invoiceNo,
      designCode: meta.designCode,
      shareToken: meta.projectNo,
      pricing,
      rows: validRows.map((row) => ({
        id: row.id,
        nama: row.nama,
        jenisPakaian: row.jenisPakaian,
        saiz: row.saiz,
        poket: row.poket,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        totalPrice: row.totalPrice,
        paid: row.paid
      })),
      deliveryTotal
    };
    const compactPayload: SharePayloadRecord = {
      ...payload,
      rows: payload.rows.map((row, index) => ({
        ...row,
        id: String(index + 1)
      }))
    };
    const compactEncoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(compactPayload)))));
    let savedOnline = true;
    try {
      await repo.saveProject({
      id: meta.id,
      schoolName: meta.schoolName || "School Name",
      quotationNo: meta.quotationNo,
      projectNo: meta.projectNo,
      invoiceNo: meta.invoiceNo,
      designCode: meta.designCode,
      schoolLogo: meta.schoolLogo,
      companyLogo: meta.companyLogo,
      sourceFileName,
      pricing,
      rows: validRows,
      summary,
      createdAt: meta.createdAt
      });
      setProjects(await repo.listProjects());
    } catch {
      savedOnline = false;
    }

    const token = encodeURIComponent(meta.projectNo);
    try {
      localStorage.setItem(`batikara.share.payload.${meta.projectNo}`, JSON.stringify(payload));
      localStorage.setItem(`batikara.share.payload.${meta.quotationNo}`, JSON.stringify(payload));
    } catch {
      savedOnline = false;
    }
    const shareSaved = await repo.saveSharePayload(meta.projectNo, compactPayload);
    savedOnline = savedOnline && shareSaved;
    const customerUrl = `${window.location.origin}/share?token=${token}`;
    const backupUrl = `${window.location.origin}/share?data=${compactEncoded}`;
    const previewUrl = shareSaved ? customerUrl : backupUrl;
    const copiedUrl = savedOnline ? customerUrl : backupUrl;
    try {
      await navigator.clipboard?.writeText(copiedUrl);
    } catch {
      // The link is also shown on screen when the browser blocks clipboard access.
    }
    setShareLink(copiedUrl);
    setNotice(savedOnline ? "Customer link ready. Copy and send it to customer." : "Backup customer link ready. Run Supabase SQL once to enable short links.");
  }

  function duplicateProject(project: ProjectRecord) {
    const refs = createReference();
    setMeta({
      id: refs.id,
      schoolName: project.schoolName,
      quotationNo: refs.quotationNo,
      projectNo: refs.projectNo,
      invoiceNo: project.invoiceNo ?? "",
      designCode: project.designCode ?? "",
      schoolLogo: project.schoolLogo ?? "",
      companyLogo: project.companyLogo ?? "",
      createdAt: new Date().toISOString()
    });
    setPricing(project.pricing);
    setDeliveryTotal(project.summary.deliveryTotal ?? 0);
    setPaymentRows(project.rows.map((row, index) => normalizeCalculatedRow(row, index)));
    setActiveTab("payment");
    setNotice("Project duplicated with a fresh quotation number.");
  }

  function loadProject(project: ProjectRecord) {
    setMeta({
      id: project.id,
      schoolName: project.schoolName,
      quotationNo: project.quotationNo,
      projectNo: project.projectNo,
      invoiceNo: project.invoiceNo ?? "",
      designCode: project.designCode ?? "",
      schoolLogo: project.schoolLogo ?? "",
      companyLogo: project.companyLogo ?? "",
      createdAt: project.createdAt
    });
    setPricing(project.pricing);
    setDeliveryTotal(project.summary.deliveryTotal ?? 0);
    setPaymentRows(project.rows.map((row, index) => normalizeCalculatedRow(row, index)));
    setActiveTab("payment");
  }

  async function deleteProject(project: ProjectRecord) {
    const ok = window.confirm(`Delete ${project.schoolName || project.projectNo} from history?`);
    if (!ok) return;
    await repo.deleteProject(project.id);
    setProjects(await repo.listProjects());
    setNotice("Project deleted from History.");
  }

  function updatePaymentRow(id: string, patch: Partial<CalculatedRow>) {
    setPaymentRows((rows) => rows.map((row) => {
      if (row.id !== id) return row;
      const next = normalizeCalculatedRow({ ...row, ...patch });
      const shouldAutoPrice = "jenisPakaian" in patch || "saiz" in patch || "poket" in patch || "quantity" in patch;
      if (shouldAutoPrice) {
        next.extraSize = isExtraSize(next.saiz);
        next.unitPrice = getItemPrice(next.jenisPakaian, pricing) + getSizeAddon(next.saiz, pricing) + (next.poket ? pricing.addonPocket : 0);
      }
      next.totalPrice = next.unitPrice * next.quantity;
      return next;
    }));
  }

  function removePaymentRow(id: string) {
    setPaymentRows((rows) => rows.filter((row) => row.id !== id));
  }

  function generateBulkOrder(config: BulkOrderConfig) {
    const rows: CalculatedRow[] = [];
    let cikguNumber = 1;

    for (let index = 0; index < config.kemejaQty; index += 1) {
      const hasPocket = index < config.kemejaPocketQty;
      const hasExtraSize = index < config.kemejaExtraQty;
      const unitPrice = pricing.kemeja + (hasPocket ? pricing.addonPocket : 0) + (hasExtraSize ? pricing.addonExtraSize : 0);
      rows.push({
        id: crypto.randomUUID(),
        nama: `Cikgu ${cikguNumber}`,
        jawatan: "",
        jenisPakaian: "Kemeja",
        saiz: hasExtraSize ? "3XL" : "",
        poket: hasPocket,
        extraSize: hasExtraSize,
        quantity: 1,
        unitPrice,
        totalPrice: unitPrice,
        paid: false,
        deliveryFee: 0
      });
      cikguNumber += 1;
    }

    for (let index = 0; index < config.kurungQty; index += 1) {
      const hasPocket = index < config.kurungPocketQty;
      const hasExtraSize = index < config.kurungExtraQty;
      const unitPrice = pricing.kurungModen + (hasPocket ? pricing.addonPocket : 0) + (hasExtraSize ? pricing.addonExtraSize : 0);
      rows.push({
        id: crypto.randomUUID(),
        nama: `Cikgu ${cikguNumber}`,
        jawatan: "",
        jenisPakaian: "Kurung Moden",
        saiz: hasExtraSize ? "3XL" : "",
        poket: hasPocket,
        extraSize: hasExtraSize,
        quantity: 1,
        unitPrice,
        totalPrice: unitPrice,
        paid: false,
        deliveryFee: 0
      });
      cikguNumber += 1;
    }

    setPaymentRows(rows);
    setDeliveryTotal(config.deliveryFee);
    setErrors([]);
    setNotice(`Generated ${rows.length} rows for Cikgu 1-${rows.length}.`);
  }

  const filteredProjects = projects.filter((project) => {
    const q = search.toLowerCase();
    return [project.schoolName, project.quotationNo, project.projectNo, project.invoiceNo ?? "", project.designCode ?? ""].some((value) => value.toLowerCase().includes(q));
  });

  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-batikara-sky px-4 py-10 text-batikara-ink">
        <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-batikara-line bg-white px-4 py-2 text-sm font-semibold text-batikara-navy">
              <Shield className="h-4 w-4" />
              Secure Admin Access
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-normal text-batikara-navy sm:text-5xl">Batikara Seragam Calculator</h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-700">
                Upload a cikgu name list or simple order summary, fill how much each person needs to pay, and export a clean payment list for the school.
              </p>
            </div>
          </div>
          <form onSubmit={handleLogin} className="rounded-lg border border-batikara-line bg-white p-6 shadow-panel">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-batikara-navy text-white">
                <LogIn className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-batikara-navy">Admin Login</h2>
                <p className="text-sm text-slate-600">Use Supabase Auth or the local demo credentials.</p>
              </div>
            </div>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Email</span>
              <input value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} className="w-full rounded-md border border-batikara-line px-3 py-3 outline-none focus:border-batikara-blue" />
            </label>
            <label className="mb-6 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Password</span>
              <input type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} className="w-full rounded-md border border-batikara-line px-3 py-3 outline-none focus:border-batikara-blue" />
            </label>
            <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-batikara-blue px-4 py-3 font-semibold text-white transition hover:bg-batikara-navy">
              <LogIn className="h-4 w-4" />
              Sign in
            </button>
            {notice ? <p className="mt-4 text-sm text-slate-600">{notice}</p> : null}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f9fd] text-batikara-ink">
      <header className="no-print border-b border-batikara-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-batikara-navy text-white">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-batikara-navy">Batikara Seragam Calculator</h1>
              <p className="text-sm text-slate-600">Simple cikgu payment summary</p>
            </div>
          </div>
          <nav className="grid grid-cols-3 gap-2 rounded-lg border border-batikara-line bg-batikara-sky p-1">
            <TabButton active={activeTab === "payment"} onClick={() => setActiveTab("payment")} icon={<Upload className="h-4 w-4" />} label="Payment" />
            <TabButton active={activeTab === "pricing"} onClick={() => setActiveTab("pricing")} icon={<Settings className="h-4 w-4" />} label="Settings" />
            <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} icon={<History className="h-4 w-4" />} label="History" />
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[320px_1fr]">
        <aside className="no-print space-y-5">
          <section className="rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
            <h2 className="mb-4 font-bold text-batikara-navy">Project Details</h2>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">School Name</span>
              <input value={meta.schoolName} onChange={(event) => setMeta({ ...meta, schoolName: event.target.value })} placeholder="SK Taman Cemerlang" className="w-full rounded-md border border-batikara-line px-3 py-2.5 outline-none focus:border-batikara-blue" />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Invoice Number</span>
              <input value={meta.invoiceNo} onChange={(event) => setMeta({ ...meta, invoiceNo: event.target.value })} placeholder="INV-001" className="w-full rounded-md border border-batikara-line px-3 py-2.5 outline-none focus:border-batikara-blue" />
            </label>
            <label className="mb-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">Design Batik Code</span>
              <input value={meta.designCode} onChange={(event) => setMeta({ ...meta, designCode: event.target.value })} placeholder="BTK-2026-A" className="w-full rounded-md border border-batikara-line px-3 py-2.5 outline-none focus:border-batikara-blue" />
            </label>
            <div className="grid gap-3 text-sm">
              <InfoLine label="Quotation No." value={meta.quotationNo} />
              <InfoLine label="Project No." value={meta.projectNo} />
            </div>
          </section>

          <section className="rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
            <h2 className="mb-4 font-bold text-batikara-navy">Logo Support</h2>
            <LogoInput label="School Logo" src={meta.schoolLogo} onFile={(file) => handleLogo(file, "schoolLogo")} onClear={() => setMeta((current) => ({ ...current, schoolLogo: "" }))} />
            <div className="mt-4">
              <LogoInput label="Company Logo" src={meta.companyLogo} onFile={(file) => handleLogo(file, "companyLogo")} onClear={() => setMeta((current) => ({ ...current, companyLogo: "" }))} />
            </div>
          </section>
        </aside>

        <section className="space-y-5">
          {notice ? <div className="no-print rounded-md border border-batikara-line bg-white px-4 py-3 text-sm text-batikara-navy shadow-panel">{notice}</div> : null}
          {shareLink ? (
            <div className="no-print rounded-md border border-batikara-line bg-white px-4 py-3 text-sm text-batikara-navy shadow-panel">
              <p className="mb-2 font-bold">Customer link</p>
              <input readOnly value={shareLink} className="w-full rounded-md border border-batikara-line px-3 py-2 text-xs outline-none" onFocus={(event) => event.currentTarget.select()} />
            </div>
          ) : null}

          {activeTab === "payment" ? (
            <PaymentPanel
              meta={meta}
              rows={normalizedPaymentRows}
              errors={allErrors}
              summary={summary}
              deliveryTotal={deliveryTotal}
              onDeliveryChange={setDeliveryTotal}
              onFile={handleFile}
              onGenerateBulk={generateBulkOrder}
              onAddRow={() => setPaymentRows((rows) => [...rows, createBlankPaymentRow()])}
              onUpdateRow={updatePaymentRow}
              onRemoveRow={removePaymentRow}
              onSave={saveProject}
              onShare={openShareView}
              onPdf={() => exportQuotationPdf({ meta, pricing, rows: validRows, summary })}
              onExcel={() => exportQuotationWorkbook({ meta, pricing, rows: validRows, summary })}
            />
          ) : null}

          {activeTab === "pricing" ? <PricingPanel pricing={pricing} onChange={setPricing} onSave={handlePricingSave} /> : null}

          {activeTab === "history" ? (
            <HistoryPanel projects={filteredProjects} search={search} onSearch={setSearch} onLoad={loadProject} onDuplicate={duplicateProject} onDelete={deleteProject} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${active ? "bg-white text-batikara-navy shadow-sm" : "text-slate-600 hover:text-batikara-navy"}`}>
      {icon}
      {label}
    </button>
  );
}

function isExtraSize(size: string) {
  return EXTRA_SIZE_OPTIONS.has(size.trim().toUpperCase());
}

function isCustomSize(size: string) {
  return size.trim().toLowerCase() === "custom size";
}

function getSizeAddon(size: string, pricing: PricingSettings) {
  if (isCustomSize(size)) return CUSTOM_SIZE_ADDON;
  return isExtraSize(size) ? pricing.addonExtraSize : 0;
}

function getSizeLabel(size: string) {
  if (isCustomSize(size)) return `${size} +RM10`;
  if (isExtraSize(size)) return `${size} +RM5`;
  return size;
}

function getItemPrice(item: string, pricing: PricingSettings) {
  const normalized = item.toLowerCase();
  if (normalized.includes("kain")) return pricing.kainPasangPerMeter;
  if (normalized.includes("kemeja")) return pricing.kemeja;
  if (normalized.includes("pahang")) return pricing.kurungPahang;
  if (normalized.includes("moden") || normalized.includes("modern")) return pricing.kurungModen;
  return 0;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-batikara-sky px-3 py-2">
      <span className="block text-xs font-semibold uppercase text-slate-500">{label}</span>
      <span className="font-bold text-batikara-navy">{value}</span>
    </div>
  );
}

function LogoInput({ label, src, onFile, onClear }: { label: string; src?: string; onFile: (file: File) => void; onClear: () => void }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-md border border-batikara-line bg-batikara-sky text-xs text-slate-500">
          {src ? <img src={src} alt={label} className="h-full w-full object-contain" /> : "Logo"}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} className="w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-batikara-blue file:px-3 file:py-2 file:font-semibold file:text-white" />
          {src ? (
            <button type="button" onClick={onClear} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">
              <XCircle className="h-4 w-4" />
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PaymentPanel({ meta, rows, errors, summary, deliveryTotal, onDeliveryChange, onFile, onGenerateBulk, onAddRow, onUpdateRow, onRemoveRow, onSave, onShare, onPdf, onExcel }: {
  meta: ReturnType<typeof createEmptyProjectMeta>;
  rows: CalculatedRow[];
  errors: string[];
  summary: { totalPax: number; totalQuantity: number; itemSubtotal?: number; deliveryTotal?: number; deliveryPerPax?: number; grandTotal: number; averageCostPerPax: number; paidCount?: number; pendingCount?: number; paidTotal?: number; pendingTotal?: number };
  deliveryTotal: number;
  onDeliveryChange: (value: number) => void;
  onFile: (file: File) => void;
  onGenerateBulk: (config: BulkOrderConfig) => void;
  onAddRow: () => void;
  onUpdateRow: (id: string, patch: Partial<CalculatedRow>) => void;
  onRemoveRow: (id: string) => void;
  onSave: () => void;
  onShare: () => void;
  onPdf: () => void;
  onExcel: () => void;
}) {
  const [entryMode, setEntryMode] = useState<"quick" | "upload" | "manual">("quick");
  const [bulkOrder, setBulkOrder] = useState<BulkOrderConfig>({
    kemejaQty: 10,
    kemejaPocketQty: 3,
    kemejaExtraQty: 0,
    kurungQty: 10,
    kurungPocketQty: 0,
    kurungExtraQty: 3,
    deliveryFee: 100
  });
  const bulkTotal = bulkOrder.kemejaQty + bulkOrder.kurungQty;
  const deliveryPerPerson = bulkTotal ? bulkOrder.deliveryFee / bulkTotal : 0;

  return (
    <>
      <section className="no-print rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-bold text-batikara-navy">Cikgu Payment List</h2>
            <p className="text-sm text-slate-600">Choose how admin wants to prepare the customer payment list.</p>
          </div>
          <div className="grid gap-2 rounded-lg border border-batikara-line bg-batikara-sky p-1 sm:grid-cols-3">
            <ModeButton active={entryMode === "quick"} onClick={() => setEntryMode("quick")} icon={<Calculator className="h-4 w-4" />} label="Quick Bulk" />
            <ModeButton active={entryMode === "upload"} onClick={() => setEntryMode("upload")} icon={<FileSpreadsheet className="h-4 w-4" />} label="Upload List" />
            <ModeButton active={entryMode === "manual"} onClick={() => setEntryMode("manual")} icon={<Plus className="h-4 w-4" />} label="Manual" />
          </div>
        </div>
        {entryMode === "upload" ? (
          <div className="mt-4 rounded-md border border-batikara-line bg-batikara-sky p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700"><strong>Accepted:</strong> Nama only, or Nama + Jawatan + Bayaran.</p>
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-batikara-blue px-4 py-3 font-semibold text-white transition hover:bg-batikara-navy">
                <FileSpreadsheet className="h-4 w-4" />
                Upload Excel/CSV
                <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
              </label>
            </div>
          </div>
        ) : null}
        {entryMode === "manual" ? (
          <div className="mt-4 rounded-md border border-batikara-line bg-batikara-sky p-4">
            <button onClick={onAddRow} className="inline-flex items-center justify-center gap-2 rounded-md bg-batikara-blue px-4 py-3 font-semibold text-white transition hover:bg-batikara-navy">
              <Plus className="h-4 w-4" />
              Add Cikgu Row
            </button>
          </div>
        ) : null}
        {errors.length ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div className="mb-2 flex items-center gap-2 font-bold"><XCircle className="h-4 w-4" />Upload validation</div>
            <ul className="space-y-1">
              {errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        ) : null}
      </section>

      {entryMode === "quick" ? <section className="no-print rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-batikara-navy">Quick Bulk Order</h2>
            <p className="text-sm text-slate-600">Key in totals from customer, then generate Cikgu 1 onward for checking.</p>
          </div>
          <div className="rounded-md bg-batikara-sky px-3 py-2 text-sm font-bold text-batikara-navy">
            Total {bulkTotal} pcs · Delivery {formatCurrency(deliveryPerPerson)} / cikgu
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <NumberField label="Kemeja pcs" value={bulkOrder.kemejaQty} onChange={(value) => setBulkOrder((current) => ({ ...current, kemejaQty: value, kemejaPocketQty: Math.min(current.kemejaPocketQty, value), kemejaExtraQty: Math.min(current.kemejaExtraQty, value) }))} />
          <NumberField label="Kemeja need poket" value={bulkOrder.kemejaPocketQty} max={bulkOrder.kemejaQty} onChange={(value) => setBulkOrder((current) => ({ ...current, kemejaPocketQty: Math.min(value, current.kemejaQty) }))} />
          <NumberField label="Kemeja extra size" value={bulkOrder.kemejaExtraQty} max={bulkOrder.kemejaQty} onChange={(value) => setBulkOrder((current) => ({ ...current, kemejaExtraQty: Math.min(value, current.kemejaQty) }))} />
          <NumberField label="Kurung pcs" value={bulkOrder.kurungQty} onChange={(value) => setBulkOrder((current) => ({ ...current, kurungQty: value, kurungPocketQty: Math.min(current.kurungPocketQty, value), kurungExtraQty: Math.min(current.kurungExtraQty, value) }))} />
          <NumberField label="Kurung need poket" value={bulkOrder.kurungPocketQty} max={bulkOrder.kurungQty} onChange={(value) => setBulkOrder((current) => ({ ...current, kurungPocketQty: Math.min(value, current.kurungQty) }))} />
          <NumberField label="Kurung extra size" value={bulkOrder.kurungExtraQty} max={bulkOrder.kurungQty} onChange={(value) => setBulkOrder((current) => ({ ...current, kurungExtraQty: Math.min(value, current.kurungQty) }))} />
          <NumberField label="Delivery fee (RM)" value={bulkOrder.deliveryFee} onChange={(value) => setBulkOrder((current) => ({ ...current, deliveryFee: value }))} />
        </div>
        <button onClick={() => onGenerateBulk(bulkOrder)} className="mt-4 inline-flex items-center gap-2 rounded-md bg-batikara-blue px-4 py-3 font-semibold text-white transition hover:bg-batikara-navy">
          <Calculator className="h-4 w-4" />
          Generate Cikgu 1-{bulkTotal}
        </button>
      </section> : null}

      <section className="print-surface rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
        <div className="mb-5 flex flex-col gap-4 border-b border-batikara-line pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {meta.schoolLogo ? <img src={meta.schoolLogo} alt="School logo" className="h-16 w-16 object-contain" /> : null}
            <div>
              <h2 className="text-2xl font-bold text-batikara-navy">{meta.schoolName || "School Name"}</h2>
              <p className="text-sm text-slate-600">Quotation {meta.quotationNo} · Project {meta.projectNo}</p>
              <p className="text-sm text-slate-600">Invoice {meta.invoiceNo || "-"} · Design {meta.designCode || "-"}</p>
            </div>
          </div>
          {meta.companyLogo ? <img src={meta.companyLogo} alt="Company logo" className="h-16 w-24 object-contain" /> : null}
        </div>

        <Summary summary={summary} />
        <PaymentTable rows={rows} summary={summary} deliveryTotal={deliveryTotal} onDeliveryChange={onDeliveryChange} onUpdateRow={onUpdateRow} onRemoveRow={onRemoveRow} />
        <PendingRemark rows={rows} deliveryPerPerson={summary.deliveryPerPax ?? 0} />

        <div className="no-print mt-5 flex flex-wrap gap-3">
          <button onClick={onSave} className="inline-flex items-center gap-2 rounded-md bg-batikara-navy px-4 py-2.5 font-semibold text-white"><Save className="h-4 w-4" />Save</button>
          <button onClick={onShare} className="inline-flex items-center gap-2 rounded-md bg-batikara-blue px-4 py-2.5 font-semibold text-white"><ExternalLink className="h-4 w-4" />Share View</button>
          <button onClick={onExcel} className="inline-flex items-center gap-2 rounded-md border border-batikara-line bg-white px-4 py-2.5 font-semibold text-batikara-navy"><Download className="h-4 w-4" />Excel</button>
          <button onClick={onPdf} className="inline-flex items-center gap-2 rounded-md border border-batikara-line bg-white px-4 py-2.5 font-semibold text-batikara-navy"><FileDown className="h-4 w-4" />PDF</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md border border-batikara-line bg-white px-4 py-2.5 font-semibold text-batikara-navy"><Printer className="h-4 w-4" />Print</button>
        </div>
      </section>
    </>
  );
}

function PendingRemark({ rows, deliveryPerPerson }: { rows: CalculatedRow[]; deliveryPerPerson: number }) {
  const pendingRows = rows.filter((row) => row.nama.trim() && !row.paid);
  return (
    <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-bold text-amber-900">Guru Belum Bayar</h3>
      {pendingRows.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {pendingRows.map((row) => (
            <div key={row.id} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
              <span className="font-bold text-batikara-navy">{row.nama}</span>
              <span className="ml-2 text-slate-600">{formatCurrency(row.totalPrice + deliveryPerPerson)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm font-semibold text-green-700">Semua guru sudah bayar.</p>
      )}
    </section>
  );
}

function ModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-semibold transition ${active ? "bg-white text-batikara-navy shadow-sm" : "text-slate-600 hover:text-batikara-navy"}`}>
      {icon}
      {label}
    </button>
  );
}

function NumberField({ label, value, max, onChange }: { label: string; value: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="number"
        min="0"
        max={max}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="w-full rounded-md border border-batikara-line px-3 py-2.5 outline-none focus:border-batikara-blue"
      />
    </label>
  );
}

function Summary({ summary }: { summary: { totalPax: number; totalQuantity: number; itemSubtotal?: number; deliveryTotal?: number; deliveryPerPax?: number; grandTotal: number; averageCostPerPax: number; paidCount?: number; pendingCount?: number; paidTotal?: number; pendingTotal?: number } }) {
  const items = [
    ["Total Cikgu", String(summary.totalPax)],
    ["Total Pieces", String(summary.totalQuantity)],
    ["Item Subtotal", formatCurrency(summary.itemSubtotal ?? summary.grandTotal)],
    ["Delivery", `${formatCurrency(summary.deliveryTotal ?? 0)} / ${formatCurrency(summary.deliveryPerPax ?? 0)} each`],
    ["Final Total", formatCurrency(summary.grandTotal)],
    ["Paid", `${summary.paidCount ?? 0} / ${formatCurrency(summary.paidTotal ?? 0)}`],
    ["Not Yet", `${summary.pendingCount ?? summary.totalPax} / ${formatCurrency(summary.pendingTotal ?? summary.grandTotal)}`],
    ["Average Per Cikgu", formatCurrency(summary.averageCostPerPax)]
  ];
  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-batikara-line bg-batikara-sky p-4">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="mt-1 text-2xl font-bold text-batikara-navy">{value}</p>
        </div>
      ))}
    </div>
  );
}

function PaymentTable({ rows, summary, deliveryTotal, onDeliveryChange, onUpdateRow, onRemoveRow }: {
  rows: CalculatedRow[];
  summary: { totalPax: number; itemSubtotal?: number; deliveryTotal?: number; deliveryPerPax?: number; grandTotal: number };
  deliveryTotal: number;
  onDeliveryChange: (value: number) => void;
  onUpdateRow: (id: string, patch: Partial<CalculatedRow>) => void;
  onRemoveRow: (id: string) => void;
}) {
  const deliveryPerPerson = summary.totalPax ? deliveryTotal / summary.totalPax : 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-batikara-navy text-white">
            {["Nama Cikgu", "Jawatan", "Item", "Saiz", "Poket", "Qty", "Amount to Pay", "Paid?", "Item Total", "Postage Each", "Total + Postage", ""].map((heading) => (
              <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row) => {
            const totalWithPostage = row.totalPrice + deliveryPerPerson;
            return (
              <tr key={row.id} className="border-b border-batikara-line">
                <td className="px-3 py-3">
                  <input value={row.nama} onChange={(event) => onUpdateRow(row.id, { nama: event.target.value })} className="w-44 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue" />
                </td>
                <td className="px-3 py-3">
                  <input value={row.jawatan} onChange={(event) => onUpdateRow(row.id, { jawatan: event.target.value })} className="w-36 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue" />
                </td>
                <td className="px-3 py-3">
                  <select value={row.jenisPakaian} onChange={(event) => onUpdateRow(row.id, { jenisPakaian: event.target.value })} className="w-40 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue">
                    {ITEM_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <select value={row.saiz} onChange={(event) => onUpdateRow(row.id, { saiz: event.target.value })} className="w-24 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue">
                    <option value="">-</option>
                    {SIZE_OPTIONS.map((size) => <option key={size} value={size}>{getSizeLabel(size)}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <label className={`inline-flex min-w-24 items-center justify-center gap-2 rounded-md border px-3 py-2 font-semibold ${row.poket ? "border-blue-200 bg-blue-50 text-batikara-navy" : "border-batikara-line bg-white text-slate-600"}`}>
                    <input type="checkbox" checked={row.poket} onChange={(event) => onUpdateRow(row.id, { poket: event.target.checked })} className="h-4 w-4 accent-batikara-blue" />
                    +RM3
                  </label>
                </td>
                <td className="px-3 py-3">
                  <input type="number" min="1" value={row.quantity} onChange={(event) => onUpdateRow(row.id, { quantity: Math.max(1, Number(event.target.value)) })} className="w-20 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue" />
                </td>
                <td className="px-3 py-3">
                  <input type="number" min="0" step="0.01" value={row.unitPrice} onChange={(event) => onUpdateRow(row.id, { unitPrice: Number(event.target.value) })} className="w-32 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue" />
                </td>
                <td className="px-3 py-3">
                  <label className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-md border px-3 py-2 font-semibold ${row.paid ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                    <input type="checkbox" checked={row.paid} onChange={(event) => onUpdateRow(row.id, { paid: event.target.checked })} className="h-4 w-4 accent-batikara-blue" />
                    {row.paid ? "Paid" : "Not Yet"}
                  </label>
                </td>
                <td className="px-3 py-3 font-bold text-batikara-navy">{formatCurrency(row.totalPrice)}</td>
                <td className="px-3 py-3 font-semibold text-batikara-navy">{formatCurrency(deliveryPerPerson)}</td>
                <td className="px-3 py-3 font-bold text-batikara-navy">{formatCurrency(totalWithPostage)}</td>
                <td className="px-3 py-3 text-right">
                  <button onClick={() => onRemoveRow(row.id)} className="rounded-md border border-red-200 px-3 py-2 text-red-700">Remove</button>
                </td>
              </tr>
            );
          }) : (
            <tr>
              <td colSpan={12} className="px-3 py-8 text-center text-slate-500">Upload a cikgu list or add names manually.</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-batikara-navy bg-batikara-sky">
            <td colSpan={6} className="px-3 py-3 text-right font-bold text-batikara-navy">Total Postage Fee</td>
            <td className="px-3 py-3">
              <input type="number" min="0" step="0.01" value={deliveryTotal} onChange={(event) => onDeliveryChange(Math.max(0, Number(event.target.value) || 0))} className="w-32 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue" />
            </td>
            <td colSpan={5} className="px-3 py-3 font-semibold text-batikara-navy">
              {formatCurrency(deliveryTotal)} ÷ {summary.totalPax || 0} orang = {formatCurrency(deliveryPerPerson)} each
            </td>
          </tr>
          <tr className="bg-batikara-sky">
            <td colSpan={7} className="px-3 py-3 text-right font-bold text-batikara-navy">Total Postage Remaining</td>
            <td colSpan={5} className="px-3 py-3 font-bold text-batikara-navy">{formatCurrency(deliveryTotal)}</td>
          </tr>
          <tr className="bg-white">
            <td colSpan={7} className="px-3 py-3 text-right font-bold text-batikara-navy">Final Total</td>
            <td colSpan={5} className="px-3 py-3 text-xl font-bold text-batikara-navy">{formatCurrency(summary.grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PricingPanel({ pricing, onChange, onSave }: { pricing: PricingSettings; onChange: (pricing: PricingSettings) => void; onSave: () => void }) {
  const fields: Array<[keyof PricingSettings, string]> = [
    ["kainPasangPerMeter", "Kain Pasang price per meter"],
    ["kemeja", "Kemeja price"],
    ["kurungPahang", "Kurung Pahang price"],
    ["kurungModen", "Kurung Moden price"],
    ["addonPocket", "Poket add-on price"],
    ["addonExtraSize", "3XL-5XL add-on price"],
    ["deliveryCharge", "Delivery charge"],
    ["discountAmount", "Discount amount"]
  ];
  return (
    <section className="rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-batikara-navy">Pricing Settings</h2>
          <p className="text-sm text-slate-600">Saved permanently in Supabase, with local fallback storage.</p>
        </div>
        <button onClick={onSave} className="inline-flex items-center gap-2 rounded-md bg-batikara-blue px-4 py-2.5 font-semibold text-white"><Save className="h-4 w-4" />Save</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
            <input type="number" min="0" step="0.01" value={pricing[key]} onChange={(event) => onChange({ ...pricing, [key]: Number(event.target.value) })} className="w-full rounded-md border border-batikara-line px-3 py-2.5 outline-none focus:border-batikara-blue" />
          </label>
        ))}
      </div>
    </section>
  );
}

function HistoryPanel({ projects, search, onSearch, onLoad, onDuplicate, onDelete }: { projects: ProjectRecord[]; search: string; onSearch: (value: string) => void; onLoad: (project: ProjectRecord) => void; onDuplicate: (project: ProjectRecord) => void; onDelete: (project: ProjectRecord) => void }) {
  return (
    <section className="rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-batikara-navy">Historical Projects</h2>
          <p className="text-sm text-slate-600">Search, edit, duplicate, and delete previous quotations.</p>
        </div>
        <label className="relative block sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search projects" className="w-full rounded-md border border-batikara-line py-2.5 pl-9 pr-3 outline-none focus:border-batikara-blue" />
        </label>
      </div>
      <div className="grid gap-3">
        {projects.length ? projects.map((project) => (
          <article key={project.id} className="flex flex-col gap-3 rounded-lg border border-batikara-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-bold text-batikara-navy">{project.schoolName}</h3>
              <p className="text-sm text-slate-600">{project.quotationNo} · {project.projectNo} · {formatCurrency(project.summary.grandTotal)}</p>
              <p className="text-sm text-slate-600">Invoice {project.invoiceNo || "-"} · Design {project.designCode || "-"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => onLoad(project)} className="rounded-md border border-batikara-line px-3 py-2 text-sm font-semibold text-batikara-navy">Edit</button>
              <button onClick={() => onDuplicate(project)} className="inline-flex items-center gap-2 rounded-md bg-batikara-blue px-3 py-2 text-sm font-semibold text-white"><Copy className="h-4 w-4" />Duplicate</button>
              <button onClick={() => onDelete(project)} className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700"><Trash2 className="h-4 w-4" />Delete</button>
            </div>
          </article>
        )) : <p className="py-8 text-center text-slate-500">No saved projects yet.</p>}
      </div>
    </section>
  );
}
