const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "mibot123";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO = process.env.DESTINO; // Tu ID de grupo de WhatsApp (xxxxxxxx@g.us)

let tictacAlerta = null;
const TIEMPO_LIMITE = 15 * 60 * 1000; // 15 minutos de tolerancia por silencio

// Función central para inyectar los mensajes en WhatsApp
async function enviarWhatsapp(texto) {
  try {
    console.log("Despachando mensaje al grupo de WhatsApp...");
    await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: DESTINO,
        type: "text",
        text: { preview_url: false, body: texto }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    );
    console.log("¡WhatsApp enviado con éxito!");
  } catch (err) {
    console.error("Error en API de WhatsApp:", err.response?.data || err.message);
  }
}

// 📥 ENDPOINT RECEPTOR: Aquí golpeará tu script de Python
app.post("/api/notificar", async (req, res) => {
  // Aseguramos que el mensaje venga limpio
  const mensaje = req.body.mensaje; 
  
  if (!mensaje) {
    return res.status(400).send({ error: "Falta el parámetro 'mensaje'" });
  }

  console.log("🔔 Nueva notificación recibida desde el monitor Python.");

  // --- CONTROL DE HEARTBEAT ---
  if (tictacAlerta) clearTimeout(tictacAlerta);
  tictacAlerta = setTimeout(async () => {
    console.log("🚨 ALERTA: Silencio prolongado detectado.");
    const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "medium" });
    const alertaCaida = "⚠️ *BIODIGESTOR SIN COMUNICACIÓN*\n\n*Posibles causas:*\n▪️ Corte eléctrico general\n▪️ PC apagada o sin internet\n▪️ Servicio detenido\n\n" + `📅 *Fecha y Hora:* ${ahora}`;
    await enviarWhatsapp(alertaCaida);
  }, TIEMPO_LIMITE);
  // -----------------------------

  // Despacha directo a Meta usando la función que ya armamos
  await enviarWhatsapp(mensaje);

  res.status(200).send({ status: "OK", message: "Notificación procesada" });
});
// Webhook de Meta (Obligatorio para validaciones)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});
app.post("/webhook", (req, res) => { res.sendStatus(200); });

app.get("/", (req, res) => { res.send("Pasarela del Biodigestor Activa"); });

app.listen(3000, () => { console.log("Servidor Railway escuchando en puerto 3000"); });
