"use client";

import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw, Upload } from "lucide-react";
import { DEFAULT_PRICING, formatCurrency, type PricingSettings } from "@/lib/calculator";
import { getSupabaseClient } from "@/lib/supabase";

type ShareRow = {
  id: string;
  nama: string;
  jenisPakaian: string;
  saiz: string;
  poket: boolean;
  quantity: number;
  unitPrice?: number;
  totalPrice: number;
  paid: boolean;
  slipName?: string;
  slipDataUrl?: string;
};

type SharePayload = {
  schoolName: string;
  quotationNo: string;
  projectNo: string;
  shareToken?: string;
  deliveryTotal?: number;
  pricing?: PricingSettings;
  rows: ShareRow[];
};

const ITEM_OPTIONS = ["Kemeja", "Kurung Moden", "Kurung Pahang", "Kain Pasang"];
const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "Custom Size"];
const EXTRA_SIZE_OPTIONS = new Set(["3XL", "4XL", "5XL"]);
const CUSTOM_SIZE_ADDON = 10;

export default function SharePage() {
  const [payload, setPayload] = useState<SharePayload | null>(null);
  const [rows, setRows] = useState<ShareRow[]>([]);
  const [syncNotice, setSyncNotice] = useState("");
  const shareToken = payload?.shareToken ?? payload?.projectNo ?? payload?.quotationNo ?? "";

  useEffect(() => {
    void loadInitialShare();
  }, []);

  async function loadInitialShare() {
    const search = new URLSearchParams(window.location.search);
    const token = search.get("token");
    const queryPayload = parseEncodedPayload(search.get("data"));
    const localPayload = token ? parseStoredPayload(token) : null;
    const remotePayload = token ? await loadPayloadFromToken(token) : null;
    const hashPayload = parseHashPayload();
    const parsed = queryPayload ?? localPayload ?? remotePayload ?? hashPayload;

    if (!parsed) {
      setPayload(null);
      setRows([]);
      return;
    }

    const saved = localStorage.getItem(`batikara.share.${parsed.quotationNo}`);
    const savedRows = saved ? JSON.parse(saved) as Record<string, Partial<ShareRow>> : {};
    const mergedRows = parsed.rows.map((row) => calculateShareRow({ ...row, ...savedRows[row.id] }, parsed.pricing ?? DEFAULT_PRICING));
    setPayload(parsed);
    setRows(mergedRows);
    void loadSharedRows(parsed, mergedRows);
  }

  function parseStoredPayload(token: string): SharePayload | null {
    const saved = localStorage.getItem(`batikara.share.payload.${token}`);
    if (!saved) return null;

    try {
      return JSON.parse(saved) as SharePayload;
    } catch {
      localStorage.removeItem(`batikara.share.payload.${token}`);
      return null;
    }
  }

  async function loadPayloadFromToken(token: string): Promise<SharePayload | null> {
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("projects")
      .select("school_name, quotation_no, project_no, pricing, rows, summary")
      .or(`project_no.eq.${token},quotation_no.eq.${token}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const projectRows = Array.isArray(data.rows) ? data.rows as Array<Record<string, unknown>> : [];
    const summary = data.summary as Record<string, unknown> | null;
    return {
      schoolName: String(data.school_name ?? "School Name"),
      quotationNo: String(data.quotation_no ?? token),
      projectNo: String(data.project_no ?? token),
      shareToken: String(data.project_no ?? token),
      pricing: data.pricing as PricingSettings,
      deliveryTotal: Number(summary?.deliveryTotal ?? 0),
      rows: projectRows.map((row, index) => ({
        id: String(row.id ?? `${index}`),
        nama: String(row.nama ?? ""),
        jenisPakaian: String(row.jenisPakaian ?? ""),
        saiz: String(row.saiz ?? ""),
        poket: Boolean(row.poket),
        quantity: Number(row.quantity ?? 1),
        unitPrice: Number(row.unitPrice ?? 0),
        totalPrice: Number(row.totalPrice ?? 0),
        paid: Boolean(row.paid)
      }))
    };
  }

  function parseHashPayload(): SharePayload | null {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return parseEncodedPayload(params.get("data"));
  }

  function parseEncodedPayload(data: string | null): SharePayload | null {
    if (!data) return null;

    try {
      return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(data))))) as SharePayload;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (!payload) return;
    const savedRows = rows.reduce<Record<string, Partial<ShareRow>>>((all, row) => {
      all[row.id] = {
        nama: row.nama,
        jenisPakaian: row.jenisPakaian,
        saiz: row.saiz,
        poket: row.poket,
        paid: row.paid,
        slipName: row.slipName,
        slipDataUrl: row.slipDataUrl
      };
      return all;
    }, {});
    localStorage.setItem(`batikara.share.${payload.quotationNo}`, JSON.stringify(savedRows));
  }, [payload, rows]);

  function updateRow(id: string, patch: Partial<ShareRow>) {
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const updated = calculateShareRow({ ...row, ...patch }, payload?.pricing ?? DEFAULT_PRICING);
      void saveSharedRow(updated);
      return updated;
    }));
  }

  async function handleSlipUpload(row: ShareRow, file: File) {
    const reader = new FileReader();
    reader.onload = () => updateRow(row.id, { slipName: file.name, slipDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function loadSharedRows(currentPayload = payload, currentRows = rows) {
    const supabase = getSupabaseClient();
    const token = currentPayload?.shareToken ?? currentPayload?.projectNo ?? currentPayload?.quotationNo;
    if (!supabase || !currentPayload || !token) return;

    const { data, error } = await supabase
      .from("share_payment_rows")
      .select("*")
      .eq("share_token", token);

    if (error) {
      setSyncNotice("Shared saving is not connected yet.");
      return;
    }

    const byId = new Map((data ?? []).map((row) => [String(row.row_id), row]));
    const merged = currentRows.map((row) => {
      const remote = byId.get(row.id);
      if (!remote) return row;
      return calculateShareRow({
        ...row,
        nama: String(remote.nama ?? row.nama),
        jenisPakaian: String(remote.jenis_pakaian ?? row.jenisPakaian),
        saiz: String(remote.saiz ?? row.saiz),
        poket: Boolean(remote.poket),
        paid: Boolean(remote.paid),
        slipName: String(remote.slip_name ?? row.slipName ?? ""),
        slipDataUrl: String(remote.slip_data_url ?? row.slipDataUrl ?? "")
      }, currentPayload.pricing ?? DEFAULT_PRICING);
    });
    setRows(merged);
    setSyncNotice("Shared status loaded.");
  }

  async function saveSharedRow(row: ShareRow) {
    const supabase = getSupabaseClient();
    if (!supabase || !payload || !shareToken) return;

    const { error } = await supabase.from("share_payment_rows").upsert({
      share_token: shareToken,
      row_id: row.id,
      nama: row.nama,
      jenis_pakaian: row.jenisPakaian,
      saiz: row.saiz,
      poket: row.poket,
      quantity: row.quantity,
      total_price: row.totalPrice,
      paid: row.paid,
      slip_name: row.slipName ?? "",
      slip_data_url: row.slipDataUrl ?? "",
      updated_at: new Date().toISOString()
    }, { onConflict: "share_token,row_id" });

    setSyncNotice(error ? "Could not save shared status." : "Saved for everyone using this link.");
  }

  const summary = useMemo(() => {
    const grandTotal = rows.reduce((sum, row) => sum + row.totalPrice, 0);
    const deliveryTotal = payload?.deliveryTotal ?? 0;
    const deliveryPerPerson = rows.length ? deliveryTotal / rows.length : 0;
    const paidRows = rows.filter((row) => row.paid);
    const paidTotal = paidRows.reduce((sum, row) => sum + row.totalPrice + deliveryPerPerson, 0);
    return {
      total: rows.length,
      paid: paidRows.length,
      notYet: rows.length - paidRows.length,
      itemSubtotal: grandTotal,
      deliveryTotal,
      deliveryPerPerson,
      grandTotal: grandTotal + deliveryTotal,
      paidTotal,
      pendingTotal: grandTotal + deliveryTotal - paidTotal
    };
  }, [payload?.deliveryTotal, rows]);

  if (!payload) {
    return (
      <main className="min-h-screen bg-batikara-sky px-4 py-10 text-batikara-ink">
        <section className="mx-auto max-w-3xl rounded-lg border border-batikara-line bg-white p-6 shadow-panel">
          <h1 className="text-2xl font-bold text-batikara-navy">Payment Share View</h1>
          <p className="mt-2 text-slate-600">This share link is empty or invalid.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f9fd] px-4 py-6 text-batikara-ink">
      <section className="print-surface mx-auto max-w-6xl rounded-lg border border-batikara-line bg-white p-5 shadow-panel">
        <div className="mb-5 flex flex-col gap-4 border-b border-batikara-line pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-batikara-blue">Payment Checklist</p>
            <h1 className="text-2xl font-bold text-batikara-navy">{payload.schoolName}</h1>
            <p className="text-sm text-slate-600">Quotation {payload.quotationNo} · Project {payload.projectNo}</p>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button onClick={() => loadSharedRows()} className="inline-flex items-center gap-2 rounded-md border border-batikara-line bg-white px-4 py-2.5 font-semibold text-batikara-navy">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-md border border-batikara-line bg-white px-4 py-2.5 font-semibold text-batikara-navy">
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>
        </div>
        {syncNotice ? <p className="no-print mb-4 rounded-md border border-batikara-line bg-batikara-sky px-3 py-2 text-sm text-batikara-navy">{syncNotice}</p> : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <SummaryBox label="Paid" value={`${summary.paid} / ${formatCurrency(summary.paidTotal)}`} />
          <SummaryBox label="Not Yet" value={`${summary.notYet} / ${formatCurrency(summary.pendingTotal)}`} />
          <SummaryBox label="Delivery" value={`${formatCurrency(summary.deliveryTotal)} / ${formatCurrency(summary.deliveryPerPerson)} each`} />
          <SummaryBox label="Total" value={`${summary.total} / ${formatCurrency(summary.grandTotal)}`} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-batikara-navy text-white">
                {["Nama", "Item", "Saiz", "Poket", "Qty", "Item Amount", "Postage", "Total Pay", "Paid?", "Bank Slip"].map((heading) => (
                  <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const totalPay = row.totalPrice + summary.deliveryPerPerson;
                return (
                  <tr key={row.id} className="border-b border-batikara-line">
                    <td className="px-3 py-3">
                      <input value={row.nama} onChange={(event) => updateRow(row.id, { nama: event.target.value })} className="w-40 rounded-md border border-batikara-line px-2 py-2 font-semibold outline-none focus:border-batikara-blue" />
                    </td>
                    <td className="px-3 py-3">
                      <select value={row.jenisPakaian} onChange={(event) => updateRow(row.id, { jenisPakaian: event.target.value })} className="w-40 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue">
                        {ITEM_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <select value={row.saiz} onChange={(event) => updateRow(row.id, { saiz: event.target.value })} className="w-24 rounded-md border border-batikara-line px-2 py-2 outline-none focus:border-batikara-blue">
                        <option value="">-</option>
                        {SIZE_OPTIONS.map((size) => <option key={size} value={size}>{getSizeLabel(size)}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <label className={`inline-flex min-w-20 items-center justify-center gap-2 rounded-md border px-3 py-2 font-semibold ${row.poket ? "border-blue-200 bg-blue-50 text-batikara-navy" : "border-batikara-line bg-white text-slate-600"}`}>
                        <input type="checkbox" checked={row.poket} onChange={(event) => updateRow(row.id, { poket: event.target.checked })} className="h-4 w-4 accent-batikara-blue" />
                        {row.poket ? "Yes +RM3" : "No"}
                      </label>
                    </td>
                    <td className="px-3 py-3">{row.quantity}</td>
                    <td className="px-3 py-3 font-bold text-batikara-navy">{formatCurrency(row.totalPrice)}</td>
                    <td className="px-3 py-3 font-semibold text-batikara-navy">{formatCurrency(summary.deliveryPerPerson)}</td>
                    <td className="px-3 py-3 font-bold text-batikara-navy">{formatCurrency(totalPay)}</td>
                    <td className="px-3 py-3">
                      <label className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-md border px-3 py-2 font-semibold ${row.paid ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        <input
                          type="checkbox"
                          checked={row.paid}
                          onChange={(event) => updateRow(row.id, { paid: event.target.checked })}
                          className="h-4 w-4 accent-batikara-blue"
                        />
                        {row.paid ? "Paid" : "Not Yet"}
                      </label>
                    </td>
                    <td className="px-3 py-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-batikara-line px-3 py-2 font-semibold text-batikara-navy">
                        <Upload className="h-4 w-4" />
                        Upload
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={(event) => event.target.files?.[0] && handleSlipUpload(row, event.target.files[0])} />
                      </label>
                      {row.slipName ? (
                        <div className="mt-2 text-xs text-slate-600">
                          {row.slipDataUrl ? <a href={row.slipDataUrl} target="_blank" rel="noreferrer" className="font-semibold text-batikara-blue underline">{row.slipName}</a> : row.slipName}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary.deliveryTotal ? (
            <div className="border-x border-b border-batikara-line bg-batikara-sky px-3 py-3 text-right font-bold text-batikara-navy">
              Delivery: {formatCurrency(summary.deliveryTotal)} ÷ {summary.total} orang = {formatCurrency(summary.deliveryPerPerson)} each · Final Total {formatCurrency(summary.grandTotal)}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function calculateShareRow(row: ShareRow, pricing: PricingSettings): ShareRow {
  const unitPrice = getItemPrice(row.jenisPakaian, pricing)
    + getSizeAddon(row.saiz, pricing)
    + (row.poket ? pricing.addonPocket : 0);
  return {
    ...row,
    unitPrice,
    totalPrice: unitPrice * row.quantity
  };
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

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-batikara-line bg-batikara-sky p-4">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-1 text-xl font-bold text-batikara-navy">{value}</p>
    </div>
  );
}
