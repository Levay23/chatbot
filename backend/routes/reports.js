import express from 'express';
import db from '../database/db.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

const router = express.Router();
router.use(verifyToken);

// ── Helper: query orders for a date range ──────────────────────
function getOrdersInRange(from, to) {
    return db.prepare(`
        SELECT o.id, o.total, o.status, o.payment_method, o.created_at,
               c.name as cliente, c.phone as telefono,
               GROUP_CONCAT(oi.product_name || ' x' || oi.quantity, ', ') as items_text
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = 'DELIVERED' AND DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `).all(from, to);
}

// ── Sales stats for charting ────────────────────────────────────
// GET /api/reports/stats?period=7d|30d|week|month
router.get('/stats', (req, res) => {
    const period = req.query.period || '7d';
    let days = 7;
    if (period === '30d') days = 30;
    else if (period === 'week') days = 7;
    else if (period === 'month') {
        // Return full current month
        const now = new Date();
        days = now.getDate();
    }

    try {
        // Daily sales (last N days)
        const dailySales = db.prepare(`
            SELECT DATE(created_at) as date,
                   SUM(total) as revenue,
                   COUNT(*) as orders
            FROM orders
            WHERE status = 'DELIVERED'
              AND DATE(created_at) >= DATE('now', ? || ' days')
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        `).all(`-${days}`);

        // Top products overall
        const topProducts = db.prepare(`
            SELECT oi.product_name as name,
                   SUM(oi.quantity) as total_qty,
                   SUM(oi.quantity * oi.price) as revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status = 'DELIVERED'
            GROUP BY oi.product_name
            ORDER BY total_qty DESC
            LIMIT 5
        `).all();

        // Payment method split
        const paymentSplit = db.prepare(`
            SELECT payment_method, COUNT(*) as count, SUM(total) as total
            FROM orders WHERE status = 'DELIVERED'
            GROUP BY payment_method
        `).all();

        // Summary totals: daily, weekly, monthly
        const today = db.prepare(`SELECT SUM(total) as rev, COUNT(*) as cnt FROM orders WHERE status='DELIVERED' AND DATE(created_at)=DATE('now')`).get();
        const week = db.prepare(`SELECT SUM(total) as rev, COUNT(*) as cnt FROM orders WHERE status='DELIVERED' AND DATE(created_at)>=DATE('now','-7 days')`).get();
        const month = db.prepare(`SELECT SUM(total) as rev, COUNT(*) as cnt FROM orders WHERE status='DELIVERED' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).get();

        res.json({ dailySales, topProducts, paymentSplit, today, week, month });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Export to Excel ─────────────────────────────────────────────
// GET /api/reports/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/export/excel', async (req, res) => {
    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to = req.query.to || from;
    const orders = getOrdersInRange(from, to);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ChatIA Bot';
    const sheet = workbook.addWorksheet(`Reporte ${from}`);

    sheet.columns = [
        { header: 'ID', key: 'id', width: 8 },
        { header: 'Cliente', key: 'cliente', width: 22 },
        { header: 'Teléfono', key: 'telefono', width: 18 },
        { header: 'Productos', key: 'items_text', width: 45 },
        { header: 'Método Pago', key: 'payment_method', width: 16 },
        { header: 'Total (COP)', key: 'total', width: 14 },
        { header: 'Fecha', key: 'created_at', width: 20 },
    ];

    // Header styling
    sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };
        cell.alignment = { horizontal: 'center' };
    });

    orders.forEach(o => sheet.addRow(o));

    // Total row
    sheet.addRow({});
    const totalRow = sheet.addRow({ cliente: 'TOTAL:', total: orders.reduce((s, o) => s + o.total, 0) });
    totalRow.getCell('cliente').font = { bold: true };
    totalRow.getCell('total').font = { bold: true, color: { argb: 'FF10B981' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_${from}_${to}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
});

// ── Export to PDF ───────────────────────────────────────────────
// GET /api/reports/export/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/export/pdf', (req, res) => {
    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to = req.query.to || from;
    const orders = getOrdersInRange(from, to);
    const grandTotal = orders.reduce((s, o) => s + o.total, 0);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_${from}_${to}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).fillColor('#10B981').text('REPORTE DE VENTAS', { align: 'center' });
    doc.fontSize(11).fillColor('#666').text(`Período: ${from} — ${to}`, { align: 'center' });
    doc.moveDown(0.8);

    // Summary box
    doc.roundedRect(40, doc.y, 515, 50, 6).fill('#F0FDF4');
    const boxY = doc.y - 50;
    doc.fillColor('#065F46').fontSize(10).text(`Total Ventas: $${grandTotal.toLocaleString('es-CO')} COP`, 55, boxY + 10);
    doc.text(`Pedidos: ${orders.length}`, 55, boxY + 26);
    doc.moveDown(2.5);

    // Table
    const cols = [50, 145, 260, 360, 440, 520];
    const headers = ['#', 'Cliente', 'Productos', 'Método', 'Total'];

    // Header row
    doc.rect(40, doc.y, 515, 18).fill('#10B981');
    headers.forEach((h, i) => {
        doc.fillColor('#fff').fontSize(8).text(h, cols[i], doc.y - 14, { width: cols[i + 1] - cols[i] - 4 });
    });
    doc.moveDown(0.1);

    // Data rows
    orders.forEach((o, idx) => {
        if (doc.y > 740) { doc.addPage(); }
        const y = doc.y;
        if (idx % 2 === 0) doc.rect(40, y, 515, 16).fill('#F9FAFB');
        doc.fillColor('#111').fontSize(7);
        const row = [String(o.id), o.cliente || '—', (o.items_text || '').substring(0, 40), o.payment_method, `$${o.total.toLocaleString('es-CO')}`];
        row.forEach((v, i) => doc.text(v, cols[i], y + 3, { width: cols[i + 1] - cols[i] - 4, lineBreak: false }));
        doc.y = y + 16;
    });

    // Grand total footer
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#10B981').text(`TOTAL: $${grandTotal.toLocaleString('es-CO')} COP`, { align: 'right' });

    doc.end();
});

export default router;
