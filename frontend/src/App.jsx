import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import { io } from 'socket.io-client';
import api from './api/axios';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function PrivateRoute({ children }) {
    const token = localStorage.getItem('token');
    return token ? children : <Navigate to="/login" />;
}

function WhatsAppGuard({ children }) {
    const [status, setStatus] = useState({ connected: false, loading: true });

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const { data } = await api.get('/bot/status');
                setStatus({ connected: data.connected, loading: false });
            } catch (err) {
                setStatus({ connected: false, loading: false });
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    if (status.loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] text-emerald-500">
                <Loader2 className="animate-spin mb-4" size={48} />
                <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Sincronizando Sistema...</p>
            </div>
        );
    }

    if (!status.connected) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0f172a] p-4 text-center">
                <div className="bg-slate-900/50 p-10 rounded-[3rem] border border-slate-800 shadow-2xl max-w-md w-full backdrop-blur-xl">
                    <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                        <Smartphone size={48} />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">WhatsApp Desconectado</h2>
                    <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                        El bot no está vinculado. Por favor, revisa la terminal del servidor y escanea el código QR para iniciar.
                    </p>
                    <div className="flex items-center justify-center gap-3 py-3 px-6 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500 font-black text-[10px] uppercase tracking-[0.2em] animate-pulse">
                        <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_#ef4444]"></div>
                        Esperando Conexión Vital
                    </div>
                </div>
            </div>
        );
    }

    return children;
}

export default function App() {
    // Initialize socket only once
    const socket = useMemo(() => io('http://localhost:3000'), []);

    return (
        <Router>
            <Routes>
                <Route path="/login" element={<Login />} />

                <Route path="/dashboard" element={
                    <PrivateRoute>
                        <WhatsAppGuard>
                            <Dashboard socket={socket} />
                        </WhatsAppGuard>
                    </PrivateRoute>
                } />

                <Route path="/customers" element={<Navigate to="/dashboard" />} />
                <Route path="/orders" element={<Navigate to="/dashboard" />} />
                <Route path="*" element={<Navigate to="/dashboard" />} />
            </Routes>
        </Router>
    );
}
