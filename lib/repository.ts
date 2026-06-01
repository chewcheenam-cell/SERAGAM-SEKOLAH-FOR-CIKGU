import { DEFAULT_PRICING, normalizeCalculatedRow, type PricingSettings, type ProjectRecord } from "@/lib/calculator";
import { getSupabaseClient } from "@/lib/supabase";

const PRICING_KEY = "batikara.pricing";
const PROJECTS_KEY = "batikara.projects";
const SESSION_KEY = "batikara.session";

export function createRepository() {
  const supabase = getSupabaseClient();

  return {
    async getSession() {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        return data.session;
      }
      return typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    },

    async signIn(email: string, password: string) {
      if (supabase) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { ok: !error, message: error?.message ?? "Signed in." };
      }

      const demoEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? "admin@batikara.local";
      const demoPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "batikara123";
      const ok = email === demoEmail && password === demoPassword;
      if (ok) localStorage.setItem(SESSION_KEY, "local");
      return {
        ok,
        message: ok ? "Signed in with local demo mode." : `Use ${demoEmail} / ${demoPassword} for local demo mode.`
      };
    },

    async getPricing(): Promise<PricingSettings> {
      if (supabase) {
        const { data } = await supabase.from("pricing_settings").select("*").limit(1).maybeSingle();
        if (data) return normalizePricing(fromPricingRow(data));
      }
      return normalizePricing(readLocal(PRICING_KEY, DEFAULT_PRICING));
    },

    async savePricing(pricing: PricingSettings) {
      if (supabase) {
        const { data } = await supabase.from("pricing_settings").select("id").limit(1).maybeSingle();
        if (data?.id) {
          await supabase.from("pricing_settings").update(toPricingRow(pricing)).eq("id", data.id);
          return;
        }
        await supabase.from("pricing_settings").insert(toPricingRow(pricing));
        return;
      }
      writeLocal(PRICING_KEY, pricing);
    },

    async listProjects(): Promise<ProjectRecord[]> {
      if (supabase) {
        const { data } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
        return (data ?? []).map(fromProjectRow);
      }
      return readLocal<ProjectRecord[]>(PROJECTS_KEY, []).map(normalizeProjectRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async saveProject(project: ProjectRecord): Promise<ProjectRecord> {
      const record = { ...project, id: project.id || crypto.randomUUID(), createdAt: project.createdAt || new Date().toISOString() };
      if (supabase) {
        const { data, error } = await supabase.from("projects").upsert(toProjectRow(record), { onConflict: "id" }).select("*").single();
        if (error) throw error;
        return fromProjectRow(data);
      }

      const projects = readLocal<ProjectRecord[]>(PROJECTS_KEY, []);
      const withoutCurrent = projects.filter((item) => item.id !== record.id);
      writeLocal(PROJECTS_KEY, [record, ...withoutCurrent]);
      return record;
    }
  };
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  if (typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(value));
}

function fromPricingRow(row: Record<string, number>): PricingSettings {
  return {
    kainPasangPerMeter: Number(row.kain_pasang_per_meter),
    kemeja: Number(row.kemeja),
    kurungPahang: Number(row.kurung_pahang),
    kurungModen: Number(row.kurung_moden),
    addonPocket: Number(row.addon_pocket),
    addonExtraSize: Number(row.addon_extra_size),
    deliveryCharge: Number(row.delivery_charge),
    discountAmount: Number(row.discount_amount)
  };
}

function toPricingRow(pricing: PricingSettings) {
  return {
    kain_pasang_per_meter: pricing.kainPasangPerMeter,
    kemeja: pricing.kemeja,
    kurung_pahang: pricing.kurungPahang,
    kurung_moden: pricing.kurungModen,
    addon_pocket: pricing.addonPocket,
    addon_extra_size: pricing.addonExtraSize,
    delivery_charge: pricing.deliveryCharge,
    discount_amount: pricing.discountAmount,
    updated_at: new Date().toISOString()
  };
}

function normalizePricing(pricing: PricingSettings): PricingSettings {
  return {
    ...pricing,
    addonPocket: pricing.addonPocket === 5 ? 3 : pricing.addonPocket,
    addonExtraSize: pricing.addonExtraSize === 10 ? 5 : pricing.addonExtraSize
  };
}

function fromProjectRow(row: Record<string, unknown>): ProjectRecord {
  return normalizeProjectRecord({
    id: String(row.id),
    schoolName: String(row.school_name),
    quotationNo: String(row.quotation_no),
    projectNo: String(row.project_no),
    schoolLogo: String(row.school_logo ?? ""),
    companyLogo: String(row.company_logo ?? ""),
    sourceFileName: String(row.source_file_name ?? ""),
    pricing: row.pricing as PricingSettings,
    rows: Array.isArray(row.rows) ? row.rows as ProjectRecord["rows"] : [],
    summary: row.summary as ProjectRecord["summary"],
    createdAt: String(row.created_at)
  });
}

function toProjectRow(project: ProjectRecord) {
  return {
    id: project.id,
    school_name: project.schoolName,
    quotation_no: project.quotationNo,
    project_no: project.projectNo,
    school_logo: project.schoolLogo,
    company_logo: project.companyLogo,
    source_file_name: project.sourceFileName,
    pricing: project.pricing,
    rows: project.rows,
    summary: project.summary,
    updated_at: new Date().toISOString()
  };
}

function normalizeProjectRecord(project: ProjectRecord): ProjectRecord {
  const rows = Array.isArray(project.rows) ? project.rows.map((row, index) => normalizeCalculatedRow(row, index)) : [];
  const itemSubtotal = rows.reduce((sum, row) => sum + row.totalPrice, 0);
  const deliveryTotal = project.summary?.deliveryTotal ?? 0;
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalPax = rows.filter((row) => row.nama.trim()).length;
  const deliveryPerPax = totalPax ? deliveryTotal / totalPax : 0;
  const grandTotal = itemSubtotal + deliveryTotal;
  const paidRows = rows.filter((row) => row.paid);
  const paidCount = paidRows.length;
  const paidTotal = paidRows.reduce((sum, row) => sum + row.totalPrice + deliveryPerPax, 0);
  const normalizedSummary = {
    ...project.summary,
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

  return {
    ...project,
    schoolName: project.schoolName || "Unnamed School",
    rows,
    summary: normalizedSummary,
    createdAt: project.createdAt || new Date().toISOString()
  };
}
