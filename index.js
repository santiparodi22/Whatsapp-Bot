const express = require("express");
const axios = require("axios");
// 🔌 Importamos tu nueva mesa de trabajo de alertas
const { armarReporteTexto, procesarAlarmasAutomaticas } = require("./alertas");

const app = express();
app.use(express.json());

// Variables de entorno de Railway
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO_WHATSAPP = process.env.DESTINO; 
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

let tictacAlerta = null;
const TIEMPO_LIMITE = 30 * 1000; 

let ultimosDatosPlc = null;
let estadosAnteriores = {};
let alarmasActivas = new Set();

// Despachador Multicanal (No tocar)
async function notificarMultiCanal(texto) {
  console.log(`📢 Despachando: ${texto.split('\n')[0]}`);
  try {
    await axios.post(`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", recipient_type: "individual", to: DESTINO_WHATSAPP, type: "text", text: { preview_url: false, body: texto }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  } catch (err) { console.error("❌ Error WhatsApp:", err.message); }

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: texto }, { timeout: 8000 });
  } catch (err) { console.error("❌ Error Telegram:", err.message); }
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

// 📥 WEBHOOK ÚNICO E INTELIGENTE
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // Detectar si es Telegram
    if (body.message && body.message.text) {
      const texto = body.message.text.trim().toLowerCase();
      if (texto === "estado") {
        const reporte = ultimosDatosPlc ? armarReporteTexto(ultimosDatosPlc) : "⏳ Esperando datos del PLC...";
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: body.message.chat.id,
          text: reporte
        });
      }
    }

    // Detectar si es WhatsApp
    if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const texto = body.entry[0].changes[0].value.messages[0].text?.body?.trim()?.toLowerCase();
      if (texto === "estado") {
        const reporte = ultimosDatosPlc ? armarReporteTexto(ultimosDatosPlc) : "⏳ Esperando datos del PLC...";
        await notificarMultiCanal(reporte);
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
