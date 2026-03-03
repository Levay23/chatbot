import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    LayoutDashboard, Users, Grid, MessageSquare, Settings,
    RefreshCw, Plus, Volume2, VolumeX, Bell, FileText,
    ChevronDown, Folder, Edit3, Trash, Save, Search, TrendingUp,
    Download, Star, BarChart2, Mic, Type, MessageSquarePlus
} from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);
import api from '../api/axios';
import logo from '../logo.png';
import { OrderCard, OrderColumn } from '../components/OrderBoard';
import { ManualOrderModal } from '../components/ManualOrderModal';
import { OrderDetailModal, ProductModal, DailySummaryModal, ReceiptModal } from '../components/DetailModals';

const formatCOP = (val) => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(val);
};

export default function Dashboard({ socket }) {
    const [activeTab, setActiveTab] = useState('pedidos');
    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [productos, setProductos] = useState([]);
    const [configBot, setConfigBot] = useState([]);
    const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
    const [connError, setConnError] = useState(false);

    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [isReceiptOpen, setIsReceiptOpen] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [editingProduct, setEditingProduct] = useState(null);
    const [expandedDays, setExpandedDays] = useState({});
    const [localActivos, setLocalActivos] = useState({});
    const [isSavingMenu, setIsSavingMenu] = useState(false);

    // Clientes
    const [clientes, setClientes] = useState([]);
    const [selectedClients, setSelectedClients] = useState([]);
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [broadcastResult, setBroadcastResult] = useState(null);

    // Stats / Reportes
    const [stats, setStats] = useState(null);
    const [reportPeriod, setReportPeriod] = useState('7d');
    const [reportTab, setReportTab] = useState('diario');
    const [exportDateFrom, setExportDateFrom] = useState(new Date().toISOString().split('T')[0]);
    const [exportDateTo, setExportDateTo] = useState(new Date().toISOString().split('T')[0]);


    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const fetchSafe = async (endpoint) => {
                try {
                    const res = await api.get(endpoint);
                    return res.data;
                } catch (err) {
                    console.error(`Error fetching ${endpoint}:`, err);
                    return [];
                }
            };

            const [ordersData, productsData, configData, clientsData] = await Promise.all([
                fetchSafe('/orders'),
                fetchSafe('/products'),
                fetchSafe('/config'),
                fetchSafe('/customers')
            ]);

            setOrders(ordersData);
            setProductos(productsData);
            setConfigBot(configData);
            setClientes(clientsData);

            const initialActivos = {};
            productsData.forEach(p => initialActivos[p.id] = !!p.active);
            setLocalActivos(initialActivos);
        } catch (error) {
            console.error('Error general in fetchData:', error);
            if (!error.response) setConnError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async (period = '7d') => {
        try {
            const res = await api.get(`/reports/stats?period=${period}`);
            setStats(res.data);
        } catch (e) { console.error('Stats error', e); }
    }, []);

    const handleExport = async (format) => {
        const token = localStorage.getItem('token');
        const url = `/api/reports/export/${format}?from=${exportDateFrom}&to=${exportDateTo}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const blob = await res.blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = `reporte_${exportDateFrom}_${exportDateTo}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        a.click();
    };


    useEffect(() => {
        fetchData();
        fetchStats(reportPeriod);
        if (socket) {
            socket.on('new_order', () => { fetchData(); if (isVoiceEnabled) speakNewOrder(); });
            socket.on('order_updated', () => fetchData());
            socket.on('order_deleted', () => fetchData());
        }
        return () => {
            if (socket) {
                socket.off('new_order');
                socket.off('order_updated');
                socket.off('order_deleted');
            }
        };
    }, [socket, fetchData, isVoiceEnabled]);

    useEffect(() => { fetchStats(reportPeriod); }, [reportPeriod, fetchStats]);


    const speakNewOrder = () => {
        const msg = new SpeechSynthesisUtterance("¡Nuevo pedido recibido!");
        msg.lang = 'es-ES';
        msg.rate = 1;
        window.speechSynthesis.speak(msg);
    };

    const updateOrderStatus = async (id, status) => {
        try {
            await api.post(`/orders/${id}/estado`, { estado: status });
            fetchData();
        } catch (error) {
            console.error('Error updating status:', error);
        }
    };

    const deleteOrder = async (id) => {
        if (!window.confirm('¿Eliminar este pedido permanentemente?')) return;
        try {
            await api.delete(`/orders/${id}`);
            fetchData();
        } catch (error) {
            console.error('Error deleting order:', error);
        }
    };

    const deleteCustomer = async (id) => {
        if (!window.confirm('¿Eliminar este cliente y todo su historial de mensajes y pedidos? Esta acción no se puede deshacer.')) return;
        try {
            await api.delete(`/customers/${id}`);
            fetchData();
            setSelectedClients(prev => prev.filter(c => c !== id));
        } catch (e) {
            console.error('Delete customer error', e);
            alert('Error al eliminar cliente: ' + (e.response?.data?.error || e.message));
        }
    };

    const handleManualSubmit = async (data) => {
        try {
            await api.post('/orders', data);
            setIsModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error creating order:', error);
        }
    };

    const handleProductSubmit = async (p) => {
        try {
            if (p.id) {
                await api.put(`/products/${p.id}`, p);
            } else {
                await api.post('/products', p);
            }
            setIsProductModalOpen(false);
            fetchData();
        } catch (error) {
            console.error('Error saving product:', error);
        }
    };

    const deleteProduct = async (id) => {
        if (!window.confirm('¿Eliminar este producto?')) return;
        try {
            await api.delete(`/products/${id}`);
            fetchData();
        } catch (error) {
            console.error('Error deleting product:', error);
        }
    };

    const updateBotConfig = async (key, value) => {
        try {
            await api.put(`/config/${key}`, { value });
            setConfigBot(prev => prev.map(c => c.key === key ? { ...c, value } : c));
        } catch (error) {
            console.error('Error updating config:', error);
        }
    };

    const saveMenuAvailability = async () => {
        setIsSavingMenu(true);
        try {
            const updates = Object.entries(localActivos).map(([id, active]) => ({
                id, active: active ? 1 : 0
            }));
            await api.put('/products/bulk/availability', { products: updates });
            alert("✅ ¡Menú del día guardado con éxito!");
            fetchData();
        } catch (error) {
            console.error('Error saving availability:', error);
            alert("❌ Error al guardar la configuración.");
        } finally {
            setIsSavingMenu(false);
        }
    };



    const renameCategory = async (oldName, newName) => {
        if (!newName || newName === oldName) return;
        try {
            await api.put('/products/category/rename', { oldCategory: oldName, newCategory: newName });
            fetchData();
        } catch (error) {
            console.error('Error renaming category:', error);
        }
    };

    const toggleCategory = (cat, active) => {
        const updates = { ...localActivos };
        productos.filter(p => p.category === cat).forEach(p => {
            updates[p.id] = active;
        });
        setLocalActivos(updates);
    };

    const renderPedidos = () => {
        const pending = orders.filter(o => o.status === 'PENDING').sort((a, b) => b.id - a.id);
        const preparing = orders.filter(o => o.status === 'PREPARING');
        const ready = orders.filter(o => o.status === 'READY');

        return (
            <div className="flex gap-10 h-full">
                <OrderColumn title="NUEVOS PEDIDOS" count={pending.length} color="border-sky-500/20 bg-sky-500/5" headerColor="text-sky-400">
                    {pending.map(o => (
                        <OrderCard
                            key={o.id}
                            order={o}
                            nextLabel="ACEPTAR"
                            onMove={() => updateOrderStatus(o.id, 'PREPARING')}
                            onDelete={() => deleteOrder(o.id)}
                            onDetail={(o) => { setSelectedOrder(o); setIsDetailOpen(true); }}
                            onReceipt={(url) => { setSelectedReceipt(url); setIsReceiptOpen(true); }}
                            formatCOP={formatCOP}
                        />
                    ))}
                </OrderColumn>

                <OrderColumn title="EN COCINA" count={preparing.length} color="border-amber-500/20 bg-amber-500/5" headerColor="text-amber-400">
                    {preparing.map(o => (
                        <OrderCard key={o.id} order={o} nextLabel="LISTO" onMove={() => updateOrderStatus(o.id, 'READY')} onDelete={() => deleteOrder(o.id)} onDetail={(o) => { setSelectedOrder(o); setIsDetailOpen(true); }} formatCOP={formatCOP} />
                    ))}
                </OrderColumn>

                <OrderColumn title="LISTOS / DESPACHADOS" count={ready.length} color="border-emerald-500/20 bg-emerald-500/5" headerColor="text-emerald-400">
                    {ready.map(o => (
                        <OrderCard key={o.id} order={o} nextLabel="ENTREGAR" onMove={() => updateOrderStatus(o.id, 'DELIVERED')} onDelete={() => deleteOrder(o.id)} onDetail={(o) => { setSelectedOrder(o); setIsDetailOpen(true); }} formatCOP={formatCOP} />
                    ))}
                </OrderColumn>

                <div className="w-[180px] flex-shrink-0 flex flex-col gap-4">
                    <button onClick={() => setIsSummaryOpen(true)} className="w-full bg-slate-800 hover:bg-slate-700 p-6 rounded-3xl border border-slate-700 flex flex-col items-center gap-2 group transition-all">
                        <FileText className="text-slate-500 group-hover:text-emerald-400" size={32} />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Cierre de Caja</span>
                    </button>
                    <button onClick={() => fetchData()} className="w-full bg-slate-800 hover:bg-slate-700 p-6 rounded-3xl border border-slate-700 flex flex-col items-center gap-2 group transition-all">
                        <RefreshCw className={`text-slate-500 group-hover:text-sky-400 ${loading ? 'animate-spin' : ''}`} size={32} />
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Sincronizar</span>
                    </button>
                </div>
            </div>
        );
    };

    const renderFacturacion = () => {
        const facturados = orders.filter(o => o.status === 'DELIVERED');
        const historicalTotal = facturados.reduce((sum, o) => sum + o.total, 0);

        const groups = facturados.reduce((acc, o) => {
            const date = new Date(o.created_at).toLocaleDateString();
            if (!acc[date]) acc[date] = [];
            acc[date].push(o);
            return acc;
        }, {});
        const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

        // Chart data
        const chartLabels = stats?.dailySales?.map(d => d.date) || [];
        const chartRevenue = stats?.dailySales?.map(d => d.revenue) || [];
        const chartData = {
            labels: chartLabels,
            datasets: [{
                label: 'Ingresos COP',
                data: chartRevenue,
                fill: true,
                borderColor: '#10B981',
                backgroundColor: 'rgba(16,185,129,0.08)',
                tension: 0.4, pointBackgroundColor: '#10B981', pointRadius: 4
            }]
        };
        const chartOptions = {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `$${ctx.raw.toLocaleString('es-CO')} COP` } } },
            scales: {
                x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#94a3b8', font: { size: 10 }, callback: v => `$${(v / 1000).toFixed(0)}k` } }
            }
        };

        return (
            <div className="w-full max-w-6xl space-y-6">

                {/* Summary cards row */}
                <div className="grid grid-cols-3 gap-4">
                    {[{ label: 'Hoy', rev: stats?.today?.rev, cnt: stats?.today?.cnt },
                    { label: 'Esta semana', rev: stats?.week?.rev, cnt: stats?.week?.cnt },
                    { label: 'Este mes', rev: stats?.month?.rev, cnt: stats?.month?.cnt }].map(p => (
                        <div key={p.label} className="bg-slate-800/50 border border-slate-700/40 rounded-2xl p-5">
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">{p.label}</p>
                            <p className="text-2xl font-black text-emerald-400">{p.rev ? `$${Number(p.rev).toLocaleString('es-CO')}` : '—'}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{p.cnt || 0} pedidos</p>
                        </div>
                    ))}
                </div>

                {/* Chart + Top Products */}
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-bold text-white flex items-center gap-2"><BarChart2 size={16} className="text-emerald-400" /> Ingresos diarios</p>
                            <div className="flex gap-1">
                                {['7d', '30d'].map(p => (
                                    <button key={p} onClick={() => setReportPeriod(p)}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${reportPeriod === p ? 'bg-emerald-500 text-black' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}>
                                        {p === '7d' ? '7 días' : '30 días'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="h-44">
                            {chartLabels.length > 0
                                ? <Line data={chartData} options={chartOptions} />
                                : <div className="h-full flex items-center justify-center text-slate-600 text-sm">Sin datos para mostrar</div>}
                        </div>
                    </div>
                    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5">
                        <p className="text-sm font-bold text-white flex items-center gap-2 mb-4"><Star size={14} className="text-yellow-400" /> Top Productos</p>
                        <div className="space-y-3">
                            {(stats?.topProducts || []).map((p, i) => (
                                <div key={p.name} className="flex items-center gap-2">
                                    <span className="text-xs font-black text-slate-600 w-4">{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-white truncate">{p.name.replace(/🍗|🥩|🍲/g, '').trim()}</p>
                                        <p className="text-[10px] text-slate-500">{p.total_qty} unidades</p>
                                    </div>
                                    <span className="text-xs font-bold text-emerald-400">${Number(p.revenue).toLocaleString('es-CO')}</span>
                                </div>
                            ))}
                            {(!stats?.topProducts?.length) && <p className="text-slate-600 text-xs">Sin ventas aún</p>}
                        </div>
                    </div>
                </div>

                {/* Export section */}
                <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Download size={12} /> Exportar Reporte</p>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500">Desde:</label>
                            <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500" />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500">Hasta:</label>
                            <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500" />
                        </div>
                        <button onClick={() => handleExport('excel')}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all">
                            <Download size={12} /> Excel (.xlsx)
                        </button>
                        <button onClick={() => handleExport('pdf')}
                            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all">
                            <Download size={12} /> PDF
                        </button>
                    </div>
                </div>

                {/* Historical by date accordion */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 rounded-2xl border border-slate-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-1 flex items-center gap-2"><TrendingUp size={14} className="text-emerald-500" /> Gran Total Histórico</h3>
                        <p className="text-4xl font-black text-emerald-400 tracking-tighter">{formatCOP(historicalTotal || 0)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Pedidos Finalizados</p>
                        <p className="text-3xl font-black text-white">{facturados.length}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {sortedDates.map(date => {
                        const dayOrders = groups[date];
                        const dayTotal = dayOrders.reduce((sum, o) => sum + o.total, 0);
                        const isExpanded = expandedDays[date];
                        return (
                            <div key={date} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden transition-all hover:border-slate-600">
                                <button onClick={() => setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }))} className="w-full flex items-center justify-between p-5 hover:bg-slate-700/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-xl border ${isExpanded ? 'bg-sky-500/20 border-sky-500/30 text-sky-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}><Folder size={18} /></div>
                                        <div className="text-left">
                                            <p className="text-sm font-black text-slate-200">{date}</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{dayOrders.length} PEDIDOS COMPLETADOS</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <p className="text-xl font-black text-emerald-400">{formatCOP(dayTotal || 0)}</p>
                                        <ChevronDown size={20} className={`text-slate-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                {isExpanded && (
                                    <div className="animate-in slide-in-from-top-4 duration-300">
                                        <table className="w-full text-left border-t border-slate-800/50">
                                            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest">
                                                <tr>
                                                    <th className="p-4 pl-10">ID Orden</th><th className="p-4">Cliente</th>
                                                    <th className="p-4">Método de Pago</th><th className="p-4 text-right">Total</th>
                                                    <th className="p-4 pr-10 text-right">Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {dayOrders.map(o => (
                                                    <tr key={o.id} className="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors group">
                                                        <td className="p-4 pl-10 text-slate-600 font-mono text-xs">#{o.id}</td>
                                                        <td className="p-4 font-bold text-slate-200">{o.cliente}</td>
                                                        <td className="p-4">
                                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${o.payment_method === 'Efectivo' ? 'bg-amber-500/5 text-amber-500/70 border-amber-500/10' : 'bg-sky-500/5 text-sky-400/70 border-sky-500/10'}`}>{o.payment_method?.toUpperCase()}</span>
                                                        </td>
                                                        <td className="p-4 text-right font-black text-emerald-400">{formatCOP(o.total || 0)}</td>
                                                        <td className="p-4 pr-10 text-right">
                                                            <button onClick={() => { setSelectedOrder(o); setIsDetailOpen(true); }}
                                                                className="text-[10px] font-black text-sky-400 hover:text-sky-300 uppercase tracking-widest bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/20 opacity-0 group-hover:opacity-100">
                                                                Ver Recibo
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };


    const renderProductos = () => {
        const categories = [...new Set(productos.map(p => p.category))];
        return (
            <div className="w-full max-w-5xl space-y-8">
                <div className="flex justify-between items-center bg-slate-900/40 p-6 rounded-[2rem] border border-slate-800 shadow-xl">
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Panel de Disponibilidad</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Control instantáneo del menú</p>
                    </div>
                    <div className="flex gap-4">
                        <button onClick={saveMenuAvailability} disabled={isSavingMenu} className={`flex items-center gap-3 ${isSavingMenu ? 'bg-slate-700' : 'bg-sky-500 hover:bg-sky-400 shadow-sky-500/20 shadow-lg'} text-white px-6 py-3 rounded-2xl font-black text-xs transition-all active:scale-95`}>
                            {isSavingMenu ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />} GUARDAR CONFIGURACIÓN DE HOY
                        </button>
                        <button onClick={() => { setEditingProduct(null); setIsProductModalOpen(true); }} className="flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-3 rounded-2xl font-black text-xs transition-all shadow-emerald-500/20 shadow-lg active:scale-95"><Plus size={18} /> NUEVO PRODUCTO</button>
                    </div>
                </div>

                <div className="space-y-10 pb-20">
                    {categories.sort().map(cat => (
                        <div key={cat} className="bg-slate-800/10 rounded-[2rem] border border-slate-700/50 overflow-hidden shadow-inner">
                            <div className="bg-slate-800/60 px-8 py-5 flex items-center justify-between border-b border-slate-700/50">
                                <div className="flex items-center gap-4">
                                    <input
                                        type="checkbox"
                                        checked={productos.filter(p => p.category === cat).every(p => localActivos[p.id])}
                                        onChange={(e) => toggleCategory(cat, e.target.checked)}
                                        className="w-5 h-5 rounded border-emerald-500/50 bg-slate-900 text-emerald-500 focus:ring-emerald-500 transition-all cursor-pointer"
                                        title="Activar/Desactivar toda la categoría"
                                    />
                                    <div className="flex items-center gap-2">
                                        <Grid size={14} className="text-emerald-400" />
                                        <input
                                            type="text"
                                            defaultValue={cat || 'SIN CATEGORÍA'}
                                            onBlur={(e) => renameCategory(cat, e.target.value)}
                                            className="bg-transparent border-none text-xs font-black text-emerald-400 uppercase tracking-[0.2em] focus:ring-0 focus:outline-none w-auto min-w-[150px] cursor-edit hover:bg-slate-700/50 rounded px-2 py-1 transition-all"
                                            title="Haz clic para renombrar esta categoría"
                                        />
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-900/50 px-3 py-1 rounded-full border border-slate-700">
                                    {productos.filter(p => p.category === cat).length} Ítems
                                </span>
                            </div>
                            <table className="w-full text-left">
                                <thead className="text-[10px] text-slate-500 uppercase font-black tracking-widest">
                                    <tr className="border-b border-slate-700/30">
                                        <th className="p-5 pl-10 w-20 text-center">Disp.</th>
                                        <th className="p-5 w-24">ID</th>
                                        <th className="p-5">Nombre del Producto</th>
                                        <th className="p-5">Precio Unitario</th>
                                        <th className="p-5 text-right pr-10">Gestionar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/30">
                                    {productos.filter(p => p.category === cat).map(p => (
                                        <tr key={p.id} className={`group hover:bg-slate-700/20 transition-all ${!localActivos[p.id] ? 'opacity-40 grayscale-0 bg-slate-900/20' : ''}`}>
                                            <td className="p-5 pl-10 text-center">
                                                <div className="flex justify-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={localActivos[p.id]}
                                                        onChange={() => setLocalActivos({ ...localActivos, [p.id]: !localActivos[p.id] })}
                                                        className="w-6 h-6 rounded-lg bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 transition-all cursor-pointer shadow-xl"
                                                    />
                                                </div>
                                            </td>
                                            <td className="p-5 text-xs font-mono text-slate-600">#{p.id}</td>
                                            <td className="p-5 font-black text-slate-200 group-hover:text-white transition-colors uppercase tracking-tight">{p.name}</td>
                                            <td className="p-5 font-black text-emerald-400 tracking-tighter">{formatCOP(p.price)}</td>
                                            <td className="p-5 text-right pr-10">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setEditingProduct(p); setIsProductModalOpen(true); }} className="p-2.5 text-sky-400 hover:bg-sky-500/10 rounded-xl border border-transparent hover:border-sky-500/20 transition-all shadow-lg active:scale-90"><Edit3 size={16} /></button>
                                                    <button onClick={() => deleteProduct(p.id)} className="p-2.5 text-red-500 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all shadow-lg active:scale-90"><Trash size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderConfigBot = () => (
        <div className="bg-slate-800/40 rounded-3xl border border-slate-700/50 p-8 w-full max-w-5xl space-y-10">
            <div className="flex items-center gap-4">
                <div className="p-4 bg-sky-500/20 text-sky-400 rounded-3xl shadow-xl shadow-sky-500/5 border border-sky-500/10"><MessageSquare size={32} /></div>
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Personalidad del AI</h2>
                    <p className="text-slate-400 text-sm">Configura los mensajes clave y el especial del día.</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {configBot.map(item => (
                    <div key={item.key} className={`bg-slate-900/60 p-8 rounded-[2rem] border space-y-5 shadow-2xl relative group ${item.key === 'producto_del_dia' ? 'border-yellow-500/30 shadow-yellow-500/5' : 'border-slate-800'
                        }`}>
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] px-3 py-1.5 bg-slate-800 rounded-lg w-fit block border border-slate-700 shadow-sm">{item.key.replace(/_/g, ' ')}</label>
                            {item.key === 'producto_del_dia' && (
                                <span className="text-[9px] font-black text-yellow-400 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-1">
                                    <Star size={9} /> ESPECIAL DEL DÍA
                                </span>
                            )}
                        </div>
                        <textarea
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-5 text-sm text-slate-300 focus:border-sky-500/50 outline-none resize-none transition-all focus:ring-4 focus:ring-sky-500/5"
                            rows={item.key === 'producto_del_dia' ? 2 : 5}
                            defaultValue={item.value}
                            placeholder={item.key === 'producto_del_dia' ? 'Ej: Pollo entero con yuca y ensalada $40.000 - hoy con 10% descuento' : ''}
                            onBlur={e => updateBotConfig(item.key, e.target.value)}
                        />
                        <div className="absolute top-8 right-8 text-slate-700 group-focus-within:text-sky-500 transition-colors">
                            <Save size={16} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderSettings = () => (
        <div className="w-full max-w-4xl space-y-8">
            <div className="bg-slate-800/40 p-10 rounded-[3rem] border border-slate-700/50">
                <div className="flex items-center gap-6 mb-10">
                    <div className="p-5 bg-emerald-500/10 text-emerald-500 rounded-3xl border border-emerald-500/20 shadow-xl">
                        <Settings size={40} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Ajustes Técnicos</h2>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Configuración del núcleo del sistema</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-slate-900/60 p-8 rounded-[2rem] border border-slate-800 flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-800 rounded-2xl text-slate-400 group-hover:text-emerald-400 transition-colors">
                                <RefreshCw size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-black text-white uppercase tracking-tight">Reiniciar Sincronización</p>
                                <p className="text-xs text-slate-500">Vuelve a cargar todos los datos desde el servidor.</p>
                            </div>
                        </div>
                        <button onClick={fetchData} className="px-6 py-3 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Ejecutar</button>
                    </div>

                    <div className="bg-slate-900/60 p-8 rounded-[2rem] border border-slate-800 flex items-center justify-between group hover:border-sky-500/30 transition-all opacity-50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-800 rounded-2xl text-slate-400">
                                <Users size={24} />
                            </div>
                            <div>
                                <p className="text-sm font-black text-white uppercase tracking-tight">Gestión de Roles</p>
                                <p className="text-xs text-slate-500 italic">Próximamente: Configura múltiples administradores.</p>
                            </div>
                        </div>
                        <span className="px-4 py-1.5 bg-slate-800 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-700">BLOQUEADO</span>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-800 text-center">
                    <p className="text-[10px] text-slate-600 font-black uppercase tracking-[0.4em]">ChatIA Restaurant Engine v2.4.0 (Stable)</p>
                </div>
            </div>
        </div>
    );


    const toggleClientSelect = (id) => {
        setSelectedClients(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const selectAllClients = () => {
        if (selectedClients.length === clientes.length) setSelectedClients([]);
        else setSelectedClients(clientes.map(c => c.id));
    };

    const sendBroadcast = async () => {
        if (!broadcastMsg.trim() || selectedClients.length === 0) return;
        setIsSending(true);
        setBroadcastResult(null);
        try {
            const res = await api.post('/customers/broadcast', { ids: selectedClients, message: broadcastMsg });
            setBroadcastResult(res.data);
            setBroadcastMsg('');
            setSelectedClients([]);
        } catch (err) {
            setBroadcastResult({ error: err.response?.data?.error || 'Error al enviar' });
        } finally {
            setIsSending(false);
        }
    };

    const renderClientes = () => (
        <div className="w-full max-w-6xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Clientes</h2>
                    <p className="text-slate-500 text-sm mt-1">{clientes.length} contactos registrados</p>
                </div>
            </div>

            {/* Broadcast composer */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-5 space-y-3">
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">📢 Enviar mensaje por WhatsApp</p>
                <textarea
                    value={broadcastMsg}
                    onChange={e => setBroadcastMsg(e.target.value)}
                    placeholder={selectedClients.length === 0 ? 'Selecciona clientes en la tabla y escribe tu mensaje aquí...' : `Mensaje para ${selectedClients.length} cliente(s) seleccionado(s)...`}
                    rows={3}
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                />
                <div className="flex items-center gap-3">
                    <button
                        onClick={sendBroadcast}
                        disabled={isSending || !broadcastMsg.trim() || selectedClients.length === 0}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold text-sm transition-all flex items-center gap-2"
                    >
                        {isSending ? '⏳ Enviando...' : `📩 Enviar a ${selectedClients.length || 0} cliente(s)`}
                    </button>
                    {selectedClients.length > 0 && (
                        <button onClick={() => setSelectedClients([])} className="text-slate-500 hover:text-white text-xs underline">Deseleccionar todos</button>
                    )}
                </div>
                {broadcastResult && (
                    <div className={`rounded-xl px-4 py-2 text-sm font-medium ${broadcastResult.error ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {broadcastResult.error
                            ? `❌ Error: ${broadcastResult.error}`
                            : `✅ Enviados: ${broadcastResult.sent} | Fallaron: ${broadcastResult.failed}`
                        }
                    </div>
                )}
            </div>

            {/* Customers table */}
            <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-700/50">
                            <th className="p-4 text-left w-10">
                                <input type="checkbox" checked={selectedClients.length === clientes.length && clientes.length > 0}
                                    onChange={selectAllClients} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
                            </th>
                            <th className="p-4 text-left text-slate-400 font-semibold">Cliente</th>
                            <th className="p-4 text-left text-slate-400 font-semibold">Teléfono</th>
                            <th className="p-4 text-left text-slate-400 font-semibold">Dirección</th>
                            <th className="p-4 text-center text-slate-400 font-semibold">Pedidos</th>
                            <th className="p-4 text-right text-slate-400 font-semibold">Total gastado</th>
                            <th className="p-4 text-right text-slate-400 font-semibold">Último pedido</th>
                            <th className="p-4 text-right text-slate-400 font-semibold w-10">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clientes.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="text-center py-16 text-slate-600">No hay clientes registrados aún.</td>
                            </tr>
                        ) : clientes.map(c => (
                            <tr key={c.id}
                                onClick={() => toggleClientSelect(c.id)}
                                className={`border-b border-slate-700/30 cursor-pointer transition-colors ${selectedClients.includes(c.id) ? 'bg-emerald-500/10 border-emerald-500/20' : 'hover:bg-slate-700/20'
                                    }`}
                            >
                                <td className="p-4">
                                    <input type="checkbox" checked={selectedClients.includes(c.id)}
                                        onChange={() => toggleClientSelect(c.id)}
                                        onClick={e => e.stopPropagation()}
                                        className="w-4 h-4 accent-emerald-500" />
                                </td>
                                <td className="p-4">
                                    <span className="font-semibold text-white">{c.name || <span className="text-slate-500 italic">Sin nombre</span>}</span>
                                </td>
                                <td className="p-4 text-slate-400 font-mono text-xs">{c.phone?.replace('@c.us', '')}</td>
                                <td className="p-4 text-slate-400 max-w-xs truncate">{c.address || <span className="text-slate-600 italic">—</span>}</td>
                                <td className="p-4 text-center">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${c.total_orders > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700/50 text-slate-500'
                                        }`}>{c.total_orders}</span>
                                </td>
                                <td className="p-4 text-right text-white font-mono">
                                    {c.total_spent > 0 ? `$${Number(c.total_spent).toLocaleString('es-CO')}` : <span className="text-slate-600">—</span>}
                                </td>
                                <td className="p-4 text-right text-slate-500 text-xs">
                                    {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('es-CO') : '—'}
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteCustomer(c.id); }}
                                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                        title="Eliminar Cliente"
                                    >
                                        <Trash size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-[#060b18] text-slate-200 overflow-hidden font-sans selection:bg-emerald-500/30">
            {/* Ambient background glows */}
            <div className="fixed top-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-500/5 blur-[120px] rounded-full"></div>
            <div className="fixed bottom-[-10%] left-[-10%] w-[30%] h-[30%] bg-sky-500/5 blur-[100px] rounded-full"></div>

            <aside className="w-72 bg-slate-900 border-r border-slate-800/50 flex flex-col relative z-20 shadow-2xl">
                <div className="p-10 pb-6 flex flex-col items-center gap-6">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-tr from-emerald-500 to-sky-500 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                        <img src={logo} className="w-28 h-28 object-contain relative bg-slate-900 rounded-[2rem] p-4 border border-slate-800" alt="Logo" />
                    </div>
                    <div className="text-center">
                        <span className="text-xs font-black text-white uppercase tracking-[0.3em] block">RINCON SANCOCHO</span>
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Panel Administrativo</span>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 px-6 py-10 space-y-2 overflow-y-auto custom-scrollbar">
                    {[
                        { id: 'pedidos', icon: LayoutDashboard, label: 'Control Maestro' },
                        { id: 'facturacion', icon: FileText, label: 'Facturación' },
                        { id: 'productos', icon: Grid, label: 'Catálogo & Precios' },
                        { id: 'cms-bot', icon: MessageSquare, label: 'Entrenamiento AI' },
                        { id: 'clientes', icon: Users, label: 'Base de Clientes' },
                        { id: 'settings', icon: Settings, label: 'Ajustes Técnicos' }
                    ].map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all group ${activeTab === item.id
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 shadow-xl shadow-emerald-500/10 border-t border-white/20'
                                : 'text-slate-500 hover:text-white hover:bg-slate-800 border border-transparent'
                                }`}
                        >
                            <span className="flex items-center gap-4">
                                <item.icon size={18} className={activeTab === item.id ? 'text-slate-950' : 'group-hover:text-emerald-400 transition-colors'} />
                                {item.label}
                            </span>
                        </button>
                    ))}
                </nav>

                <div className="p-6 border-t border-slate-800/50 bg-slate-950/20">
                    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-5 space-y-4 shadow-xl">
                        <div className="flex justify-between items-center px-2">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">BOT IA STATUS</span>
                            {configBot.find(c => c.key === 'bot_active')?.value === 'true' ? (
                                <div className="flex items-center gap-2 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[8px] font-black text-emerald-500">ACTIVO</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                    <span className="text-[8px] font-black text-red-500 uppercase">Apagado</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => {
                                const current = configBot.find(c => c.key === 'bot_active')?.value === 'true';
                                updateBotConfig('bot_active', current ? 'false' : 'true');
                            }}
                            className={`w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-xl ${configBot.find(c => c.key === 'bot_active')?.value === 'true'
                                ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-t border-white/30'
                                }`}
                        >
                            {configBot.find(c => c.key === 'bot_active')?.value === 'true' ? 'Apagar Sistema' : 'Encender Sistema'}
                        </button>

                        <div className="space-y-3 pt-4 border-t border-slate-800/50">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-2 block">Modo de Respuesta</span>
                            <div className="grid grid-cols-3 gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700/30">
                                {[
                                    { id: 'text', label: 'TXT', icon: Type },
                                    { id: 'both', label: 'T+V', icon: MessageSquarePlus },
                                    { id: 'voice', label: 'VOZ', icon: Mic }
                                ].map(m => {
                                    const active = (configBot.find(c => c.key === 'bot_voice_mode')?.value || 'text') === m.id;
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => updateBotConfig('bot_voice_mode', m.id)}
                                            className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-all ${active
                                                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/10'
                                                : 'text-slate-500 hover:text-slate-400 hover:bg-slate-700/50'
                                                }`}
                                            title={m.label === 'TXT' ? 'Solo Texto' : m.label === 'T+V' ? 'Texto + Voz' : 'Solo Voz'}
                                        >
                                            <m.icon size={14} />
                                            <span className="text-[7px] font-black">{m.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all ${isVoiceEnabled ? 'text-emerald-500 hover:text-emerald-400' : 'text-slate-700 hover:text-slate-600'}`}>
                            {isVoiceEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />} Avisos {isVoiceEnabled ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col relative z-10 overflow-hidden bg-slate-950/40 shadow-2xl">
                <header className="h-24 border-b border-slate-800/50 flex items-center justify-between px-12 bg-slate-900/60 backdrop-blur-2xl relative z-10">
                    <div className="flex items-center gap-10">
                        <div>
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-1">Módulo Actual</p>
                            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
                                {activeTab === 'pedidos' ? 'Gestión de Operaciones' :
                                    activeTab === 'facturacion' ? 'Facturación & Reportes' :
                                        activeTab === 'productos' ? 'Menú & Existencias' : 'Configuración Maestra'}
                            </h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-3 rounded-2xl font-black text-[10px] shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all border-t border-white/20 uppercase tracking-widest whitespace-nowrap">
                                <Plus size={18} /> Venta Manual
                            </button>
                            <button onClick={() => setIsSummaryOpen(true)} className="flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-emerald-400 px-6 py-3 rounded-2xl font-black text-[10px] shadow-xl border border-slate-700 active:scale-95 transition-all uppercase tracking-widest whitespace-nowrap">
                                <FileText size={18} /> Cierre Diario
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-6 bg-slate-800/30 pl-6 pr-2 py-2 rounded-2xl border border-slate-800 group hover:border-slate-700 transition-all">
                        <div className="flex flex-col text-right">
                            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">Administrador</span>
                            <span className="text-sm font-black text-white tracking-tight">Caja Principal</span>
                        </div>
                        <div className="w-12 h-12 bg-gradient-to-tr from-emerald-400 to-sky-500 rounded-xl flex items-center justify-center font-black text-slate-950 shadow-lg shadow-emerald-500/10 group-hover:scale-105 transition-transform">
                            A
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-12 overflow-auto custom-scrollbar bg-slate-950/10">
                    {loading && orders.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-6 opacity-40">
                            <div className="relative">
                                <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
                                <RefreshCw className="animate-spin text-emerald-400 relative" size={64} />
                            </div>
                            <p className="text-xs font-black text-emerald-500 uppercase tracking-[0.4em]">Sincronizando Base de Datos</p>
                        </div>
                    ) : connError ? (
                        <div className="h-full flex flex-col items-center justify-center animate-in zoom-in-95 duration-500">
                            <div className="bg-slate-900 p-16 rounded-[4rem] border border-red-500/20 text-center shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-red-500/50"></div>
                                <RefreshCw className="text-red-500 mx-auto mb-8 animate-[spin_3s_linear_infinite]" size={72} />
                                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Servidor Desconectado</h2>
                                <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed border-t border-slate-800 pt-6 font-medium">No hay comunicación con la API (Puerto 3000).<br /><span className="text-slate-600 font-bold">Verificar terminal backend.</span></p>
                                <button onClick={fetchData} className="mt-10 bg-white text-slate-950 px-12 py-4 rounded-2xl font-black text-xs hover:bg-red-500 hover:text-white transition-all shadow-xl active:scale-95 uppercase tracking-widest">Reintentar Enlace</button>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-6 duration-700 h-full">
                            {activeTab === 'pedidos' && renderPedidos()}
                            {activeTab === 'facturacion' && renderFacturacion()}
                            {activeTab === 'productos' && renderProductos()}
                            {activeTab === 'cms-bot' && renderConfigBot()}
                            {activeTab === 'clientes' && renderClientes()}
                            {activeTab === 'settings' && renderSettings()}
                        </div>
                    )}
                </div>
            </main>

            <ManualOrderModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} productos={productos} onSubmit={handleManualSubmit} formatCOP={formatCOP} />
            <OrderDetailModal order={selectedOrder} isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} logo={logo} formatCOP={formatCOP} />
            <ProductModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} product={editingProduct} onSubmit={handleProductSubmit} />
            <DailySummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} orders={orders} formatCOP={formatCOP} />
            <ReceiptModal isOpen={isReceiptOpen} onClose={() => setIsReceiptOpen(false)} imageUrl={selectedReceipt} />
        </div>
    );
}
