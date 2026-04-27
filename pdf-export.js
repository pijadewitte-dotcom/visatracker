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
  return `€${Number(value || 0).toFixed(2)}`;
}

function addReceiptImage(doc, image) {
  if (!image) return;
  try {
    const boxX = 10.0;
    const boxY = 45.0;
    const boxW = 190.0;
    const boxH = 236.0;
    const props = doc.getImageProperties(image);
    const type = image.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    const portrait = props.height >= props.width;

    if (portrait) {
      const scale = Math.min(boxW / props.width, boxH / props.height);
      const drawW = props.width * scale;
      const drawH = props.height * scale;
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;
      doc.addImage(image, type, drawX, drawY, drawW, drawH);
      return;
    }

    const scale = Math.min(boxW / props.height, boxH / props.width);
    const drawW = props.height * scale;
    const drawH = props.width * scale;
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = boxY + (boxH - drawH) / 2;
    doc.addImage(image, type, drawX, drawY, drawW, drawH, undefined, 'FAST', 90);
  } catch {
  }
}

function drawVisaPage(doc, row, pageIndex, pageCount) {
  const navy = [26, 31, 113];
  const pale = [180, 185, 220];
  const ink = [26, 23, 20];
  const footer = [180, 175, 168];
  const white = [255, 255, 255];

  doc.setFillColor(...navy);
  doc.rect(0, 0, 210, 22, 'F');

  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(10);
  doc.setTextColor(...white);
  doc.text('VISA', 18.9, 13.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...pale);
  doc.text(`${pageIndex} / ${pageCount}`, 190.5, 13.0, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...navy);
  doc.text('DATUM', 14.0, 30.0);
  doc.text('CATEGORIE', 56.0, 30.0);
  doc.text('BESCHRIJVING', 110.0, 30.0);
  doc.text('BEDRAG', 183.8, 30.0);

  doc.setDrawColor(...navy);
  doc.setLineWidth(0.45);
  doc.line(14.0, 32.2, 196.0, 32.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...ink);
  doc.text(visaFmtDate(row.date), 14.0, 37.0);
  doc.text(String(row.cat || row.category || 'Overige').slice(0, 22), 56.0, 37.0);
  doc.text(String(row.desc || row.title || '').slice(0, 34), 110.0, 37.0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text(visaMoney(row.amount), 182.0, 37.0);

  addReceiptImage(doc, row.img || row.image);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...footer);
  doc.text('Visa Expense Tracker', 93.0, 291.0);
}

function exportPdf() {
  const rows = visaPdfRows();
  if (!rows.length) {
    if (typeof showToast === 'function') showToast('Geen uitgaven');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageCount = rows.length;
  rows.forEach((row, index) => {
    if (index > 0) doc.addPage();
    drawVisaPage(doc, row, index + 1, pageCount);
  });
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
