const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "mibot123";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO = process.env.DESTINO;

// Función modificada para TEXTO LIBRE (Ventana de 24 horas)
async function enviarWhatsapp(textoLibre) {
  try {
    console.log("Enviando mensaje de texto libre por WhatsApp...");

    await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: DESTINO,
        type: "text", // <-- Cambiamos 'template' por 'text'
        text: {
          preview_url: false,
          body: textoLibre // <-- Aquí viaja tu mensaje completo tal cual lo escribas
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("¡Mensaje libre enviado con éxito!");
  } catch (err) {
    console.error("Error WhatsApp:", err.response?.data || err.message);
  }
}

// Endpoint del Healthcheck
app.post("/healthcheck_alert", async (req, res) => {
  console.log("ALERTA HEALTHCHECK RECIBIDA");

  // Al tener la ventana de 24hs abierta, el formato de abajo te va a llegar PERFECTO e idéntico
  const ahora = new Date();
  const fechaHoraArreglada = ahora.toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    dateStyle: "short",
    timeStyle: "medium"
  });

  const miMensajePersonalizado = 
    "⚠️ *BIODIGESTOR SIN COMUNICACIÓN*\n\n" +
    "*Posibles causas:*\n" +
    "▪️ Corte eléctrico general\n" +
    "▪️ PC apagada o sin internet\n" +
    "▪️ Servicio detenido\n\n" +
    `📅 *Fecha y Hora:* ${fechaHoraArreglada}`;

  await enviarWhatsapp(miMensajePersonalizado);

  res.status(200).send("OK");
});

// Webhooks obligatorios de Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", (req, res) => {
  console.log(JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("Servidor operativo");
});

app.listen(3000, () => {
  console.log("Servidor iniciado");
});
