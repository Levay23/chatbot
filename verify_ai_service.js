import { processMessage } from './backend/services/aiService.js';
import db from './backend/database/db.js';

async function verifyAI() {
    console.log("🧪 Verificando conexión con Groq y nuevo modelo...");

    // Simular un cliente
    const testCustomer = {
        id: 1,
        phone: '573000000000@c.us',
        name: 'Tester'
    };

    try {
        console.log("📡 Enviando mensaje de prueba a la IA...");
        const response = await processMessage(testCustomer, "Hola, ¿qué me recomiendas hoy?");

        if (response && response.length > 5 && !response.includes("error")) {
            console.log("✅ IA Respondió correctamente:");
            console.log(`💬 "${response.substring(0, 100)}..."`);
            console.log("\n🚀 ¡La conexión con Groq está RESTABLECIDA!");
        } else {
            throw new Error("La respuesta de la IA fue inválida o contenía errores.");
        }
    } catch (err) {
        console.error("❌ ERROR CRÍTICO EN VERIFICACIÓN:");
        console.error(err.message);
        process.exit(1);
    }
}

verifyAI();
