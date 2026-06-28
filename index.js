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
const TIEMPO_LIMITE = 30 * 1000; // 30s de heartbeat

// 🧠 MEMORIA DE CONTROL DE RAILWAY (Reemplaza la memoria local de Python)
let ultimosDatosPlc = null;
let estadosAnteriores = {};
let alarmasActivas = new Set();

// Helpers de conversión de datos idénticos a los de Python
const parseBool = (v) => String(v).toLowerCase() === "true";
const parseFloatArg = (v) => {
  if (!v) return 0.0;
  return parseFloat(String(v).replace(",", ".")) || 0.0;
};

// Despachador Multicanal Simultáneo
async function notificarMultiCanal(texto) {
  console.log(`📢 Enviando Alerta: ${texto.split('\n')[0]}`);
  
  // WhatsApp
  try {
    await axios.post(`https://graph.facebook.com/v23.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: DESTINO_WHATSAPP,
      type: "text",
      text: { preview_url: false, body: texto }
    }, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Error WhatsApp:", err.response?.data || err.message);
  }

  // Telegram
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto
    }, { timeout: 8000 });
  } catch (err) {
    console.error("Error Telegram:", err.message);
  }
}

// Formateador de Reportes de variables
function armarReporteTexto(datos, titulo = "📊 ESTADO EN TIEMPO REAL") {
  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  
  const pres1 = parseFloatArg(datos.presion_domo_1);
  const pres2 = parseFloatArg(datos.presion_domo_2);
  const nivel1 = parseFloatArg(datos.nivel_digestor_1) + 100;
  const nivel2 = parseFloatArg(datos.nivel_digestor_2) + 100;

  return `${titulo}\n\n🕒 ${ahora}\n\n*DOMO 1*\nNivel: ${nivel1.toFixed(0)}\nPresión: ${pres1.toFixed(2)} mbar\n\n*DOMO 2*\nNivel: ${nivel2.toFixed(0)}\nPresión: ${pres2.toFixed(2)} mbar\n\n*DIGESTOR 1:* ${datos.modulo_1_temperatura_digestor_p || 0} °C\n*DIGESTOR 2:* ${datos.modulo_2_temperatura_digestor_p || 0} °C\n\n*AGITADOR 1:* ${datos.agitador_slider_1 || 0} RPM\n*AGITADOR 2:* ${datos.agitador_slider_2 || 0} RPM\n\nCiclo: ${datos.ciclo || 'false'}\nChiller: ${datos.chiller || 'false'}\nSoplador: ${datos.soplador_biogas || 'false'}`;
}

// 📥 ENDPOINT CENTRAL: Procesa la Telemetría y Evalúa Alarmas cada 5 segundos
app.post("/api/notificar", async (req, res) => {
  const { datos } = req.body;
  if (!datos) return res.status(400).send({ error: "Falta el paquete de datos" });

  // 1. Monitoreo de Heartbeat (Cortes de luz/internet)
  if (tictacAlerta) clearTimeout(tictacAlerta);
  tictacAlerta = setTimeout(async () => {
    const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    await notificarMultiCanal("⚠️ *BIODIGESTOR SIN COMUNICACIÓN*\n\nLa planta dejó de reportar datos hace más de 30 segundos.\n📅 " + ahora);
  }, TIEMPO_LIMITE);

  // 2. PROCESAMIENTO DE ALARMAS EN LA NUBE
  try {
    // --- Evaluador de Estados Digitales ---
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

    // --- Evaluador de Alarmas Analógicas ---
    const pres1 = parseFloatArg(datos.presion_domo_1);
    const pres2 = parseFloatArg(datos.presion_domo_2);
    const temp1 = parseFloatArg(datos.modulo_1_temperatura_digestor_p);
    const temp2 = parseFloatArg(datos.modulo_2_temperatura_digestor_p);
    const nivel1 = parseFloatArg(datos.nivel_digestor_1) + 100;
    const nivel2 = parseFloatArg(datos.nivel_digestor_2) + 100;
    const slider1 = parseFloatArg(datos.agitador_slider_1);
    const slider2 = parseFloatArg(datos.agitador_slider_2);

    const checkAlarmas = {
      "Presion Domo 1 Alta": { activa: pres1 > 4.0, msg: `🚨 ALARMA\n\nPresion Domo 1 Alta\nValor actual: ${pres1.toFixed(2)} mbar\nLímite: 4.00 mbar\nExceso: +${(pres1 - 4).toFixed(2)} mbar` },
      "Presion Domo 2 Alta": { activa: pres2 > 4.0, msg: `🚨 ALARMA\n\nPresion Domo 2 Alta\nValor actual: ${pres2.toFixed(2)} mbar\nLímite: 4.00 mbar\nExceso: +${(pres2 - 4).toFixed(2)} mbar` },
      "Nivel Tanque 1 alto": { activa: nivel1 > 650, msg: `🚨 ALARMA\n\nNivel Tanque 1 alto\nValor actual: ${nivel1.toFixed(0)}\nLímite: 650\nExceso: +${(nivel1 - 650).toFixed(0)}` },
      "Nivel Tanque 2 alto": { activa: nivel2 > 650, msg: `🚨 ALARMA\n\nNivel Tanque 2 alto\nValor actual: ${nivel2.toFixed(0)}\nLímite: 650\nExceso: +${(nivel2 - 650).toFixed(0)}` },
      "Temperatura Tanque 1 fuera de rango": { activa: (temp1 < 38.0 || temp1 > 40.5), msg: `🚨 ALARMA\n\nTemperatura Tanque 1 fuera de rango\nValor actual: ${temp1.toFixed(1)} °C\nRango: 38 °C - 40.5 °C` },
      "Temperatura Tanque 2 fuera de rango": { activa: (temp2 < 38.0 || temp2 > 40.5), msg: `🚨 ALARMA\n\nTemperatura Tanque 2 fuera de rango\nValor actual: ${temp2.toFixed(1)} °C\nRango: 38 °C - 40.5 °C` },
      "RPM Agitador 1 modificado": { activa: Math.abs(slider1 - 65) > 0.1, msg: `🚨 ALARMA\n\nRPM Agitador 1 modificado\nValor actual: ${slider1}\nValor esperado: 65` },
      "RPM Agitador 2 modificado": { activa: Math.abs(slider2 - 80) > 0.1, msg: `🚨 ALARMA\n\nRPM Agitador 2 modificado\nValor actual: ${slider2}\nValor esperado: 80` }
    };

    for (const [alarma, control] of Object.entries(checkAlarmas)) {
      if (control.activa && !alarmasActivas.has(alarma)) {
        await notificarMultiCanal(control.msg);
        alarmasActivas.add(alarma);
      } else if (!control.activa && alarmasActivas.has(alarma)) {
        await notificarMultiCanal(`✅ NORMALIZADO\n\n${alarma}`);
        alarmasActivas.remove(alarma);
      }
    }
  } catch (err) {
    console.error("Error evaluando lógica de alarmas en Railway:", err.message);
  }

  // Guardamos en la memoria global de Railway para el comando intermitente "estado"
  ultimosDatosPlc = datos;
  res.status(200).send({ status: "OK" });
});

// 📥 Webhook Interactivo para WhatsApp: "estado"
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account" && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
      const mensajeRecibido = body.entry[0].changes[0].value.messages[0];
      const textoUsuario = mensajeRecibido.text?.body?.trim()?.toLowerCase();

      if (textoUsuario === "estado") {
        if (!ultimosDatosPlc) {
          await notificarMultiCanal("⏳ Sincronizando con los sensores del PLC... Reintentá.");
        } else {
          const reporte = armarReporteTexto(ultimosDatosPlc);
          await notificarMultiCanal(reporte);
        }
      }
    }
  } catch (error) {
    console.error("Error en webhook:", error.message);
  }
  res.sendStatus(200);
});

// ⏰ Reportes Programados basados en la hora del servidor (Sincronizado es-AR)
setInterval(async () => {
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
}, 10000);

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === "mibot123") return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});

app.get("/", (req, res) => { res.send("Cerebro del Biodigestor en la Nube Activo"); });
app.listen(3000, () => { console.log("Servidor de Monitoreo listo."); });
