import { formatCurrency, type ProjectRecord } from "@/lib/calculator";

export async function exportQuotationPdf(project: {
  meta: { schoolName: string; quotationNo: string; projectNo: string; invoiceNo?: string; designCode?: string };
  pricing: ProjectRecord["pricing"];
  rows: ProjectRecord["rows"];
  summary: ProjectRecord["summary"];
}) {
  const jsPdfModule = await import("jspdf");
  await import("jspdf-autotable");
  const doc = new jsPdfModule.default({ orientation: "portrait", unit: "mm", format: "a4" });
  const autoTable = (doc as unknown as { autoTable: (options: unknown) => void }).autoTable;

  doc.setFontSize(18);
  doc.text("Batikara Seragam Payment Summary", 14, 18);
  doc.setFontSize(11);
  doc.text(`School: ${project.meta.schoolName || "School Name"}`, 14, 28);
  doc.text(`Quotation No: ${project.meta.quotationNo}`, 14, 35);
  doc.text(`Project No: ${project.meta.projectNo}`, 14, 42);
  doc.text(`Invoice No: ${project.meta.invoiceNo || "-"}`, 14, 49);
  doc.text(`Design Code: ${project.meta.designCode || "-"}`, 14, 56);

  autoTable.call(doc, {
    startY: 66,
    head: [["Nama", "Jawatan", "Item", "Saiz", "Poket", "Qty", "Amount", "Status", "Total"]],
    body: project.rows.map((row) => [
      row.nama,
      row.jawatan,
      row.jenisPakaian,
      formatSizeRemark(row.saiz),
      row.poket ? "Yes (+RM3)" : "No",
      row.quantity,
      formatCurrency(row.unitPrice),
      row.paid ? "Paid" : "Not Yet",
      formatCurrency(row.totalPrice)
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [18, 56, 102] }
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60) + 10;
  doc.setFontSize(11);
  doc.text(`Total Cikgu: ${project.summary.totalPax}`, 14, finalY);
  doc.text(`Total Pieces: ${project.summary.totalQuantity}`, 14, finalY + 7);
  doc.text(`Item Subtotal: ${formatCurrency(project.summary.itemSubtotal ?? project.summary.grandTotal)}`, 14, finalY + 14);
  doc.text(`Delivery: ${formatCurrency(project.summary.deliveryTotal ?? 0)} / ${formatCurrency(project.summary.deliveryPerPax ?? 0)} each`, 14, finalY + 21);
  doc.text(`Final Total: ${formatCurrency(project.summary.grandTotal)}`, 14, finalY + 28);
  doc.text(`Paid: ${project.summary.paidCount ?? 0} (${formatCurrency(project.summary.paidTotal ?? 0)})`, 14, finalY + 35);
  doc.text(`Not Yet: ${project.summary.pendingCount ?? project.summary.totalPax} (${formatCurrency(project.summary.pendingTotal ?? project.summary.grandTotal)})`, 14, finalY + 42);
  doc.text(`Average Per Cikgu: ${formatCurrency(project.summary.averageCostPerPax)}`, 14, finalY + 49);
  const pendingRows = project.rows.filter((row) => row.nama.trim() && !row.paid);
  const pendingNames = pendingRows.length ? pendingRows.map((row) => row.nama).join(", ") : "Semua guru sudah bayar";
  doc.text(`Guru Belum Bayar: ${pendingNames}`, 14, finalY + 56, { maxWidth: 180 });
  doc.save(`${project.meta.quotationNo}.pdf`);
}

function formatSizeRemark(size: string) {
  const normalized = size.trim().toLowerCase();
  if (normalized === "custom size") return "Custom Size (+RM10)";
  if (["3xl", "4xl", "5xl"].includes(normalized)) return `${size} (+RM5)`;
  return size;
}
