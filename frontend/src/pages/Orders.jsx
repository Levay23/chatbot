import { useState, useEffect } from 'react';
import api from '../api/axios';

export default function Orders() {
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            const { data } = await api.get('/orders');
            setOrders(data);
        } catch (error) {
            console.error('Error fetching orders', error);
        }
    };

    const updateStatus = async (id, newStatus) => {
        try {
            await api.patch(`/orders/${id}/status`, { status: newStatus });
            fetchOrders();
        } catch (error) {
            console.error('Error updating status', error);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pendiente': return 'bg-yellow-100 text-yellow-800';
            case 'confirmado': return 'bg-blue-100 text-blue-800';
            case 'entregado': return 'bg-green-100 text-green-800';
            case 'cancelado': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Gestión de Pedidos</h1>

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {orders.map(o => (
                            <tr key={o.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">#{o.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-medium text-gray-900">{o.name}</div>
                                    <div className="text-sm text-gray-500">{o.phone.split('@')[0]}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${o.total}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(o.status)}`}>
                                        {o.status.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                    <select
                                        value={o.status}
                                        onChange={(e) => updateStatus(o.id, e.target.value)}
                                        className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm"
                                    >
                                        <option value="pendiente">Pendiente</option>
                                        <option value="confirmado">Confirmado</option>
                                        <option value="entregado">Entregado</option>
                                        <option value="cancelado">Cancelado</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                        {orders.length === 0 && (
                            <tr>
                                <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                                    No hay pedidos registrados
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
