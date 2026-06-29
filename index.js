const express = require("express");
const axios = require("axios");
// 🔌 Importamos tu mesa de trabajo de alertas
const { armarReporteTexto, procesarAlarmasAutomaticas } = require("./alertas");

const app = express();
app.use(express.json());

// Variables de entorno de Railway
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO_WHATSAPP = process.env.DESTINO; // Puede ser un número o varios separados por comas
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let tictacAlerta = null;
const TIEMPO_LIMITE = 30 * 1000; 

let ultimosDatosPlc = null;
let estadosAnteriores = {};
let alarmasActivas = new Set();

// Despachador Multicanal con soporte para múltiples destinatarios en WhatsApp
async function notificarMultiCanal(texto) {
  console.log(`📢 Iniciando despacho de notificación...`);

  // 📱 ENVÍO A WHATSAPP (Soporta múltiples números separados por comas)
  if (DESTINO_WHATSAPP) {
    // Separamos la cadena por comas para armar una lista de números individuales
    const listaDestinos = DESTINO_WHATSAPP.split(","); 
    console.log(`📱 Destinatarios detectados para WhatsApp: ${listaDestinos.length}`);

    // Recorremos la lista y le enviamos el mensaje a cada uno
    for (const numero of listaDestinos) {
      const numeroLimpio = numero.trim(); // Borra espacios de más si los hay
      if (!numeroLimpio) continue;

      try {
        await axios.post(`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp", 
          recipient_type: "individual", 
          to: numeroLimpio, 
          type: "text", 
          text: { preview_url: false, body: texto }
        }, { 
          headers: { 
            Authorization: `Bearer ${WHATSAPP_TOKEN}`, 
            "Content-Type": "application/json" 
          } 
        });
        console.log(`✅ WhatsApp enviado con éxito a: ${numeroLimpio}`);
      } catch (err) { 
        console.error(`❌ Error WhatsApp para el número ${numeroLimpio}:`, err.message); 
      }
    }
  } else {
    console.error("⚠️ Variable DESTINO vacía. No se pudo enviar por WhatsApp.");
  }

  // ✈️ ENVÍO A TELEGRAM (Envía al chat o grupo configurado)
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { 
      chat_id: TELEGRAM_CHAT_ID, 
      text: texto 
    }, { timeout: 8000 });
    console.log("✅ Notificación enviada a Telegram con éxito.");
  } catch (err) { 
    console.error("❌ Error Telegram:", err.message); 
  }
}

// 📥 Planta (PC/Python)
app.post("/api/notificar", (req, res) => {
  const { datos } = req.body;
  if (!datos) return res.status(400).send({ error: "Falta datos" });
  res.status(200).send({ status: "OK" });

  ultimosDatosPlc = datos;

  // Ejecuta la lógica automática delegada en alertas.js
  procesarAlarmasAutomaticas(datos, estadosAnteriores, alarmasActivas, notificarMultiCanal);

  if (tictacAlerta) clearTimeout(tictacAlerta);
  tictacAlerta = setTimeout(async () => {
    await notificarMultiCanal("⚠️ *BIODIGESTOR SIN COMUNICACIÓN*");
  }, TIEMPO_LIMITE);
});

// 📥 WEBHOOK ÚNICO E INTELIGENTE (Procesa respuestas del comando "estado")
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // Detectar si el mensaje viene de Telegram
    if (body.message && body.message.text) {
      const texto = body.message.text.trim().toLowerCase();
      if (texto === "estado") {
        const reporte = ultimosDatosPlc ? armarReporteTexto(ultimosDatosPlc) : "⏳ Esperando datos del PLC...";
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: body.message.chat.id,
          text: reporte
        });
        console.log("🤖 Respuesta 'estado' despachada a Telegram.");
      }
    }

    // Detectar si el mensaje viene de WhatsApp
    if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const texto = body.entry[0].changes[0].value.messages[0].text?.body?.trim()?.toLowerCase();
      if (texto === "estado") {
        const reporte = ultimosDatosPlc ? armarReporteTexto(ultimosDatosPlc) : "⏳ Esperando datos del PLC...";
        await notificarMultiCanal(reporte);
        console.log("🤖 Respuesta 'estado' despachada a la lista de WhatsApp.");
      }
    }
  } catch (error) { console.error("❌ Error en webhook:", error.message); }
  res.sendStatus(200);
});

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === "mibot123") return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.get("/", (req, res) => { res.send("Cerebro Activo"); });

// Lanzamiento con Auto-Despertador incorporado
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", async () => { 
  console.log(`🚀 Puerto ${PORT}`); 
  try {
    const miUrlPublica = `https://whatsapp-bot-production-eb9c.up.railway.app/webhook`;
    await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${miUrlPublica}`);
    console.log("⚓ Webhook de Telegram auto-asegurado con éxito.");
  } catch (webhookErr) {
    console.error("⚠️ No se pudo auto-configurar el webhook al arrancar:", webhookErr.message);
  }
});
