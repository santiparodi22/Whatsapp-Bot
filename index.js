const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "mibot123";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO = process.env.DESTINO;

// Modificamos la función para recibir las variables que tú quieras escribir
async function enviarWhatsapp(titulo, estado, causas) {
  try {
    console.log("Enviando alerta de WhatsApp...");

    await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: DESTINO,
        type: "template",
        template: {
          name: "alerta_biodigestor", // El nombre de tu plantilla en Meta
          language: {
            code: "es_AR"
          },
          components: [
            {
              type: "body",
              // Aquí escribes el texto dinámico que reemplazará a {{1}}, {{2}} y {{3}}
              parameters: [
                { type: "text", text: titulo }, // Reemplaza a {{1}}
                { type: "text", text: estado }, // Reemplaza a {{2}}
                { type: "text", text: causas }  // Reemplaza a {{3}}
              ]
            }
          ]
        }
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log("¡Alerta personalizada enviada con éxito!");
  } catch (err) {
    console.error("Error WhatsApp:", err.response?.data || err.message);
  }
}

// Endpoint que recibe la alerta del Webhook de tu sistema/planta
app.post("/healthcheck_alert", async (req, res) => {
  console.log("ALERTA HEALTHCHECK RECIBIDA");

  // ¡AQUÍ ESCRIBES EL TEXTO QUE TU QUIERAS!
  // Puedes cambiar estos strings cuando quieras sin pedirle permiso a Meta
  const miTitulo = "⚠️ BIODIGESTOR CENTRAL SIN COMUNICACIÓN";
  const miEstado = "No se recibió el heartbeat de la planta en los últimos 15 minutos.";
  const misCausas = "- Corte eléctrico general\n- Servidor local apagado\n- Enlace de red caído";

  // Ejecutamos el envío con tus textos personalizados
  await enviarWhatsapp(miTitulo, miEstado, misCausas);

  res.status(200).send("OK");
});

// Verificación del Webhook de Meta
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
