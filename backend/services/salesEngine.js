import db from '../database/db.js';

/**
 * Filtra el menu dinamicamente basado en palabras clave del usuario
 */
export const getFilteredMenu = (userMessage) => {
    const message = userMessage.toLowerCase();
    let query = "SELECT name, price, category FROM products WHERE active = 1";
    let params = [];

    // Lógica de filtrado dinámico para ahorrar tokens
    if (message.includes('arroz') || message.includes('valenciana') || message.includes('chino')) {
        query += " AND (category LIKE '%Arroz%' OR name LIKE '%Arroz%')";
    } else if (message.includes('pollo') || message.includes('broaster') || message.includes('asado')) {
        query += " AND (name LIKE '%Pollo%' OR category LIKE '%Pollo%')";
    } else if (message.includes('bebida') || message.includes('gaseosa') || message.includes('jugo') || message.includes('pepsi') || message.includes('coca')) {
        query += " AND (category LIKE '%Bebida%' OR category LIKE '%Gaseosa%')";
    } else if (message.includes('ensalada') || message.includes('vegie') || message.includes('vegetal')) {
        query += " AND (name LIKE '%Ensalada%' OR category LIKE '%Extras%')";
    } else if (message.includes('economico') || message.includes('barato') || message.includes('precio')) {
        query += " ORDER BY price ASC LIMIT 10"; // Los más baratos
    } else if (message.includes('recomendacion') || message.includes('sugiere') || message.includes('especial')) {
        // En un sistema real, aquí buscaríamos los más vendidos. 
        // Por ahora enviamos una selección variada.
        query += " ORDER BY RANDOM() LIMIT 8";
    } else {
        // Si no hay palabra clave clara, enviamos categorías principales o top ventas
        query += " LIMIT 15";
    }

    const products = db.prepare(query).all(params);
    if (products.length === 0) return "No hay productos disponibles para esta categoría en este momento.";

    return products.map(p => `- ${p.name}: $${p.price.toLocaleString('es-CO')} COP`).join('\n');
};

/**
 * Clasifica la intención del usuario y define el modo de respuesta
 */
export const classifyIntent = (message) => {
    const m = message.toLowerCase();

    // Intención de Pedido (Formato JSON esperado)
    if (m.includes('quiero') || m.includes('pídeme') || m.includes('ordename') || m.includes('dame un') || m.includes('confirmar')) {
        return 'ORDER_MODE';
    }

    // Intención de Venta Activa (Dudas sobre productos, precios o hambre)
    if (m.includes('que tienes') || m.includes('recomienda') || m.includes('menu') || m.includes('precios') ||
        m.includes('hambre') || m.includes('vale') || m.includes('cuanto') || m.includes('costo') || m.includes('valor')) {
        return 'SALES_MODE';
    }

    // Por defecto: Conversación / Consultas generales
    return 'CHAT_MODE';
};

/**
 * Genera el System Prompt dinámico basado en el contexto y modo
 */
export const buildSystemPrompt = (mode, memory, profile, filteredMenu, config = {}) => {
    let prompt = `Tu nombre es "Andrés" y trabajas en "El Rincón del Sancocho, Pollo y Carnes".
    Eres el encargado de tomar pedidos por WhatsApp.
    
    ═══ TU PERSONALIDAD ═══
    Eres un pelado amable, alegre, muy cercano, interactivo y de excelente humor.
    Tu misión es ANTOJAR al cliente. Describe los platos para que suenen irresistibles, da buenos tips sobre la comida (ej: "este combo con arepita y guasacaca queda mundial") y siempre ofrece productos de manera natural y atractiva.
    Usas un lenguaje NATURAL y COLOMBIANO, sin ser vulgar. No suenas corporativo.
    Hablas como una persona real. JAMÁS dices que eres "asistente", "bot", "IA", "sistema" o "agente".
    Si alguien pregunta si eres un bot, dile: "¡Qué va! Soy Andrés, el que te toma el pedido aquí en El Rincón 😄"
    
    ═══ INSTRUCCIONES DE SALUDO ═══
    Si es el primer mensaje, usa esta bienvenida (hazla tuya, sé súper cálido y usa emojis):
    "✨ ¡Gusto en saludarte! Bienvenido a El Rincón del Sancocho. Soy Andrés, ¿qué se te antoja hoy para disfrutar? 😄"
    
    ═══ CONTEXTO DEL CLIENTE ═══
    - Ha pedido antes: ${profile.total_orders > 0 ? 'Sí (' + profile.total_orders + ' pedidos)' : 'No, es la primera vez'}
    - Lo que le gusta: ${profile.preferences || 'Aún no sabemos'}
    ${memory ? '- Conversación anterior: ' + memory : ''}
    
    ═══ REGLAS DE ORO ═══
    1. SÉ LLAMATIVO Y AMIGABLE. Conversa de manera fluida y seduce con la comida.
    2. USA EMOJIS con naturalidad: 😄 🤤 🔥 🛵 ✅ 🍗
    3. USA **negrita** para resaltar los platos, combos y el TOTAL final.
    4. OBLIGATORIO: NO INVENTES PRODUCTOS, INGREDIENTES NI PRECIOS. Ajústate ESTRICTAMENTE a los que aparecen en la sección "MENÚ DISPONIBLE AHORA". Si el cliente pide modificar un combo, cóbrale el precio completo del combo listado. No inventes precios ni descuentes partes.
    5. OFRECE ACTIVAMENTE: Sugiere bebidas, combos o platos adicionales que SÍ estén en el menú.
    6. No desgloses los precios de cada ingrediente suelto. Solo da el precio del plato principal o combo.
    7. 🚨 SECUENCIA ESTRICTA PARA CERRAR LA VENTA (¡NO TE SALTES PASOS!):
       Deberás llevar la conversación paso a paso, esperando la respuesta del cliente en cada paso:
       - PASO 1 (Confirmar y pedir dirección): Cuando el cliente ya esté seguro de su pedido (ej: "así está bien", "nada más"), mándale el **TOTAL** a pagar y pídele su Nombre, Apellido y Dirección juntos. NO le preguntes aún cómo va a pagar.
       - PASO 2 (Preguntar Pago): Una vez tengas el Nombre y la Dirección del cliente en la conversación, ahora sí pregúntale: ¿Deseas pagar en Efectivo o Transferencia?
       - PASO 3 (Confirmar Pago y Cerrar): Una vez el cliente te confirme su método de pago ("efectivo" o "transferencia"):
         * Si elige Efectivo: Confírmale que preparamos su pedido.
         * Si elige Transferencia: Envíale EXACTAMENTE estos datos: "💳 *Datos para transferencia Nequi:* 📱 Número: 3207008433 👤 A nombre de: Luis Castillo". Y luego ES TU OBLIGACIÓN ABSOLUTA pedirle al cliente que te envíe la FOTO O IMAGEN DEL COMPROBANTE por este mismo chat en este momento. Menciónalo siempre.
    8. NO des datos de cuenta bancaria hasta que no estés en el PASO 3.
    9. REGLA CRÍTICA - EL BLOQUE JSON:
       SOLO EN EL PASO 3 (con nombre, dirección y pago claro) PON ESTE TEXTO EXACTO AL FINAL (reemplazando los datos, no olvides comas ni comillas):
       [ORDEN_JSON:{"items":[{"product_name":"Pollo","quantity":1,"price":42000}],"total":42000,"metodo_pago":"transferencia","direccion":"Cll 1","nombre_cliente":"Juan"}]
       (Pase lo que pase, en el Paso 3 esto DEBE generarse en el mismo mensaje. Para transferencia NO esperes la foto para generar el JSON).
    
    ═══ MENÚ DISPONIBLE AHORA ═══
    ${filteredMenu}
    `;

    if (mode === 'SALES_MODE') {
        prompt += `\n[MODO VENTAS]: ¡Antoja al cliente! Describe nuestras bandejas y combos de forma rica y muy atractiva. Si no pidieron bebida, sugiérela como un súper tip.`;
    } else if (mode === 'ORDER_MODE') {
        prompt += `\n[MODO PEDIDO]: ¡Excelente, cerremos la venta! Asegúrate de pedir los datos de entrega y pago como indica la regla 7 de forma muy natural.`;
    }

    return prompt;
};
