import React, { useState, useMemo } from 'react';
import { X, Plus, CheckCircle, Grid, Search, Minus, ShoppingCart } from 'lucide-react';

export function ManualOrderModal({ isOpen, onClose, productos, onSubmit, formatCOP }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [formData, setFormData] = useState({
        nombre: '',
        telefono: '',
        direccion: '',
        metodo_pago: 'Efectivo',
        carrito: []
    });

    if (!isOpen) return null;

    const categories = useMemo(() => {
        const cats = [...new Set(productos.map(p => p.category))];
        return cats.sort();
    }, [productos]);

    const filteredProducts = useMemo(() => {
        return productos.filter(p =>
            p.active === 1 &&
            p.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [productos, searchTerm]);

    const addToCart = (prod) => {
        setFormData(prev => {
            const exists = prev.carrito.find(i => i.producto_id === prod.id);
            if (exists) {
                return {
                    ...prev,
                    carrito: prev.carrito.map(i => i.producto_id === prod.id
                        ? { ...i, cantidad: i.cantidad + 1 } : i)
                };
            }
            return {
                ...prev,
                carrito: [...prev.carrito, { producto_id: prod.id, nombre: prod.name, precio: prod.price, cantidad: 1 }]
            };
        });
    };

    const updateQty = (id, delta) => {
        setFormData(prev => ({
            ...prev,
            carrito: prev.carrito.map(i => i.producto_id === id
                ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i)
        }));
    };

    const removeItem = (id) => {
        setFormData(prev => ({
            ...prev,
            carrito: prev.carrito.filter(i => i.producto_id !== id)
        }));
    };

    const total = formData.carrito.reduce((sum, i) => sum + (i.cantidad * i.precio), 0);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="px-8 py-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Nueva Orden Manual</h2>
                        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Gestión de venta directa</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* Left Side: Product Selection */}
                    <div className="flex-1 border-r border-slate-800 flex flex-col bg-slate-950/20">
                        <div className="p-6 border-b border-slate-800">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-emerald-500 transition-colors" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-12 pr-4 py-3 text-sm text-slate-200 outline-none focus:border-emerald-500/50 focus:ring-4 focus:ring-emerald-500/5 transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                            {categories.map(cat => {
                                const catProds = filteredProducts.filter(p => p.category === cat);
                                if (catProds.length === 0) return null;
                                return (
                                    <div key={cat} className="space-y-3">
                                        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] pl-2">{cat || 'SINCATEGORÍA'}</h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {catProds.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => addToCart(p)}
                                                    className="flex items-center justify-between p-4 rounded-2xl bg-slate-800/40 border border-slate-800 hover:border-emerald-500/30 hover:bg-slate-800 transition-all text-left group"
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-200">{p.name}</span>
                                                        <span className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">{formatCOP(p.price)}</span>
                                                    </div>
                                                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                                                        <Plus size={16} />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Right Side: Order Summary & Client Data */}
                    <div className="w-full md:w-96 flex flex-col bg-slate-900">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                            {/* Client Info */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div> Datos del Cliente
                                </h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Nombre del Cliente"
                                        className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500/50 transition-all"
                                        value={formData.nombre}
                                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                    />
                                    <input
                                        type="text"
                                        placeholder="WhatsApp (Ej: 57300...)"
                                        className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500/50 transition-all"
                                        value={formData.telefono}
                                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                                    />
                                    <textarea
                                        placeholder="Dirección de Entrega"
                                        rows={2}
                                        className="w-full bg-slate-800/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-sky-500/50 transition-all resize-none"
                                        value={formData.direccion}
                                        onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Cart List */}
                            <div className="space-y-4 pt-2">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Carrito
                                    </div>
                                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-lg border border-emerald-500/20">{formData.carrito.length} Ítems</span>
                                </h3>

                                <div className="space-y-3">
                                    {formData.carrito.map(item => (
                                        <div key={item.producto_id} className="bg-slate-800/60 border border-slate-800 p-4 rounded-2xl space-y-3">
                                            <div className="flex justify-between items-start">
                                                <p className="text-xs font-bold text-slate-200 leading-tight">{item.nombre}</p>
                                                <button onClick={() => removeItem(item.producto_id)} className="text-slate-600 hover:text-red-400 transition-colors">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                                                    <button onClick={() => updateQty(item.producto_id, -1)} className="p-1 text-slate-500 hover:text-emerald-400 transition-colors border border-transparent hover:border-emerald-500/20 rounded-lg">
                                                        <Minus size={12} />
                                                    </button>
                                                    <span className="text-xs font-black text-emerald-400 w-4 text-center">{item.cantidad}</span>
                                                    <button onClick={() => updateQty(item.producto_id, 1)} className="p-1 text-slate-500 hover:text-emerald-400 transition-colors border border-transparent hover:border-emerald-500/20 rounded-lg">
                                                        <Plus size={12} />
                                                    </button>
                                                </div>
                                                <p className="text-xs font-black text-slate-400 tracking-tight">{formatCOP(item.cantidad * item.precio)}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {formData.carrito.length === 0 && (
                                        <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-3xl">
                                            <ShoppingCart className="mx-auto text-slate-800 mb-2" size={32} />
                                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Carrito Vacío</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div className="space-y-4 pt-2">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Pago
                                </h3>
                                <div className="flex gap-2">
                                    {['Efectivo', 'Transferencia'].map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setFormData({ ...formData, metodo_pago: m })}
                                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${formData.metodo_pago === m ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/10' : 'bg-slate-800/50 text-slate-500 border-slate-800 hover:border-slate-700'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Bottom Summary & Button */}
                        <div className="p-8 bg-slate-950/40 border-t border-slate-800 space-y-6">
                            <div className="flex justify-between items-end">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monto Total</p>
                                <p className="text-3xl font-black text-emerald-400 tracking-tighter leading-none">{formatCOP(total)}</p>
                            </div>
                            <button
                                disabled={formData.carrito.length === 0 || !formData.nombre || !formData.telefono}
                                onClick={() => onSubmit(formData)}
                                className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-2xl ${formData.carrito.length === 0 || !formData.nombre || !formData.telefono
                                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed grayscale'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:scale-95'
                                    }`}
                            >
                                Confirmar Orden <CheckCircle size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
