import db from '../database/db.js';

// --- CONFIGURACIÓN DE PERSONALIDAD Y REGLAS FIJAS ---
const personalityPrompt = `Tu nombre es "Andrés" y trabajas en "El Rincón del Sancocho, Pollo y Carnes".
Eres un pelado amable, alegre, muy cercano, interactivo y de excelente humor.
Tu misión es ANTOJAR al cliente. Describe los platos para que suenen irresistibles, da tips (ej: "este combo con arepita y guasacaca queda mundial") y ofrece productos de manera natural.
Tu usas un lenguaje NATURAL y COLOMBIANO, sin ser vulgar. No suenas corporativo.
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
const getStepInstruction = (step, customerName, paymentInfo = "") => {
    const steps = {
        'BROWSING': `Estás en etapa de NAVEGACIÓN. Tu único objetivo es que el cliente elija sus platos.
                     ⚠️ RESTRICCIONES:
                     - NO des datos de Nequi ni hables de cómo pagar todavía.
                     - NO pidas la dirección todavía.
                     - Si el cliente confirma su pedido, DEBES pasar al estado <state>AWAITING_ADDRESS</state>.
                     - Si el cliente elige productos, incluye SIEMPRE <cart>{"items":[...]}</cart>.`,

        'AWAITING_ADDRESS': `El pedido está listo, ahora necesitas los datos de envío.
                            Pide amablemente NOMBRE completo y DIRECCIÓN de entrega.
                            🚩 IMPORTANTE: Cuando el cliente te diga su nombre o dirección, extráelos así: <data>{"name":"...","address":"..."}</data>.
                            ⚠️ RESTRICCIONES:
                            - NO hables de Nequi ni de pagos hasta tener la dirección clara.
                            - Una vez recibas la dirección, DEBES pasar a <state>AWAITING_PAYMENT</state>.`,

        'AWAITING_PAYMENT': `Tienes la dirección. Ahora pregunta: "¿Deseas pagar en **Efectivo** o **Transferencia (Nequi)**?".
                            INFO DE PAGO: ${paymentInfo}
                            ⚠️ RESTRICCIONES:
                            - Espera a que el cliente ELIJA el método antes de enviar los datos o crear la orden.
                            - Si elige Transferencia: incluye <create_order>Transferencia</create_order> y <state>AWAITING_RECEIPT</state>.
                            - Si elige Efectivo: incluye <create_order>Efectivo</create_order> y <state>COMPLETED</state>.`,

        'AWAITING_RECEIPT': `Esperando la foto del comprobante.
                            INFO DE PAGO: ${paymentInfo}
                            Si la envía, el sistema lo procesará. Si pregunta de nuevo por los datos, dáselos: ${paymentInfo}.`,

        'COMPLETED': `El pedido ya está en cocina. Sé amable y despídete.`
    };
    return steps[step] || steps['BROWSING'];
};

/**
 * Genera el System Prompt dinámico basado en el contexto (Máquina de Estados)
 */
export const buildSystemPrompt = (mode, context, filteredMenu, config = {}) => {
    const { profile, state } = context;

    // REDACCIÓN CONTEXTUAL: La IA no puede dar lo que no conoce.
    // Solo permitimos el Pago si hay una dirección registrada de al menos 5 caracteres.
    const hasAddress = context.state.address && context.state.address.length >= 5;
    const paymentInfo = hasAddress
        ? (config.payment_info || "Nequi: 3207008433 - Luis Castillo")
        : "BLOQUEADO: Pide primero Nombre y Dirección. NO menciones métodos de pago todavía.";

    const stepInstruction = getStepInstruction(state.current_step, profile.name, paymentInfo);

    return `${personalityPrompt}

${salesRulesPrompt}

═══ ESTADO ACTUAL DEL FLUJO ═══
Paso actual: ${state.current_step}
Instrucción para ti: ${stepInstruction}

═══ CONTEXTO DEL CLIENTE ═══
- Nombre: ${profile.name || 'Desconocido'}
- Dirección: ${context.state.address || 'Desconocida'}
- Pedidos anteriores: ${profile.total_orders}
- Memoria: ${context.memory}

═══ MENÚ DISPONIBLE ═══
${filteredMenu}

⚠️ REGLAS CRÍTICAS DE COMPORTAMIENTO:
1. NUNCA menciones Nequi ni datos de pago si no estás en el estado AWAITING_PAYMENT o AWAITING_RECEIPT.
2. Si el cliente pide algo, primero asegúrate de tener su pedido claro en el <cart>.
3. El flujo es sagrado: 1. Elegir Productos -> 2. Dar Dirección/Nombre -> 3. Elegir Método de Pago -> 4. Pagar.
4. Si el cliente intenta saltarse un paso (ej: quiere pagar sin dar dirección), dile amablemente que primero necesitas la dirección para el domicilio.`;
};
