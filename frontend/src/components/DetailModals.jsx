import React from 'react';
import { Download, X, PieChart, TrendingUp, CreditCard, User, Calendar, ClipboardList } from 'lucide-react';
import { toPng } from 'html-to-image';

export function OrderDetailModal({ order, isOpen, onClose, logo, formatCOP }) {
    if (!isOpen || !order) return null;

    const downloadReceipt = async () => {
        const node = document.getElementById('receipt-content');
        if (!node) return;
        try {
            const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#0f172a' });
            const link = document.createElement('a');
            link.download = `Recibo-Orden-${order.id}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) { console.error(err); }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 my-8">
                <div id="receipt-content" className="p-10 bg-slate-900 relative">
                    {/* Decorative watermark */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
                        <ClipboardList size={300} />
                    </div>

                    <div className="text-center mb-8 border-b border-dashed border-slate-700/50 pb-8 relative z-10">
                        <div className="flex justify-center mb-6">
                            <div className="w-24 h-24 bg-slate-800 rounded-3xl p-4 border border-slate-700 shadow-xl text-center flex items-center justify-center">
                                <img src={logo} className="max-w-full max-h-full object-contain" alt="Logo" />
                            </div>
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-tighter uppercase leading-none">El Rincón del Sancocho</h2>
                        <p className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.3em] mt-2 italic">Comprobante Oficial de Venta</p>

                        <div className="mt-8 grid grid-cols-2 gap-6 text-left">
                            <div className="space-y-1">
                                <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-1.5">
                                    <User size={10} /> Cliente
                                </p>
                                <p className="text-sm font-bold text-slate-100">{order.cliente}</p>
                            </div>
                            <div className="space-y-1 text-right">
                                <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-1.5 justify-end">
                                    <Calendar size={10} /> Fecha/Hora
                                </p>
                                <p className="text-sm font-bold text-slate-100">{new Date(order.tiempo || order.created_at).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        <div className="grid grid-cols-12 text-[10px] font-black text-slate-500 uppercase border-b border-slate-800 pb-3 tracking-widest">
                            <div className="col-span-2">Cant</div>
                            <div className="col-span-7 px-2">Producto</div>
                            <div className="col-span-3 text-right">Total</div>
                        </div>
                        <div className="space-y-3">
                            {order.items && order.items.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-12 text-sm items-center">
                                    <div className="col-span-2 font-black text-emerald-500 bg-emerald-500/10 w-fit px-2 py-0.5 rounded text-[11px]">{item.cantidad}x</div>
                                    <div className="col-span-7 px-2 text-slate-200 font-medium">{item.nombre}</div>
                                    <div className="col-span-3 text-right font-black text-slate-400">{formatCOP(item.cantidad * item.precio)}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-10 pt-8 border-t border-dashed border-slate-700/50 space-y-4 relative z-10">
                        <div className="flex justify-between items-center text-slate-400">
                            <span className="text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                                <CreditCard size={12} /> Método de Pago:
                            </span>
                            <span className={`text-[10px] font-black px-3 py-1 rounded-full border ${order.payment_method?.toLowerCase().includes('efectivo')
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                                }`}>
                                {order.payment_method?.toUpperCase()}
                            </span>
                        </div>

                        {order.receipt && (
                            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <img src={order.receipt?.startsWith('http') ? order.receipt : `http://localhost:3000${order.receipt}`} alt="Thumbnail" className="w-12 h-12 object-cover rounded-lg border border-slate-700" />
                                    <div>
                                        <p className="text-[10px] font-black text-white uppercase tracking-wider">Comprobante Adjunto</p>
                                        <p className="text-[9px] text-slate-500 uppercase">Recibido vía WhatsApp</p>
                                    </div>
                                </div>
                                <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 animate-pulse">VERIFICADO</span>
                            </div>
                        )}

                        <div className="flex justify-between items-end pt-2">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Cancelado</p>
                                <p className="text-3xl font-black text-emerald-400 tracking-tighter leading-none">{formatCOP(order.total)}</p>
                            </div>
                            <div className="text-[9px] text-slate-600 font-black italic uppercase tracking-tighter text-right">
                                ID Orden: #{order.id}<br />
                                GRACIAS POR PREFERIRNOS
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-slate-950/50 border-t border-slate-800 flex gap-4">
                    <button
                        onClick={downloadReceipt}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl shadow-emerald-500/10 active:scale-[0.98]"
                    >
                        <Download size={18} /> Descargar Imagen
                    </button>
                    <button
                        onClick={onClose}
                        className="px-8 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all border border-slate-700 active:scale-[0.98]"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

export function ReceiptModal({ isOpen, onClose, imageUrl }) {
    if (!isOpen || !imageUrl) return null;
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-300" onClick={onClose}>
            <div className="relative max-w-4xl max-h-full flex flex-col items-center gap-6" onClick={e => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 text-white/50 hover:text-white transition-colors flex items-center gap-2 font-black text-xs uppercase tracking-widest"
                >
                    <X size={20} /> CERRAR VISTA
                </button>
                <div className="bg-slate-900 p-2 rounded-[2.5rem] border border-white/10 shadow-[0_30px_100px_rgba(0,0,0,0.8)] overflow-hidden">
                    <img src={imageUrl?.startsWith('http') ? imageUrl : `http://localhost:3000${imageUrl}`} alt="Recibo Full" className="max-w-full max-h-[80vh] object-contain rounded-[2rem]" />
                </div>
                <div className="bg-orange-600 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-2xl animate-bounce">
                    🏮 Por favor verifica estos datos en tu App de Banco
                </div>
            </div>
        </div>
    );
}

export function ProductModal({ isOpen, onClose, product, onSubmit }) {
    const [p, setP] = React.useState(product || { name: '', price: 0, category: '', active: 1 });
    React.useEffect(() => { setP(product || { name: '', price: 0, category: '', active: 1 }); }, [product]);
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-[2rem] shadow-2xl p-8 space-y-6 animate-in zoom-in-95 duration-300">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">{product ? 'Editar Producto' : 'Nuevo Producto'}</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Gestión de catálogo</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre</label>
                        <input
                            type="text"
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 outline-none transition-all"
                            placeholder="Ej: Sancocho Trifásico"
                            value={p.name}
                            onChange={e => setP({ ...p, name: e.target.value })}
                        />
                    </div>
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Precio</label>
                            <input
                                type="number"
                                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-slate-100 focus:border-emerald-500/50 outline-none transition-all"
                                value={p.price}
                                onChange={e => setP({ ...p, price: e.target.value })}
                            />
                        </div>
                        <div className="flex-1 space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Estado</label>
                            <select
                                className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-slate-100 focus:border-emerald-500/50 outline-none transition-all appearance-none"
                                value={p.active}
                                onChange={e => setP({ ...p, active: parseInt(e.target.value) })}
                            >
                                <option value={1}>✅ Disponible</option>
                                <option value={0}>❌ Agotado</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Categoría</label>
                        <input
                            type="text"
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl px-5 py-3 text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/50 outline-none transition-all"
                            placeholder="Ej: ALMUERZOS"
                            value={p.category}
                            onChange={e => setP({ ...p, category: e.target.value })}
                        />
                    </div>
                </div>
                <div className="flex gap-4 pt-2">
                    <button
                        onClick={() => onSubmit(p)}
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-2xl transition-all shadow-xl shadow-emerald-500/10 active:scale-[0.98]"
                    >
                        GUARDAR PRODUCTO
                    </button>
                </div>
            </div>
        </div>
    );
}

export function DailySummaryModal({ isOpen, onClose, orders, formatCOP }) {
    if (!isOpen) return null;
    const processed = orders.filter(o => o.status !== 'PENDING' && o.status !== 'CANCELLED');
    const total = processed.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const cash = processed.filter(o => o.payment_method === 'Efectivo').reduce((sum, o) => sum + parseFloat(o.total), 0);
    const transfer = processed.filter(o => o.payment_method !== 'Efectivo').reduce((sum, o) => sum + parseFloat(o.total), 0);

    const productCounts = {};
    processed.forEach(o => {
        if (o.items) {
            o.items.forEach(item => {
                const name = item.nombre;
                if (!productCounts[name]) productCounts[name] = 0;
                productCounts[name] += item.cantidad;
            });
        }
    });

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-[2.5rem] shadow-2xl p-10 animate-in zoom-in-95 duration-300 text-center flex flex-col max-h-[90vh]">
                <div className="mx-auto w-20 h-20 bg-sky-500/10 text-sky-400 rounded-3xl flex items-center justify-center mb-8 border border-sky-500/20 shadow-xl shadow-sky-500/5">
                    <PieChart size={40} />
                </div>
                <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter">Resumen de Cierre</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-[0.2em] mb-8">Análisis de ventas del día</p>

                <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-slate-800/40 p-5 rounded-3xl border border-slate-800 text-left">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                            💴 Efectivo
                        </p>
                        <p className="text-xl font-black text-amber-500 tracking-tight">{formatCOP(cash)}</p>
                    </div>
                    <div className="bg-slate-800/40 p-5 rounded-3xl border border-slate-800 text-left">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                            💳 Transf.
                        </p>
                        <p className="text-xl font-black text-sky-400 tracking-tight">{formatCOP(transfer)}</p>
                    </div>
                    <div className="bg-emerald-500/10 col-span-2 p-6 rounded-[2rem] border border-emerald-500/20 text-left relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                            <TrendingUp size={60} />
                        </div>
                        <p className="text-xs font-black text-emerald-500/70 uppercase tracking-[0.3em] mb-2">Total Recaudado</p>
                        <p className="text-4xl font-black text-emerald-400 tracking-tighter leading-none">{formatCOP(total)}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-8 text-left">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        Top Productos Vendidos
                    </h3>
                    <div className="space-y-2">
                        {Object.entries(productCounts).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                            <div key={name} className="flex justify-between items-center bg-slate-800/30 p-4 rounded-2xl border border-slate-800/50 hover:border-slate-700 transition-colors">
                                <span className="text-sm text-slate-200 font-bold">{name}</span>
                                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black px-3 py-1 rounded-lg border border-emerald-500/20">{count} Uds</span>
                            </div>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-5 rounded-2xl border border-slate-700 transition-all active:scale-[0.98]"
                >
                    Cerrar Informe
                </button>
            </div>
        </div>
    );
}
