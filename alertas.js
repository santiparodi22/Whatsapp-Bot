// 📐 Herramientas de formateo y conversión
const parseBool = (v) => String(v).toLowerCase() === "true" || v === true || v === 1 || v === "1";
const parseFloatArg = (v) => {
  if (!v) return 0.0;
  return parseFloat(String(v).replace(",", ".")) || 0.0;
};

// Función auxiliar para mostrar "ENCENDIDO" o "APAGADO" sin emojis
const formatoOnOff = (v) => parseBool(v) ? "ENCENDIDO" : "APAGADO";

// 📊 ESTRUCTURA DEL REPORTE DE ESTADO MANUAL
function armarReporteTexto(datos, titulo = "📊 ESTADO EN TIEMPO REAL") {
  const ahora = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  
  const pres1 = parseFloatArg(datos.presion_domo_1).toFixed(2); 
  const pres2 = parseFloatArg(datos.presion_domo_2).toFixed(2);
  const temp1 = parseFloatArg(datos.modulo_1_temperatura_digestor_p).toFixed(2);
  const temp2 = parseFloatArg(datos.modulo_2_temperatura_digestor_p).toFixed(2);

  const nivel1 = Math.round(parseFloatArg(datos.nivel_digestor_1) + 100); 
  const nivel2 = Math.round(parseFloatArg(datos.nivel_digestor_2) + 100);
  const nivelCarga = Math.round(parseFloatArg(datos.profundidad_de_camara_de_carga));
  
  const rpm1 = Math.round(parseFloatArg(datos.agitador_slider_1));
  const rpm2 = Math.round(parseFloatArg(datos.agitador_slider_2));

  return `${titulo}

🕒 ${ahora}

*DOMO 1*
• Nivel: ${nivel1} mm
• Presión: ${pres1} mbar
• Temperatura: ${temp1} °C
• Agitador: ${rpm1} RPM
• Soplador 1: ${formatoOnOff(datos.domo_aire_1)}
• Bomba Circulación 1: ${formatoOnOff(datos.bomba_circulacion_1)}

*DOMO 2*
• Nivel: ${nivel2} mm
• Presión: ${pres2} mbar
• Temperatura: ${temp2} °C
• Agitador: ${rpm2} RPM
• Soplador 2: ${formatoOnOff(datos.domo_aire_2)}
• Bomba Circulación 2: ${formatoOnOff(datos.bomba_circulacion_2)}

*CÁMARA DE CARGA*
• Nivel: ${nivelCarga} mm
• Agitadores: ${formatoOnOff(datos.agitador_camara_carga)}
• Bomba: ${formatoOnOff(datos.bomba_camara_carga)}

*EQUIPOS CENTRALES*
• Chiller: ${formatoOnOff(datos.chiller)}
• Soplador Biogás: ${formatoOnOff(datos.soplador_biogas)}
• Caldera: ${formatoOnOff(datos.caldera)}
• Bomba Central: ${formatoOnOff(datos.bomba_central)}
• Ciclo de Agitación: ${formatoOnOff(datos.ciclo_agitacion)}`;
}

// 🚨 VARIABLES GLOBALES DE TIEMPO EN MEMORIA (Para filtros de 30 minutos)
let desdeCuandoFallaTemp1 = null;
let desdeCuandoFallaTemp2 = null;
let desdeCuandoCicloApagado = null;

// 🚨 PROCESADOR DE ALARMAS AUTOMÁTICAS
function procesarAlarmasAutomaticas(datos, estadosAnteriores, alarmasActivas, notificarFn) {
  const ahoraMs = Date.now();

  // Función interna para evaluar condiciones con memoria (evita re-notificar)
  function evaluarAlerta(idAlerta, condicionCumplida, mensajeAlerta, mensajeNormalizado) {
    if (condicionCumplida) {
      if (!alarmasActivas.has(idAlerta)) {
        alarmasActivas.add(idAlerta);
        notificarFn(`🚨 *ALERTA: ${idAlerta}*\n${mensajeAlerta}`);
      }
    } else {
      if (alarmasActivas.has(idAlerta)) {
        alarmasActivas.delete(idAlerta);
        notificarFn(`✅ *NORMALIZADO: ${idAlerta}*\n${mensajeNormalizado}`);
      }
    }
  }

  // --- 1. ALERTA DE PRESIÓN MÁXIMA (4 mbar) ---
  const p1 = parseFloatArg(datos.presion_domo_1);
  const p2 = parseFloatArg(datos.presion_domo_2);
  evaluarAlerta("PRESIÓN DOMO 1 ALTA", p1 > 4.0, `La presión actual es de ${p1.toFixed(2)} mbar (Máx: 4.0 mbar)`, `Presión regulada a ${p1.toFixed(2)} mbar`);
  evaluarAlerta("PRESIÓN DOMO 2 ALTA", p2 > 4.0, `La presión actual es de ${p2.toFixed(2)} mbar (Máx: 4.0 mbar)`, `Presión regulada a ${p2.toFixed(2)} mbar`);

  // --- 2. ALERTA DE NIVELES MÁXIMOS (640 mm) ---
  const n1 = Math.round(parseFloatArg(datos.nivel_digestor_1) + 100);
  const n2 = Math.round(parseFloatArg(datos.nivel_digestor_2) + 100);
  const nCarga = Math.round(parseFloatArg(datos.profundidad_de_camara_de_carga));
  evaluarAlerta("NIVEL DOMO 1 ALTO", n1 > 640, `El nivel actual es de ${n1} mm (Máx: 640 mm)`, `Nivel normalizado a ${n1} mm`);
  evaluarAlerta("NIVEL DOMO 2 ALTO", n2 > 640, `El nivel actual es de ${n2} mm (Máx: 640 mm)`, `Nivel normalizado a ${n2} mm`);
  evaluarAlerta("NIVEL CÁMARA DE CARGA ALTO", nCarga > 640, `El nivel actual es de ${nCarga} mm (Máx: 640 mm)`, `Nivel normalizado a ${nCarga} mm`);

  // --- 3. ALERTA DE TEMPERATURA CON FILTRO DE 30 MINUTOS ---
  const t1 = parseFloatArg(datos.modulo_1_temperatura_digestor_p);
  const t2 = parseFloatArg(datos.modulo_2_temperatura_digestor_p);
  const fueraRangoT1 = t1 < 37.5 || t1 > 40.2;
  const fueraRangoT2 = t2 < 37.5 || t2 > 40.2;

  // Evaluación Domo 1
  if (fueraRangoT1) {
    if (!desdeCuandoFallaTemp1) desdeCuandoFallaTemp1 = ahoraMs;
  } else {
    desdeCuandoFallaTemp1 = null;
  }
  const tiempoFallaT1Minutos = desdeCuandoFallaTemp1 ? (ahoraMs - desdeCuandoFallaTemp1) / (1000 * 60) : 0;
  evaluarAlerta("TEMPERATURA DOMO 1 FUERA DE RANGO", tiempoFallaT1Minutos >= 30, `La temperatura lleva 30+ minutos en ${t1.toFixed(2)} °C (Rango OK: 37.5 - 40.2 °C)`, `Temperatura normalizada a ${t1.toFixed(2)} °C`);

  // Evaluación Domo 2
  if (fueraRangoT2) {
    if (!desdeCuandoFallaTemp2) desdeCuandoFallaTemp2 = ahoraMs;
  } else {
    desdeCuandoFallaTemp2 = null;
  }
  const tiempoFallaT2Minutos = desdeCuandoFallaTemp2 ? (ahoraMs - desdeCuandoFallaTemp2) / (1000 * 60) : 0;
  evaluarAlerta("TEMPERATURA DOMO 2 FUERA DE RANGO", tiempoFallaT2Minutos >= 30, `La temperatura lleva 30+ minutos en ${t2.toFixed(2)} °C (Rango OK: 37.5 - 40.2 °C)`, `Temperatura normalizada a ${t2.toFixed(2)} °C`);

  // --- 4. ALERTA DE MODIFICACIÓN DE RPM EN AGITADORES ---
  const rpm1 = Math.round(parseFloatArg(datos.agitador_slider_1));
  const rpm2 = Math.round(parseFloatArg(datos.agitador_slider_2));
  evaluarAlerta("RPM ALTERADAS AGITADOR 1", rpm1 !== 65 && rpm1 !== 0, `Las RPM cambiaron a ${rpm1} RPM (Esperado: 65 RPM)`, `Agitador 1 reestablecido a ${rpm1} RPM`);
  evaluarAlerta("RPM ALTERADAS AGITADOR 2", rpm2 !== 80 && rpm2 !== 0, `Las RPM cambiaron a ${rpm2} RPM (Esperado: 80 RPM)`, `Agitador 2 reestablecido a ${rpm2} RPM`);

  // --- 5. ALERTA CICLO DE AGITACIÓN DESACTIVADO (FILTRO > 30 MIN) ---
  const cicloApagado = !parseBool(datos.ciclo_digitacion);
  if (cicloApagado) {
    if (!desdeCuandoCicloApagado) desdeCuandoCicloApagado = ahoraMs;
  } else {
    desdeCuandoCicloApagado = null;
  }
  const tiempoCicloApagadoMinutos = desdeCuandoCicloApagado ? (ahoraMs - desdeCuandoCicloApagado) / (1000 * 60) : 0;
  evaluarAlerta("CICLO DE AGITACIÓN DESACTIVADO MANUALLY", tiempoCicloApagadoMinutos >= 30, `El ciclo de agitación general lleva apagado más de 30 minutos de forma continua. Posible desactivación manual.`, `Ciclo de agitación reactivado con éxito.`);

  // --- 6. CAMBIOS DE ESTADO ON/OFF EN EQUIPOS ---
  const equiposA Monitorear = [
    { clave: "domo_aire_1", nombre: "Soplador Aire Domo 1" },
    { clave: "domo_aire_2", nombre: "Soplador Aire Domo 2" },
    { clave: "bomba_circulacion_1", nombre: "Bomba Circulación Domo 1" },
    { clave: "bomba_circulacion_2", nombre: "Bomba Circulación Domo 2" },
    { clave: "bomba_camara_carga", nombre: "Bomba Cámara de Carga" },
    { clave: "agitador_camara_carga", nombre: "Agitador Cámara de Carga" },
    { clave: "chiller", nombre: "Chiller Central" },
    { clave: "soplador_biogas", nombre: "Soplador de Biogás" },
    { clave: "caldera", nombre: "Caldera Central" },
    { clave: "bomba_central", nodeNombre: "Bomba Central" }
  ];

  equiposAMonitorear.forEach((equipo) => {
    const estadoActual = parseBool(datos[equipo.clave]);
    const idAlerta = `ESTADO ${equipo.nombre.toUpperCase()}`;
    
    // Verificamos si existe un estado anterior guardado en memoria para notar el "cambio"
    if (estadosAnteriores[equipo.clave] !== undefined) {
      const estadoAnterior = estadosAnteriores[equipo.clave];
      if (estadoActual !== estadoAnterior) {
        // Enviar notificación inmediata del cambio
        const msg = estadoActual ? "🟢 ENCENDIDO" : "🔴 APAGADO";
        notificarFn(`⚙️ *CAMBIO DE ESTADO*\nEl equipo *${equipo.nombre}* pasó a: *${msg}*`);
      }
    }
    // Guardamos el estado actual en la memoria global para la próxima lectura (en 5 segundos)
    estadosAnteriores[equipo.clave] = estadoActual;
  });
}

module.exports = {
  armarReporteTexto,
  procesarAlarmasAutomaticas
};
