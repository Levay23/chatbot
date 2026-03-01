import React from 'react';
import { Trash2, CreditCard, Smartphone, CheckCircle } from 'lucide-react';

export function OrderCard({ order, onMove, nextLabel, onDelete, onDetail, onReceipt, formatCOP }) {
    const d = new Date(order.tiempo || order.created_at);
    const timeStr = isNaN(d) ? '...' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isTransfer = order.payment_method?.toLowerCase().includes('transferencia');
    const hasReceipt = isTransfer && order.receipt;

    return (
        <div
            onClick={() => onDetail && onDetail(order)}
            className={`bg-slate-800 p-5 rounded-2xl border shadow-lg shadow-black/10 hover:shadow-2xl transition-all duration-300 group flex flex-col gap-3 relative overflow-hidden cursor-pointer
                ${hasReceipt ? 'border-orange-500 hover:border-orange-400 hover:shadow-orange-500/20' : 'border-slate-700/60 hover:border-emerald-500/20 hover:shadow-emerald-500/10'}`}
        >
            <div className={`absolute top-0 left-0 w-1.5 h-full transition-colors duration-300 ${hasReceipt ? 'bg-orange-500' : 'bg-slate-700 group-hover:bg-emerald-500'}`}></div>

            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 focus:outline-none"
                title="Eliminar Pedido"
            >
                <Trash2 size={16} />
            </button>

            {isTransfer && (
                <div className={`flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl text-center shadow-inner animate-pulse
                    ${hasReceipt ? 'bg-orange-600 text-white border-2 border-orange-400 shadow-orange-500/40' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'}`}
                >
                    <div className="flex items-center gap-2">
                        <CreditCard size={18} />
                        <span className="text-sm font-black uppercase tracking-[0.1em]">{hasReceipt ? '¡PAGO RECIBIDO!' : 'PAGO POR TRANSFERENCIA'}</span>
                    </div>
                    <span className="text-[10px] font-bold opacity-90">{hasReceipt ? 'VERIFICAR EN NEQUI AHORA' : 'ESPERANDO COMPROBANTE'}</span>
                </div>
            )}

            <div className="flex justify-between items-start pl-2">
                <div>
                    <span className="inline-block px-2 py-0.5 rounded bg-slate-900/80 text-[10px] font-bold tracking-widest text-slate-500 mb-2 border border-slate-700/50">
                        ORDEN #{order.id}
                    </span>
                    <h4 className="font-bold text-slate-100 text-lg leading-tight">{order.cliente}</h4>
                    <div className="flex items-center gap-2 mt-1 text-slate-400">
                        <Smartphone size={12} className="text-emerald-500/70" />
                        <span className="text-xs font-medium">{order.telefono}</span>
                    </div>
                </div>
                <span className="text-[10px] font-mono font-medium tracking-wide text-slate-400 bg-slate-900/50 px-2 py-1 rounded-md border border-slate-700">{timeStr}</span>
            </div>

            <div className="pl-2 mt-1">
                <div className="flex items-start gap-2 text-slate-300 bg-slate-900/30 p-2.5 rounded-xl border border-slate-700/30">
                    <span className="text-xs text-slate-500 mt-0.5">📍</span>
                    <p className="text-xs leading-relaxed italic">{order.direccion || 'Sin dirección'}</p>
                </div>
            </div>

            <div className="pl-2 mt-1">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">Pedido:</p>
                <div className="space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                    {order.items && order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-slate-700/20 px-2.5 py-1.5 rounded-lg border border-slate-700/20">
                            <span className="text-slate-200 font-medium tracking-tight">
                                <span className="text-emerald-400 font-bold mr-1.5">{item.cantidad}x</span>
                                {item.nombre}
                            </span>
                            <span className="text-slate-400">{formatCOP(item.cantidad * item.precio)}</span>
                        </div>
                    ))}
                </div>
            </div>

            {hasReceipt && (
                <div className="pl-2" onClick={e => e.stopPropagation()}>
                    <p className="text-[10px] text-orange-400 font-black uppercase tracking-widest mb-2">📎 Comprobante Recibido:</p>
                    <div
                        onClick={() => onReceipt && onReceipt(order.receipt)}
                        className="relative group/receipt overflow-hidden rounded-xl border-2 border-orange-500/40 cursor-zoom-in hover:border-orange-400 transition-all shadow-lg"
                    >
                        <img
                            src={order.receipt}
                            alt="Comprobante"
                            className="w-full max-h-32 object-cover transition-transform duration-500 group-hover/receipt:scale-110"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/receipt:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest bg-orange-600 px-3 py-1.5 rounded-lg shadow-xl">Ver en grande</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between pl-2 mt-2 pt-4 border-t border-slate-700/50">
                <div className="flex flex-col">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase w-fit mb-1 ${order.payment_method === 'Efectivo' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'}`}>
                        {order.payment_method || 'Efectivo'}
                    </span>
                    <div className="text-xl font-bold text-emerald-400 tracking-tight leading-none">{formatCOP(order.total)}</div>
                </div>
                {onMove && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onMove(); }}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black px-5 py-2.5 rounded-xl active:scale-95 shadow-[0_4px_15px_rgba(16,185,129,0.2)]"
                    >
                        {nextLabel} <CheckCircle size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

export function OrderColumn({ title, count, color, headerColor, children }) {
    return (
        <div className={`w-[360px] flex flex-col rounded-3xl border ${color} shadow-xl shadow-black/20 overflow-hidden h-full flex-shrink-0 backdrop-blur-md`}>
            <div className={`px-5 py-4 flex items-center justify-between border-b border-white/5 ${headerColor}`}>
                <h3 className="font-semibold text-sm tracking-wide">{title}</h3>
                <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-black/20 text-current border border-white/10">
                    {count}
                </span>
            </div>
            <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
                {children}
                {count === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60 pb-10">
                        <div className="w-16 h-16 border-2 border-dashed border-slate-600 rounded-full flex items-center justify-center mb-4 text-2xl">😴</div>
                        <p className="text-sm font-medium">Vacío</p>
                    </div>
                )}
            </div>
        </div>
    );
}
