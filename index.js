const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const VERIFY_TOKEN = "mibot123";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO = process.env.DESTINO;

async function enviarWhatsapp(texto) {
  try {

    
	console.log("EL TOKEN EN MEMORIA EMPIEZA CON:", process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.substring(0, 15) : "NO EXISTE");
	console.log("TOKEN LENGTH:", WHATSAPP_TOKEN?.length);
    console.log("PHONE_NUMBER_ID:", PHONE_NUMBER_ID);
    console.log("DESTINO:", DESTINO);

    await axios.post(
      `https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`,
{
messaging_product: "whatsapp",
to: DESTINO,
type: "text",
text: {
body: texto
}
},
{
headers: {
Authorization: "Bearer ${WHATSAPP_TOKEN}",
"Content-Type": "application/json"
}
}
);
} catch (err) {
console.error("Error WhatsApp:", err.response?.data || err.message);
}
}

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

app.post("/healthcheck_alert", async (req, res) => {
console.log("ALERTA HEALTHCHECK RECIBIDA");

await enviarWhatsapp(
"⚠️ BIODIGESTOR SIN COMUNICACIÓN\n\n" +
"No se recibió heartbeat de la planta.\n\n" +
"Posibles causas:\n" +
"- Corte eléctrico\n" +
"- PC apagada\n" +
"- Enlace inalámbrico caído\n" +
"- Servicio detenido"
);

res.status(200).send("OK");
});

app.get("/", (req, res) => {
res.send("Servidor operativo");
});

app.listen(3000, () => {
console.log("Servidor iniciado");
});