// 📐 Herramientas de formateo (mantenelas intactas)
const parseBool = (v) => String(v).toLowerCase() === "true";
const parseFloatArg = (v) => {
  if (!v) return 0.0;
  return parseFloat(String(v).replace(",", ".")) || 0.0;
};

// 📝 REGLA 1: Formato del reporte manual ("estado")
function armarReporteTexto(datos, titulo = "📊 ESTADO EN TIEMPO REAL") {
  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  const pres1 = parseFloatArg(datos.presion_domo_1); 
  const pres2 = parseFloatArg(datos.presion_domo_2);
  const nivel1 = parseFloatArg(datos.nivel_digestor_1) + 100; 
  const nivel2 = parseFloatArg(datos.nivel_digestor_2) + 100;
  
  // Acá podés editar libremente el diseño y los textos de tu reporte:
  return `${titulo}

🕒 ${ahora}

*DOMO 1*
Nivel: ${nivel1.toFixed(0)}
Presión: ${pres1.toFixed(2)} mbar

*DOMO 2*
Nivel: ${nivel2.toFixed(0)}
Presión: ${pres2.toFixed(2)} mbar

*DIGESTOR 1:* ${datos.modulo_1_temperatura_digestor_p || 0} °C
*DIGESTOR 2:* ${datos.modulo_2_temperatura_digestor_p || 0} °C

*AGITADOR 1:* ${datos.agitador_slider_1 || 0} RPM
*AGITADOR 2:* ${datos.agitador_slider_2 || 0} RPM`;
}

// 🚨 REGLA 2: Procesador de Alarmas Automáticas (Próximamente meterás mano acá)
function procesarAlarmasAutomaticas(datos, estadosAnteriores, alarmasActivas, notificarFn) {
  // Por ahora se mantiene vacío y seguro. 
  // Cuando quieras crear una alerta (ej. por alta presión), la programamos acá adentro.
}

// Exportamos las funciones para que el index.js las pueda usar
module.exports = {
  armarReporteTexto,
  procesarAlarmasAutomaticas
};
