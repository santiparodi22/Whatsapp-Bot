const express = require("express");
const axios = require("axios");
// 🔌 Importamos tu mesa de trabajo de alertas
const { armarReporteTexto, procesarAlarmasAutomaticas } = require("./alertas");

const app = express();
app.use(express.json());

// Variables de entorno de Railway
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const DESTINO_WHATSAPP = process.env.DESTINO; 
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ⏱️ CONFIGURACIÓN DE TIEMPOS Y FILTROS
let tictacAlerta = null;
const TIEMPO_LIMITE_ALERTA = 5 * 60 * 1000; // 5 Minutos para disparar la alerta al celular
const TIEMPO_MINIMO_MICROCORTE = 30 * 1000; // Si pasa más de 30s sin datos, califica como microcorte si vuelve antes de los 5 min

// 📊 VARIABLES DE MEMORIA DE RED / ENERGÍA
let ultimosDatosPlc = null;
let estadosAnteriores = {};
let alarmasActivas = new Set();
let momentoUltimoDato = Date.now();
let contadorMicrocortesDiarios = 0;
let yaDisparoAlertaCorteMayor = false;
let ultimoDiaReportado = ""; // Evita reportes duplicados a las 6:00 AM

// Despachador Multicanal con soporte para múltiples destinatarios en WhatsApp
async function notificarMultiCanal(texto) {
  console.log(`📢 Iniciando despacho de notificación...`);

  if (DESTINO_WHATSAPP) {
    const listaDestinos = DESTINO_WHATSAPP.split(","); 
    for (const numero of listaDestinos) {
      const numeroLimpio = numero.trim();
      if (!numeroLimpio) continue;
      try {
        await axios.post(`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp", recipient_type: "individual", to: numeroLimpio, type: "text", text: { preview_url: false, body: texto }
        }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
      } catch (err) { console.error(`❌ Error WhatsApp para el número ${numeroLimpio}:`, err.message); }
    }
  }

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: TELEGRAM_CHAT_ID, text: texto }, { timeout: 8000 });
    console.log("✅ Notificación enviada a Telegram con éxito.");
  } catch (err) { console.error("❌ Error Telegram:", err.message); }
}

// ⏱️ RELOJ INTERNO: Revisa cada 1 minuto si son las 6:00 AM en Argentina
setInterval(async () => {
  const fechaArgentina = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hora = fechaArgentina.getHours();
  const minutos = fechaArgentina.getMinutes();
  const stringDia = fechaArgentina.toDateString(); // Ej: "Mon Jun 29 2026"

  // Si son las 6:00 AM y todavía no mandamos el reporte de este día calendario
  if (hora === 6 && minutos === 0 && ultimoDiaReportado !== stringDia) {
    ultimoDiaReportado = stringDia;
    console.log("⏰ 06:00 AM Detectado. Generando reporte diario de 24hs...");

    let resumenCortes = `\n\n📈 *BALANCE DE RED (ÚLTIMAS 24HS)*\n• Microcortes detectados: ${contadorMicrocortesDiarios}`;
    
    const reporteBase = ultimosDatosPlc 
      ? armarReporteTexto(ultimosDatosPlc, "📊 REPORTE DIARIO DE 24HS") 
      : "⏳ No es posible ver el estado actual porque la planta está desconectada.";

    // Despachamos el reporte consolidado
    await notificarMultiCanal(reporteBase + resumenCortes);

    // Reseteamos el contador para las próximas 24 horas
    contadorMicrocortesDiarios = 0;
  }
}, 60000);

// 📥 Planta (PC/Python)
app.post("/api/notificar", (req, res) => {
  const { datos } = req.body;
  if (!datos) return res.status(400).send({ error: "Falta datos" });
  res.status(200).send({ status: "OK" });

  const ahora = Date.now();
  const tiempoSilencioTranscurrido = ahora - momentoUltimoDato;

  // 🕵️ EVALUACIÓN DE MICRO_CORTES AL VOLVER LA CONEXIÓN
  // Si estuvo en silencio más de 30 segundos pero MENOS de 5 minutos, fue un microcorte exitosamente recuperado
  if (tiempoSilencioTranscurrido >= TIEMPO_MINIMO_MICROCORTE && tiempoSilencioTranscurrido < TIEMPO_LIMITE_ALERTA) {
    contadorMicrocortesDiarios++;
    console.log(`⚠️ Microcorte detectado y recuperado. Total hoy: ${contadorMicrocortesDiarios}`);
  }

  // Si la conexión volvió después de haber disparado la alerta de corte mayor (5 min)
  if (yaDisparoAlertaCorteMayor) {
    yaDisparoAlertaCorteMayor = false;
    notificarMultiCanal("✅ *COMUNICACIÓN REESTABLECIDA CON LA PLANTA*");
  }

  // Actualizamos marcas de tiempo y datos
  momentoUltimoDato = ahora;
  ultimosDatosPlc = datos;

  // Ejecuta la lógica automática de sensores (Presión, temp, etc) delegada en alertas.js
  procesarAlarmasAutomaticas(datos, estadosAnteriores, alarmasActivas, notificarFn => {
    // Si la planta está en línea, limpiamos la variable si el comando 'estado' se pide en un corte mayor
    if (yaDisparoAlertaCorteMayor) ultimosDatosPlc = null; 
    notificarMultiCanal(notificarFn);
  });

  //⚙️ GESTIÓN DEL TEMPORIZADOR DE CONEXIÓN
  if (tictacAlerta) clearTimeout(tictacAlerta);
  tictacAlerta = setTimeout(async () => {
    yaDisparoAlertaCorteMayor = true;
    ultimosDatosPlc = null; // Vaciamos los datos para que el comando 'estado' diga que no hay conexión
    await notificarMultiCanal("⚠️ *BIODIGESTOR SIN COMUNICACIÓN POR MÁS DE 5 MINUTOS*");
  }, TIEMPO_LIMITE_ALERTA);
});

// 📥 WEBHOOK ÚNICO E INTELIGENTE (Procesa respuestas del comando "estado")
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // Detectar si el mensaje viene de Telegram
    if (body.message && body.message.text) {
      const texto = body.message.text.trim().toLowerCase();
      if (texto === "estado") {
        const reporte = ultimosDatosPlc 
          ? armarReporteTexto(ultimosDatosPlc) 
          : "⏳ No es posible ver el estado actual porque la planta está desconectada.";
        
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, { chat_id: body.message.chat.id, text: reporte });
      }
    }

    // Detectar si el mensaje viene de WhatsApp
    if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const texto = body.entry[0].changes[0].value.messages[0].text?.body?.trim()?.toLowerCase();
      if (texto === "estado") {
        const reporte = ultimosDatosPlc 
          ? armarReporteTexto(ultimosDatosPlc) 
          : "⏳ No es posible ver el estado actual porque la planta está desconectada.";
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
  } catch (webhookErr) { console.error("⚠️ No se pudo auto-configurar el webhook:", webhookErr.message); }
});
