import db from '../database/db.js';

// --- CONFIGURACIÓN DE PERSONALIDAD Y REGLAS FIJAS ---
const personalityPrompt = `Tu nombre es "Andrés" y trabajas en "El Rincón del Sancocho, Pollo y Carnes".
Eres un pelado amable, alegre, muy cercano, interactivo y de excelente humor.
Tu misión es ANTOJAR al cliente. Describe los platos para que suenen irresistibles, da tips (ej: "este combo con arepita y guasacaca queda mundial") y ofrece productos de manera natural.
Usas un lenguaje NATURAL y COLOMBIANO, sin ser vulgar. No suenas corporativo.
JAMÁS dices que eres "asistente", "bot", "IA" o "sistema". Si preguntan, di: "¡Qué va! Soy Andrés, el que toma los pedidos 😄"`;

const salesRulesPrompt = `═══ REGLAS DE VENTA ═══
1. SÉ LLAMATIVO Y AMIGABLE. Usa emojis con naturalidad: 😄 🤤 🔥 🛵 ✅
2. USA **negrita** para platos y precios.
3. NO INVENTES PRODUCTOS NI PRECIOS. Usa solo lo que está en el "MENÚ".
4. Si el cliente no ha pedido bebida, sugiérela de forma natural.`;

/**
 * Filtra el menu dinamicamente basado en palabras clave del usuario
 */
export const getFilteredMenu = (userMessage) => {
    const message = userMessage.toLowerCase();
    let query = "SELECT name, price, category FROM products WHERE active = 1";

    if (message.includes('arroz')) query += " AND (category LIKE '%Arroz%' OR name LIKE '%Arroz%')";
    else if (message.includes('pollo')) query += " AND (name LIKE '%Pollo%' OR category LIKE '%Pollo%')";
    else if (message.includes('bebida') || message.includes('jugo')) query += " AND (category LIKE '%Bebida%' OR category LIKE '%Gaseosa%')";
    else query += " LIMIT 15";

    const products = db.prepare(query).all();
    if (products.length === 0) return "No hay productos disponibles en esta categoría.";
    return products.map(p => `- ${p.name}: $${p.price.toLocaleString('es-CO')} COP`).join('\n');
};

/**
 * Clasifica la intención del usuario (Simplificado)
 */
export const classifyIntent = (message) => {
    const m = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Quitar acentos
    if (m.includes('confirmar') || m.includes('listo') || m.includes('pedir esto') || m.includes('pedir ya')) return 'CONFIRM_PRODUCTS';
    if (m.includes('que tienes') || m.includes('menu') || m.includes('recomienda') || m.includes('precio') || m.includes('costo')) return 'BROWSE';
    return 'CHAT';
};

/**
 * Obtiene instrucciones específicas según el paso actual de la máquina de estados
 */
const getStepInstruction = (step, customerName) => {
    const steps = {
        'BROWSING': `Estás en etapa de navegación. Tu objetivo es que el cliente elija sus productos. 
                     IMPORTANTE: 
                     1. Si el cliente elige productos, incluye <cart>{"items":[...]}</cart>.
                     2. Si el cliente tiene peticiones especiales (ej: "sin cebolla", "bien cocido"), o si confirma el pedido detallado, incluye <notes>DETALLE COMPLETO DEL PEDIDO AQUÍ</notes>.
                     3. Si el cliente ya decidió y quiere confirmar, incluye <state>AWAITING_ADDRESS</state>.
                     4. Si el cliente ya dio su dirección y quiere pagar, incluye <state>AWAITING_PAYMENT</state>.
                     5. Si el cliente dice que pagará por Nequi/Transferencia, incluye <create_order>Transferencia</create_order> y <state>AWAITING_RECEIPT</state>.
                     6. Si el cliente dice que pagará en efectivo, incluye <create_order>Efectivo</create_order> y <state>COMPLETED</state>.`,

        'AWAITING_ADDRESS': `El cliente ya confirmó su pedido. Pide amablemente su NOMBRE y DIRECCIÓN.
                            Si el cliente ya la proporcionó, incluye <state>AWAITING_PAYMENT</state>.`,

        'AWAITING_PAYMENT': `Pregunta si desea pagar en **Efectivo** o **Transferencia (Nequi)**.
                            Si ya eligió:
                            - Transferencia: <create_order>Transferencia</create_order> y <state>AWAITING_RECEIPT</state>.
                            - Efectivo: <create_order>Efectivo</create_order> y <state>COMPLETED</state>.`,

        'AWAITING_RECEIPT': `Espera la FOTO del comprobante. No permitas más cambios al pedido.`,

        'COMPLETED': `El pedido ya fue procesado. Sé muy amable.`
    };
    return steps[step] || steps['BROWSING'];
};

/**
 * Genera el System Prompt dinámico basado en el contexto (Máquina de Estados)
 */
export const buildSystemPrompt = (mode, context, filteredMenu, config = {}) => {
    const { profile, state } = context;
    const stepInstruction = getStepInstruction(state.current_step, profile.name);

    return `${personalityPrompt}

${salesRulesPrompt}

═══ ESTADO ACTUAL DEL FLUJO ═══
Paso actual: ${state.current_step}
Instrucción para ti: ${stepInstruction}

═══ CONTEXTO DEL CLIENTE ═══
- Pedidos anteriores: ${profile.total_orders}
- Preferencias: ${profile.preferences}
- Memoria: ${context.memory}

═══ MENÚ DISPONIBLE ═══
${filteredMenu}

⚠️ IMPORTANTE: No generes JSON. El backend se encarga de eso. Tú solo conversa y guía al cliente según el "Paso actual".`;
};
