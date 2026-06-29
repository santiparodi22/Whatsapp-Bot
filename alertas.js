// 📐 Herramientas de formateo y conversión
const parseBool = (v) => String(v).toLowerCase() === "true" || v === true || v === 1 || v === "1";
const parseFloatArg = (v) => {
  if (!v) return 0.0;
  return parseFloat(String(v).replace(",", ".")) || 0.0;
};

// Función auxiliar para mostrar "ENCENDIDO 🟢" o "APAGADO 🔴"
const formatoOnOff = (v) => parseBool(v) ? "ENCENDIDO 🟢" : "APAGADO 🔴";

// 📊 ESTRUCTURA DEL REPORTE DE ESTADO MANUAL
function armarReporteTexto(datos, titulo = "📊 ESTADO EN TIEMPO REAL") {
  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  
  // Procesamiento de datos numéricos
  const pres1 = parseFloatArg(datos.presion_domo_1).toFixed(2); 
  const pres2 = parseFloatArg(datos.presion_domo_2).toFixed(2);
  const nivel1 = (parseFloatArg(datos.nivel_digestor_1) + 100).toFixed(2); 
  const nivel2 = (parseFloatArg(datos.nivel_digestor_2) + 100).toFixed(2);
  const temp1 = parseFloatArg(datos.modulo_1_temperatura_digestor_p).toFixed(2);
  const temp2 = parseFloatArg(datos.modulo_2_temperatura_digestor_p).toFixed(2);
  const nivelCarga = parseFloatArg(datos.nivel_camara_carga).toFixed(2);

  // RPM redondeadas a números enteros sin decimales
  const rpm1 = Math.round(parseFloatArg(datos.agitador_slider_1));
  const rpm2 = Math.round(parseFloatArg(datos.agitador_slider_2));
  const rpmCarga = Math.round(parseFloatArg(datos.agitador_camara_carga));

  // Armado del mensaje de texto formateado para el celular
  return `${titulo}

🕒 ${ahora}

🏭 *DOMO 1*
• Nivel: ${nivel1}
• Presión: ${pres1} mbar
• Temperatura: ${temp1} °C
• Agitador: ${rpm1} RPM
• Soplador 1: ${formatoOnOff(datos.soplador_domo_1)}
• Bomba Circulación 1: ${formatoOnOff(datos.bomba_circulacion_1)}

🏭 *DOMO 2*
• Nivel: ${nivel2}
• Presión: ${pres2} mbar
• Temperatura: ${temp2} °C
• Agitador: ${rpm2} RPM
• Soplador 2: ${formatoOnOff(datos.soplador_domo_2)}
• Bomba Circulación 2: ${formatoOnOff(datos.bomba_circulacion_2)}

📥 *CÁMARA DE CARGA*
• Nivel: ${nivelCarga}
• Agitadores: ${rpmCarga} RPM
• Bomba: ${formatoOnOff(datos.bomba_camara_carga)}

🎛️ *EQUIPOS CENTRALES*
• Chiller: ${formatoOnOff(datos.chiller)}
• Soplador Biogás: ${formatoOnOff(datos.soplador_biogas)}
• Caldera: ${formatoOnOff(datos.caldera)}
• Bomba Central: ${formatoOnOff(datos.bomba_central)}
• Ciclo de Agitación: ${formatoOnOff(datos.ciclo_agitacion)}`;
}

// 🚨 PROCESADOR DE ALARMAS AUTOMÁTICAS
function procesarAlarmasAutomaticas(datos, estadosAnteriores, alarmasActivas, notificarFn) {
  // Acá adentro tiramos la lógica de los avisos automáticos apenas definamos los límites
}

// Exportamos las funciones esenciales para el index.js
module.exports = {
  armarReporteTexto,
  procesarAlarmasAutomaticas
};
