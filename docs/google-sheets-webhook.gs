function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Projects")
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet("Projects");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Created At",
      "School",
      "Quotation No",
      "Project No",
      "Total Pax",
      "Total Quantity",
      "Grand Total"
    ]);
  }

  sheet.appendRow([
    payload.createdAt,
    payload.schoolName,
    payload.quotationNo,
    payload.projectNo,
    payload.summary.totalPax,
    payload.summary.totalQuantity,
    payload.summary.grandTotal
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
