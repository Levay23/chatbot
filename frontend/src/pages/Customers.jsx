import { useState, useEffect } from 'react';
import api from '../api/axios';
import { MessageSquare } from 'lucide-react';

export default function Customers() {
    const [customers, setCustomers] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        try {
            const { data } = await api.get('/customers');
            setCustomers(data);
        } catch (error) {
            console.error('Error fetching customers', error);
        }
    };

    const viewHistory = async (id) => {
        try {
            const { data } = await api.get(`/customers/${id}/history`);
            setSelectedHistory(data);
        } catch (error) {
            console.error('Error fetching history', error);
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Mis Clientes</h1>

            <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-1/2 bg-white shadow rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre / Teléfono</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {customers.map(c => (
                                <tr key={c.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{c.name}</div>
                                        <div className="text-sm text-gray-500">{c.phone.split('@')[0]}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <button
                                            onClick={() => viewHistory(c.id)}
                                            className="text-blue-600 hover:text-blue-900"
                                        >
                                            <MessageSquare size={20} className="inline" /> Ver Chat
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {selectedHistory && (
                    <div className="w-full md:w-1/2 bg-white shadow rounded-lg p-6">
                        <h2 className="text-xl font-bold mb-4">Historial de Chat</h2>
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                            {selectedHistory.map((msg, idx) => (
                                <div key={idx} className={`p-3 rounded-lg ${msg.role === 'user' ? 'bg-green-100 ml-12 text-right' : 'bg-gray-100 mr-12'}`}>
                                    <p className="text-sm">{msg.content}</p>
                                    <span className="text-xs text-gray-500 mt-1 block">
                                        {new Date(msg.timestamp).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                            {selectedHistory.length === 0 && <p className="text-gray-500">No hay mensajes recientes.</p>}
                        </div>
                        <button
                            className="mt-4 w-full bg-gray-200 py-2 rounded text-gray-700 hover:bg-gray-300"
                            onClick={() => setSelectedHistory(null)}
                        >
                            Cerrar Chat
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
