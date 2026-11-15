const PDFDocument = require('pdfkit');

/* ================= ArixGear invoiceService — PDF invoices (Layer 2 #9) =================
   Builds a clean A4 invoice for any order with pdfkit (no headless browser).
   ৳ taka sign lives outside the PDF-standard WinAnsi charset, so monetary
   values inside the PDF use the "BDT 1,234.00" form — unambiguous for banks
   and printers, while every storefront surface keeps ৳.

   Access control lives in orderController.invoice(); this module is pure
   rendering and never touches the DB.                                             */

const BDT = (n) => 'BDT ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function buildInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: 'ArixGear Invoice ' + order.orderNumber, Author: 'ArixGear' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const L = 48, R = 547, W = R - L; // content bounds (A4 595pt wide)

    /* ---------- header ---------- */
    doc.rect(0, 0, 595, 110).fill('#111111');
    doc.fill('#2F81F7').font('Helvetica-Bold').fontSize(30).text('ArixGear', L, 34);
    doc.fill('#bbbbbb').font('Helvetica').fontSize(9)
      .text('Premium Gym Gear · Dhaka, Bangladesh · support@arixgear.tech', L, 72);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16)
      .text('INVOICE', R - 90, 40, { width: 90, align: 'right' });
    doc.fill('#2F81F7').font('Helvetica').fontSize(11)
      .text(order.orderNumber, R - 150, 62, { width: 150, align: 'right' });

    /* ---------- meta ---------- */
    let y = 140;
    doc.fill('#111111').font('Helvetica-Bold').fontSize(10).text('Invoice date', L, y);
    doc.font('Helvetica').fontSize(10).text(when(order.createdAt), L + 90, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).text('Order status', L, y);
    doc.font('Helvetica').fontSize(10).text(String(order.status).toUpperCase(), L + 90, y);
    y += 16;
    doc.font('Helvetica-Bold').fontSize(10).text('Payment', L, y);
    doc.font('Helvetica').fontSize(10).text(
      `${String(order.payment.method).toUpperCase()} · ${String(order.payment.status).toUpperCase()}` +
      (order.payment.trxId ? ` · TrxID ${order.payment.trxId}` : ''), L + 90, y);

    /* ---------- bill to / ship to ---------- */
    y += 34;
    const col2 = L + W / 2 + 12;
    doc.font('Helvetica-Bold').fontSize(10).text('BILLED TO', L, y);
    doc.text('SHIP TO', col2, y);
    y += 15;
    doc.font('Helvetica').fontSize(10);
    const bill = [
      order.customer.name,
      'Phone: ' + order.customer.phone,
      order.customer.email || '',
      order.isGuest ? 'Guest checkout' : 'Registered account',
    ].filter(Boolean);
    const ship = [
      order.shipping.address + (order.shipping.postal ? ', ' + order.shipping.postal : ''),
      order.shipping.city,
      'Division: ' + order.shipping.division,
      order.shipping.notes ? 'Note: ' + order.shipping.notes : '',
    ].filter(Boolean);
    bill.forEach((t) => { doc.text(t, L, y, { lineGap: 2 }); y += 13; });
    let y2 = y - bill.length * 13;
    ship.forEach((t) => { doc.text(t, col2, y2, { lineGap: 2 }); y2 += 13; });
    y = Math.max(y, y2) + 14;

    /* ---------- items table ---------- */
    const cQty = R - 210, cPrice = R - 130, cTotal = R;
    doc.rect(L, y, W, 22).fill('#f2f2f2');
    doc.fill('#111111').font('Helvetica-Bold').fontSize(9.5);
    doc.text('ITEM', L + 8, y + 7);
    doc.text('QTY', cQty, y + 7, { width: 50, align: 'right' });
    doc.text('UNIT', cPrice, y + 7, { width: 70, align: 'right' });
    doc.text('TOTAL', cTotal - 80, y + 7, { width: 80, align: 'right' });
    y += 22;

    doc.font('Helvetica').fontSize(9.5);
    for (const it of order.items || []) {
      const label = it.name +
        (it.size ? '  ·  Size ' + it.size : '') +
        (it.color ? '  ·  ' + it.color : '');
      const lines = 2;
      doc.fill('#111111');
      doc.text(label, L + 8, y + 6, { width: cQty - L - 24, lineGap: 1 });
      doc.text(String(it.qty), cQty, y + 6, { width: 50, align: 'right' });
      doc.text(BDT(it.price), cPrice, y + 6, { width: 70, align: 'right' });
      doc.text(BDT(it.lineTotal), cTotal - 80, y + 6, { width: 80, align: 'right' });
      y += Math.max(18, doc.heightOfString(label, { width: cQty - L - 24 }) + 10);
      doc.moveTo(L, y).lineTo(R, y).strokeColor('#dddddd').lineWidth(0.5).stroke();
    }

    /* ---------- totals ---------- */
    y += 12;
    const t = order.totals || {};
    const row = (label, val, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 10).fill('#111111');
      doc.text(label, R - 260, y, { width: 150, align: 'right' });
      doc.text(val, R - 100, y, { width: 100, align: 'right' });
      y += 17;
    };
    row('Subtotal', BDT(t.subtotal));
    if (t.discount > 0) row('Discount' + (t.couponCode ? ` (${t.couponCode})` : ''), '− ' + BDT(t.discount));
    row('Shipping (' + order.shipping.division + ')', t.shipping === 0 ? 'FREE' : BDT(t.shipping));
    doc.moveTo(R - 270, y - 4).lineTo(R, y - 4).strokeColor('#999999').lineWidth(0.75).stroke();
    y += 4;
    doc.rect(R - 270, y, 270, 26).fill('#111111');
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(12);
    doc.text('GRAND TOTAL', R - 260, y + 7, { width: 140, align: 'right' });
    doc.text(BDT(t.grandTotal), R - 110, y + 7, { width: 105, align: 'right' });
    y += 40;

    /* ---------- refunds (RMA ledger) ---------- */
    const refunds = (order.payment && order.payment.refunds) || [];
    if (refunds.length) {
      doc.fill('#8a1c1c').font('Helvetica-Bold').fontSize(10).text('REFUNDS', L, y);
      y += 14;
      doc.font('Helvetica').fontSize(9.5).fill('#111111');
      refunds.forEach((r) => {
        doc.text(`${BDT(r.amount)} · ${when(r.at)} · ${r.by || 'admin'}${r.note ? ' · ' + r.note : ''}`, L, y, { lineGap: 2 });
        y += 14;
      });
      y += 6;
    }

    /* ---------- footer ---------- */
    doc.fill('#666666').font('Helvetica').fontSize(8.5)
      .text('Thank you for forging with us. Exchange/return within 7 days of delivery — open a request from the order tracking page (My Account → Track Your Order).',
        L, Math.max(y, 740), { width: W, align: 'center' });

    doc.end();
  });
}

module.exports = { buildInvoicePdf };
