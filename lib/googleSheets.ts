import type { ProjectRecord } from "@/lib/calculator";

export async function sendProjectToGoogleSheets(project: ProjectRecord) {
  const webhookUrl = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project)
    });
  } catch {
    // Quotation saving should not fail when the optional Google Sheets bridge is unavailable.
  }
}
