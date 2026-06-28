const express = require("express");
const axios = require("axios");

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

// Memoria de control en la nube
let ultimosDatosPlc = null;
let estadosAnteriores = {};
let alarmasActivas = new Set();

const parseBool = (v) => String(v).toLowerCase() === "true";
const parseFloatArg = (v) => {
  if (!v) return 0.0;
  return parseFloat(String(v).replace(",", ".")) || 0.0;
};

// Despachador Multicanal (Manda en paralelo a WhatsApp y Telegram)
async function notificarMultiCanal(texto) {
  console.log(`📢 Despachando notificación: ${texto.split('\n')[0]}`);
  
  // 1. Envío a WhatsApp
  try {
    await axios.post(`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: DESTINO_WHATSAPP,
      type: "text",
      text: { preview_url: false, body: texto }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("❌ Error en la API de WhatsApp:", err.response?.data || err.message);
  }

  // 2. Envío a Telegram
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto
    }, { timeout: 8000 });
  } catch (err) {
    console.error("❌ Error en la API de Telegram:", err.message);
  }
}

// Formateador de Reportes Industriales
function armarReporteTexto(datos, titulo = "📊 ESTADO EN TIEMPO REAL") {
  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  
  const pres1 = parseFloatArg(datos.presion_domo_1);
  const pres2 = parseFloatArg(datos.presion_domo_2);
  const nivel1 = parseFloatArg(datos.nivel_digestor_1) + 100;
  const nivel2 = parseFloatArg(datos.nivel_digestor_2) + 100;

  return `${titulo}\n\n🕒 ${ahora}\n\n*DOMO 1*\nNivel: ${nivel1.toFixed(0)}\nPresión: ${pres1.toFixed(2)} mbar\n\n*DOMO 2*\nNivel: ${nivel2.toFixed(0)}\nPresión: ${pres2.toFixed(2)} mbar\n\n*DIGESTOR 1:* ${datos.modulo_1_temperatura_digestor_p || 0} °C\n*DIGESTOR 2:* ${datos.modulo_2_temperatura_digestor_p || 0} °C\n\n*AGITADOR 1:* ${datos.agitador_slider_1 || 0} RPM\n*AGITADOR 2:* ${datos.agitador_slider_2 || 0} RPM\n\nCiclo: ${datos.ciclo || 'false'}\nChiller: ${datos.chiller || 'false'}\nSoplador: ${datos.soplador_biogas || 'false'}`;
}

// 📥 ENDPOINT CENTRAL: Recibe la telemetría del Python de la Planta
app.post("/api/notificar", (req, res) => {
  const { datos } = req.body;
  
  if (!datos) {
    return res.status(400).send({ error: "Falta el paquete de datos" });
  }

  // Respuesta instantánea para asegurar el HTTP 200 OK y evitar 502
  res.status(200).send({ status: "OK" });

  // Procesamiento asincrónico en segundo plano
  setTimeout(async () => {
    ultimosDatosPlc = datos;

    // Control de desconexión (Heartbeat)
    if (tictacAlerta) clearTimeout(tictacAlerta);
    tictacAlerta = setTimeout(async () => {
      const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
      await notificarMultiCanal("⚠️ *BIODIGESTOR SIN COMUNICACIÓN*\n\nLa planta dejó de reportar datos hace más de 30 segundos.\n📅 " + ahora);
    }, TIEMPO_LIMITE);

    // EVALUACIÓN DE ALARMAS
    try {
      // 1. Estados Digitales
      const mapeoEquipos = {
        "Calefaccion Tanque 1": "calefaccion_manual_1",
        "Calefaccion Tanque 2": "calefaccion_manual_2",
        "Chiller": "chiller",
        "Soplador Biogas": "soplador_biogas",
        "Caldera": "quemador_caldera",
        "Agitacion Automatica Tanques": "ciclo",
        "Soplador Tanque 1": "domo_aire_1",
        "Soplador Tanque 2": "domo_aire_2"
      };

      for (const [nombre, llave] of Object.entries(mapeoEquipos)) {
        const valorActual = parseBool(datos[llave]);
        if (estadosAnteriores[nombre] !== undefined && estadosAnteriores[nombre] !== valorActual) {
          await notificarMultiCanal(`${valorActual ? "🟢" : "🔴"} ${nombre} ${valorActual ? "ENCENDIDO" : "APAGADO"}`);
        }
        estadosAnteriores[nombre] = valorActual;
      }

      // 2. Variables Analógicas
      const pres1 = parseFloatArg(datos.presion_domo_1);
      const pres2 = parseFloatArg(datos.presion_domo_2);
      const temp1 = parseFloatArg(datos.modulo_1_temperatura_digestor_p);
      const temp2 = parseFloatArg(datos.modulo_2_temperatura_digestor_p);
      const nivel1 = parseFloatArg(datos.nivel_digestor_1) + 100;
      const nivel2 = parseFloatArg(datos.nivel_digestor_2) + 100;
      const slider1 = parseFloatArg(datos.agitador_slider_1);
      const slider2 = parseFloatArg(datos.agitador_slider_2);

      const checkAlarmas = {
        "Presion Domo 1 Alta": { activa: pres1 > 4.0, msg: `🚨 ALARMA\n\nPresion Domo 1 Alta\nValor actual: ${pres1.toFixed(2)} mbar` },
        "Presion Domo 2 Alta": { activa: pres2 > 4.0, msg: `🚨 ALARMA\n\nPresion Domo 2 Alta\nValor actual: ${pres2.toFixed(2)} mbar` },
        "Nivel Tanque 1 alto": { activa: nivel1 > 650, msg: `🚨 ALARMA\n\nNivel Tanque 1 alto\nValor actual: ${nivel1.toFixed(0)}` },
        "Nivel Tanque 2 alto": { activa: nivel2 > 650, msg: `🚨 ALARMA\n\nNivel Tanque 2 alto\nValor actual: ${nivel2.toFixed(0)}` },
        "Temperatura Tanque 1 fuera de rango": { activa: (temp1 < 38.0 || temp1 > 40.5), msg: `🚨 ALARMA\n\nTemperatura Tanque 1 fuera de rango\nValor actual: ${temp1.toFixed(1)} °C` },
        "Temperatura Tanque 2 fuera de rango": { activa: (temp2 < 38.0 || temp2 > 40.5), msg: `🚨 ALARMA\n\nTemperatura Tanque 2 fuera de rango\nValor actual: ${temp2.toFixed(1)} °C` },
        "RPM Agitador 1 modificado": { activa: Math.abs(slider1 - 65) > 0.1, msg: `🚨 ALARMA\n\nRPM Agitador 1 modificado\nValor actual: ${slider1}` },
        "RPM Agitador 2 modificado": { activa: Math.abs(slider2 - 80) > 0.1, msg: `🚨 ALARMA\n\nRPM Agitador 2 modificado\nValor actual: ${slider2}` }
      };

      for (const [alarma, control] of Object.entries(checkAlarmas)) {
        if (control.activa && !alarmasActivas.has(alarma)) {
          await notificarMultiCanal(control.msg);
          alarmasActivas.add(alarma);
        } else if (!control.activa && alarmasActivas.has(alarma)) {
          await notificarMultiCanal(`✅ NORMALIZADO\n\n${alarma}`);
          alarmasActivas.delete(alarma);
        }
      }
    } catch (err) {
      console.error("❌ Error procesando lógica de alarmas:", err.message);
    }
  }, 0);
});

// 📥 WEBHOOK UNIFICADO: Escucha comandos desde WhatsApp y Telegram en la misma ruta
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    // 1. Detección si el mensaje viene de WhatsApp Business API
    if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      console.log("🟢 Mensaje entrante detectado desde: WHATSAPP");
      const mensajeRecibido = body.entry[0].changes[0].value.messages[0];
      const textoUsuario = mensajeRecibido.text?.body?.trim()?.toLowerCase();

      if (textoUsuario === "estado") {
        const reporte = ultimosDatosPlc ? armarReporteTexto(ultimosDatosPlc) : "⏳ Sincronizando con los sensores locales del PLC... Reintentá.";
        await notificarMultiCanal(reporte);
      }
    }

    // 2. Detección si el mensaje viene desde los servidores de Telegram
    if (body.message && body.message.text) {
      console.log("✈️ Mensaje entrante detectado desde: TELEGRAM");
      const textoUsuario = body.message.text.trim().toLowerCase();

      if (textoUsuario === "estado") {
        const reporte = ultimosDatosPlc ? armarReporteTexto(ultimosDatosPlc) : "⏳ Sincronizando con los sensores locales del PLC... Reintentá.";
        await notificarMultiCanal(reporte);
      }
    }

  } catch (error) {
    console.error("❌ Error procesando el Webhook unificado:", error.message);
  }
  res.sendStatus(200);
});

// ⏰ REPORTES AUTOMÁTICOS PROGRAMADOS (Hora de Argentina GMT-3)
setInterval(async () => {
  try {
    const ahora = new Date();
    const horaArg = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    
    const h = horaArg.getHours();
    const m = horaArg.getMinutes();
    const s = horaArg.getSeconds();

    if (ultimosDatosPlc && m === 0 && s < 10) {
      if (h === 0 || h === 8 || h === 16) {
        const titulo = h === 0 ? "📈 RESUMEN DIARIO GENERAL" : "📊 ESTADO GENERAL BIODIGESTOR (8hs)";
        const reporteProgramado = armarReporteTexto(ultimosDatosPlc, titulo);
        await notificarMultiCanal(reporteProgramado);
      }
    }
  } catch (cronErr) {
    console.error("❌ Error interno en reloj programado:", cronErr.message);
  }
}, 10000);

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === "mibot123") return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.get("/", (req, res) => { res.send("Cerebro del Biodigestor en la Nube Activo"); });

// CONFIGURACIÓN DE RED PURA DE ALTA COMPATIBILIDAD
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => { 
  console.log(`🚀 Servidor levantado exitosamente en puerto ${PORT}`); 
});
