import { useState, useEffect } from 'react';
import api from '../api/axios';
import { MessageSquare, Send, Users, UserCheck, UserMinus, CheckSquare, Square } from 'lucide-react';

export default function Customers() {
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);
    const [filter, setFilter] = useState('all'); // all, active, inactive
    const [selectedIds, setSelectedIds] = useState([]);
    const [showBroadcastModal, setShowBroadcastModal] = useState(false);
    const [broadcastMessage, setBroadcastMessage] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    useEffect(() => {
        applyFilter();
    }, [customers, filter]);

    const fetchCustomers = async () => {
        try {
            const { data } = await api.get('/customers');
            setCustomers(data);
        } catch (error) {
            console.error('Error fetching customers', error);
        }
    };

    const applyFilter = () => {
        let filtered = [...customers];
        if (filter === 'active') {
            filtered = customers.filter(c => c.total_orders > 0);
        } else if (filter === 'inactive') {
            filtered = customers.filter(c => c.total_orders === 0);
        }
        setFilteredCustomers(filtered);
    };

    const viewHistory = async (id) => {
        try {
            const { data } = await api.get(`/customers/${id}/history`);
            setSelectedHistory(data);
        } catch (error) {
            console.error('Error fetching history', error);
        }
    };

    const toggleSelect = (id) => {
        if (selectedIds.includes(id)) {
            setSelectedIds(selectedIds.filter(i => i !== id));
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredCustomers.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredCustomers.map(c => c.id));
        }
    };

    const handleBroadcast = async () => {
        if (!broadcastMessage.trim() || selectedIds.length === 0) return;
        setIsSending(true);
        try {
            const { data } = await api.post('/customers/broadcast', {
                ids: selectedIds,
                message: broadcastMessage
            });
            alert(`✅ Difusión enviada con éxito a ${data.sent} clientes.`);
            setShowBroadcastModal(false);
            setBroadcastMessage('');
            setSelectedIds([]);
        } catch (error) {
            alert('❌ Error al enviar difusión: ' + (error.response?.data?.error || error.message));
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Mis Clientes</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilter('all')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        <Users size={16} /> Todos ({customers.length})
                    </button>
                    <button
                        onClick={() => setFilter('active')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === 'active' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        <UserCheck size={16} /> Fieles ({customers.filter(c => c.total_orders > 0).length})
                    </button>
                    <button
                        onClick={() => setFilter('inactive')}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${filter === 'inactive' ? 'bg-orange-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    >
                        <UserMinus size={16} /> Sin pedidos ({customers.filter(c => c.total_orders === 0).length})
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-2/3 bg-white shadow rounded-lg overflow-hidden">
                    <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                        <button
                            onClick={toggleSelectAll}
                            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                        >
                            {selectedIds.length === filteredCustomers.length && filteredCustomers.length > 0 ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} />}
                            Seleccionar Todos
                        </button>
                        <button
                            disabled={selectedIds.length === 0}
                            onClick={() => setShowBroadcastModal(true)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${selectedIds.length > 0 ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md transform hover:-translate-y-0.5' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                        >
                            <Send size={18} /> Difusión Inteligente ({selectedIds.length})
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10"></th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre / Teléfono</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Pedidos</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredCustomers.map(c => (
                                    <tr key={c.id} className={selectedIds.includes(c.id) ? 'bg-indigo-50' : ''}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <button onClick={() => toggleSelect(c.id)}>
                                                {selectedIds.includes(c.id) ? <CheckSquare size={20} className="text-indigo-600" /> : <Square size={20} className="text-gray-400" />}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{c.name || 'Cliente'}</div>
                                            <div className="text-sm text-gray-500">{c.phone.split('@')[0]}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.total_orders > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                                {c.total_orders} pedidos
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <button
                                                onClick={() => viewHistory(c.id)}
                                                className="text-indigo-600 hover:text-indigo-900 font-medium text-sm flex items-center justify-center gap-1 mx-auto"
                                            >
                                                <MessageSquare size={16} /> Ver Chat
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {selectedHistory && (
                    <div className="w-full md:w-1/3 bg-white shadow rounded-lg p-6 border-l-4 border-indigo-500 sticky top-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Historial de Chat</h2>
                            <button className="text-gray-400 hover:text-gray-600" onClick={() => setSelectedHistory(null)}>×</button>
                        </div>
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 chat-scrollbar">
                            {selectedHistory.map((msg, idx) => (
                                <div key={idx} className={`p-3 rounded-2xl max-w-[90%] ${msg.role === 'user' ? 'bg-green-50 ml-auto border border-green-100 rounded-tr-none' : 'bg-indigo-50 mr-auto border border-indigo-100 rounded-tl-none'}`}>
                                    <p className="text-sm text-gray-800">{msg.content}</p>
                                    <span className="text-[10px] text-gray-500 mt-1 block">
                                        {new Date(msg.timestamp).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                            {selectedHistory.length === 0 && <p className="text-gray-500 text-center py-10">No hay mensajes recientes.</p>}
                        </div>
                        <button
                            className="mt-6 w-full bg-gray-100 py-2 rounded-xl text-gray-600 font-bold hover:bg-gray-200 transition-colors"
                            onClick={() => setSelectedHistory(null)}
                        >
                            Cerrar Historial
                        </button>
                    </div>
                )}
            </div>

            {/* Modal de Difusión */}
            {showBroadcastModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-indigo-600 p-6 text-white text-center">
                            <Send className="mx-auto mb-2" size={32} />
                            <h2 className="text-2xl font-bold">Enviar Difusión Inteligente</h2>
                            <p className="text-indigo-100 text-sm mt-1">Enviarás este mensaje a {selectedIds.length} clientes seleccionados.</p>
                        </div>
                        <div className="p-8">
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Mensaje Sugerido o Personalizado:</label>
                                <textarea
                                    value={broadcastMessage}
                                    onChange={(e) => setBroadcastMessage(e.target.value)}
                                    className="w-full h-40 p-4 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 focus:ring-0 transition-all text-gray-800 outline-none resize-none bg-gray-50"
                                    placeholder="Ej: ¡Hola! 👋 Te extrañamos en El Rincón del Sancocho. Hoy tenemos Pollo a la Brasa con 20% de descuento. ¡Pide el tuyo ahora! 🥘"
                                />
                                <p className="text-[11px] text-gray-400 mt-2 italic">⚠️ Los mensajes se enviarán con un intervalo de 0.7s para evitar bloqueos.</p>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    className="flex-1 bg-gray-100 text-gray-600 px-6 py-3 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                                    onClick={() => setShowBroadcastModal(false)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    disabled={isSending || !broadcastMessage.trim()}
                                    className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${isSending || !broadcastMessage.trim() ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg active:scale-95'}`}
                                    onClick={handleBroadcast}
                                >
                                    {isSending ? 'Enviando...' : 'Enviar Ahora 🚀'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
