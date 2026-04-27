function visaPdfRows() {
  try {
    return JSON.parse(localStorage.visaExpenses || '[]');
  } catch {
    return [];
  }
}

function visaFmtDate(value) {
  if (!value) return '';
  const parts = String(value).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
}

function visaMoney(value) {
  const amount = Number(value || 0).toFixed(2);
  return `€${amount}`;
}

function visaText(doc, text, x, y, opts) {
  doc.text(String(text || ''), x, y, opts || {});
}

function drawVisaPage(doc, rows, pageIndex, pageCount, start, end) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 12;
  const top = 12;
  const colDate = 12;
  const colCat = 47;
  const colDesc = 91;
  const colAmount = pageW - 13;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  visaText(doc, 'VISA', left, top);
  visaText(doc, `${pageIndex} / ${pageCount}`, pageW - 12, top, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const headerY = 28;
  visaText(doc, 'DATUM', colDate, headerY);
  visaText(doc, 'CATEGORIE', colCat, headerY);
  visaText(doc, 'BESCHRIJVING', colDesc, headerY);
  visaText(doc, 'BEDRAG', colAmount, headerY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 38;
  for (let i = start; i < end; i += 1) {
    const row = rows[i];
    const desc = String(row.desc || row.title || '').slice(0, 42);
    const cat = String(row.cat || row.category || 'Overige').slice(0, 22);
    visaText(doc, visaFmtDate(row.date), colDate, y);
    visaText(doc, cat, colCat, y);
    visaText(doc, desc, colDesc, y);
    visaText(doc, visaMoney(row.amount), colAmount, y, { align: 'right' });
    y += 8;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  visaText(doc, 'Visa Expense Tracker', left, pageH - 12);
}

function exportPdf() {
  const rows = visaPdfRows();
  if (!rows.length) {
    if (typeof showToast === 'function') showToast('Geen uitgaven');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const rowsPerPage = 30;
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  for (let page = 0; page < pageCount; page += 1) {
    if (page > 0) doc.addPage();
    drawVisaPage(doc, rows, page + 1, pageCount, page * rowsPerPage, Math.min(rows.length, (page + 1) * rowsPerPage));
  }
  doc.save(`visa-${new Date().toISOString().slice(0, 10)}.pdf`);
}

window.exportPdf = exportPdf;
window.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('exportBtn');
  if (button) button.onclick = exportPdf;
});
setTimeout(() => {
  const button = document.getElementById('exportBtn');
  if (button) button.onclick = exportPdf;
}, 0);
