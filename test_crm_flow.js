import { processMessage } from './backend/services/aiService.js';
import { getOrCreateCustomer } from './backend/services/memoryService.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTests() {
    console.log('🚀 Iniciando Pruebas Multi-Turn de Flujo CRM...\n');

    // Número único para cada prueba
    const testPhone = `test_${Date.now()}@c.us`;
    const customer = getOrCreateCustomer(testPhone, 'Maria Garcia');

    const conversation = [
        { turn: 1, msg: 'Hola buenas tardes' },
        { turn: 2, msg: 'Quiero pedir un pollo frito completo' },
        { turn: 3, msg: 'No nada mas, solo eso por favor.' },
        { turn: 4, msg: 'Mi nombre es Maria Garcia, vivo en la Carrera 15 #22-30 Barrio Centro' },
        { turn: 5, msg: 'Pagaré en efectivo' },
        { turn: 6, msg: 'Ay perdón me equivoqué, mejor pago por transferencia' }
    ];

    let hasErrors = false;

    for (const step of conversation) {
        console.log(`\n═══════════ TURNO ${step.turn} ═══════════`);
        console.log(`👤 Cliente: "${step.msg}"`);

        try {
            const rawResponse = await processMessage(customer, step.msg);

            // Aplicar la misma limpieza que hace whatsappService.js
            let cleanResponse = rawResponse.replace(/(?:\[|\*)?ORDEN_JSON:?[\s\S]*/gi, '').trim();

            console.log(`\n🤖 Bot Response:\n${cleanResponse}`);

            // Verificar si hay JSON (señal de cierre de venta)
            if (rawResponse.includes('ORDEN_JSON')) {
                const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
                console.log('\n✅ JSON detectado - Venta cerrada correctamente!');
                if (jsonMatch) {
                    try {
                        const parsed = JSON.parse(jsonMatch[0]);
                        console.log(`   - Nombre: ${parsed.nombre_cliente}`);
                        console.log(`   - Dirección: ${parsed.direccion}`);
                        console.log(`   - Pago: ${parsed.metodo_pago}`);
                        console.log(`   - Total: $${parsed.total}`);
                        if (!parsed.nombre_cliente) { console.log('   ❌ Falta nombre_cliente'); hasErrors = true; }
                        if (!parsed.direccion) { console.log('   ❌ Falta direccion'); hasErrors = true; }
                        if (!parsed.metodo_pago) { console.log('   ❌ Falta metodo_pago'); hasErrors = true; }
                    } catch (e) {
                        console.log('   ⚠️ No se pudo parsear el JSON completo');
                    }
                }
            }

            // Verificar que el chat está limpio
            if (cleanResponse.includes('ORDEN_JSON') || (cleanResponse.includes('{') && cleanResponse.includes('product_name'))) {
                console.log('\n❌ ERROR CRÍTICO: JSON visible en el chat del cliente!');
                hasErrors = true;
            } else {
                console.log('\n✅ Chat limpio - Sin fugas técnicas');
            }

            // Verificar personalidad (No debe decir bot, ia, asistente)
            const lowerResponse = cleanResponse.toLowerCase();
            if (lowerResponse.includes('bot') || lowerResponse.includes('inteligencia artificial') || lowerResponse.includes('asistente') || lowerResponse.includes('virtual')) {
                console.log('\n❌ ERROR CRÍTICO: El bot rompió personaje y mencionó que es un sistema/bot/asistente!');
                hasErrors = true;
            } else {
                console.log('\n✅ Personalidad correcta - 100% Humano');
            }

        } catch (err) {
            console.log(`\n❌ Error en turno ${step.turn}: ${err.message}`);
            hasErrors = true;
        }

        // Esperar para evitar rate limit de Groq (TPM)
        if (step.turn < conversation.length) {
            console.log(`\n⏳ Esperando 15s para evitar rate limit...`);
            await sleep(15000);
        }
    }

    console.log('\n\n═════════════════════════════════');
    if (hasErrors) {
        console.log('❌ RESULTADO: Hay errores que corregir.');
    } else {
        console.log('✅ RESULTADO: Todas las pruebas pasaron correctamente.');
    }
}

runTests().catch(console.error);
