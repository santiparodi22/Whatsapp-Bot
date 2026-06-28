# -*- coding: utf-8 -*-

import requests
import time
from datetime import datetime

TOKEN = "7561117012:AAF1YrEWouH9LRK0_1Z05rY_FaqKQX0AC3M"
CHAT_ID = "8939764165"

WHATSAPP_TOKEN = "EAATl5uiU1L4BR1LId4azSJ1RJNjZCIQ3Cx62QZB4SWYCOYKCx5RHsRbQu2XVF2z1Ur96viOtYu4ldw1JldSXTs1tw3LFgkb0VeAUokMQUnxSA7BTnC6dxAatsoGLC1sbm3Kt5b9yDeFXkdrtVjZCJZASRaZBnrQPsztMwpJjRESDN0x7fpuuaMsyWpMLmJwZDZD"
PHONE_NUMBER_ID = "1229528586903969"
WHATSAPP_DESTINO = "5491162679990"

URL = "http://localhost/biodigestor/siemens.ashx?comando=busco_novedades_plc"
INTERVALO = 5

def enviar_telegram(mensaje):
    try:
        requests.post(
            f"https://api.telegram.org/bot{TOKEN}/sendMessage",
            json={"chat_id": CHAT_ID, "text": mensaje},
            timeout=10
        )
    except Exception as e:
        print("Error Telegram:", e)

def enviar_whatsapp(mensaje):
    try:
        # 🚀 Apuntamos a tu endpoint en Railway
        url = "https://biodigestor-monitor-production.up.railway.app/api/notificar"
        headers = {"Content-Type": "application/json"}
        payload = {"mensaje": mensaje}
        
        # Le enviamos el texto y Railway se encarga de distribuirlo al grupo
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        
        if response.status_code != 200:
            print(f"Railway rechazó el mensaje: {response.status_code} - {response.text}")
            
    except Exception as e:
        print("Error al desviar WhatsApp por Railway:", e)

def enviar_alerta(mensaje):
    enviar_telegram(mensaje)
    enviar_whatsapp(mensaje)

def leer_datos():
    r = requests.get(URL, timeout=10)
    datos = {}
    for item in r.text.split("@"):
        if ":" in item:
            k, v = item.split(":", 1)
            datos[k.strip()] = v.strip()
    return datos

def bool_value(v):
    return str(v).lower() == "true"

def float_value(v):
    try:
        return float(str(v).replace(",", "."))
    except:
        return 0.0

estado_anterior = {}
alarmas_activas = set()

ultimo_reporte_8h = ""
ultimo_resumen_diario = ""

temp1_min = 999
temp1_max = -999
temp2_min = 999
temp2_max = -999
presion1_max = 0
presion2_max = 0
cantidad_alarmas_dia = 0

enviar_alerta("🟢 Monitor Biodigestor iniciado")

while True:
    try:
        datos = leer_datos()

        estados = {
            "Calefaccion Tanque 1": bool_value(datos.get("calefaccion_manual_1", "false")),
            "Calefaccion Tanque 2": bool_value(datos.get("calefaccion_manual_2", "false")),
            "Chiller": bool_value(datos.get("chiller", "false")),
            "Soplador Biogas": bool_value(datos.get("soplador_biogas", "false")),
            "Caldera": bool_value(datos.get("quemador_caldera", "false")),
            "Agitacion Automatica Tanques": bool_value(datos.get("ciclo", "false")),
            "Soplador Tanque 1": bool_value(datos.get("domo_aire_1", "false")),
            "Soplador Tanque 2": bool_value(datos.get("domo_aire_2", "false")),
        }

        for nombre, valor in estados.items():
            if nombre not in estado_anterior:
                estado_anterior[nombre] = valor
                continue

            if estado_anterior[nombre] != valor:
                enviar_alerta(f'{"🟢" if valor else "🔴"} {nombre} {"ENCENDIDO" if valor else "APAGADO"}')
                estado_anterior[nombre] = valor

        presion1 = float_value(datos.get("presion_domo_1", 0))
        presion2 = float_value(datos.get("presion_domo_2", 0))
        temp1 = float_value(datos.get("modulo_1_temperatura_digestor_p", 0))
        temp2 = float_value(datos.get("modulo_2_temperatura_digestor_p", 0))
        nivel1 = float_value(datos.get("nivel_digestor_1", 0))+100
        nivel2 = float_value(datos.get("nivel_digestor_2", 0))+100
        slider1 = float_value(datos.get("agitador_slider_1", 0))
        slider2 = float_value(datos.get("agitador_slider_2", 0))

        temp1_min = min(temp1_min, temp1)
        temp1_max = max(temp1_max, temp1)
        temp2_min = min(temp2_min, temp2)
        temp2_max = max(temp2_max, temp2)
        presion1_max = max(presion1_max, presion1)
        presion2_max = max(presion2_max, presion2)

        alarmas = {
            "Presion Domo 1 Alta": presion1 > 4,
            "Presion Domo 2 Alta": presion2 > 4,
            "Temperatura Tanque 1 fuera de rango": temp1 < 38.0 or temp1 > 40.5,
            "Temperatura Tanque 2 fuera de rango": temp2 < 38.0 or temp2 > 40.5,
            "Nivel Tanque 1 alto": nivel1 > 650,
            "Nivel Tanque 2 alto": nivel2 > 650,
            "RPM Agitador 1 modificado": abs(slider1 - 65) > 0.1,
            "RPM Agitador 2 modificado": abs(slider2 - 80) > 0.1
        }

        for alarma, activa in alarmas.items():
            if activa and alarma not in alarmas_activas:

                cantidad_alarmas_dia += 1

                mensaje = f"🚨 ALARMA\n\n{alarma}"

                if alarma == "RPM Agitador 1 modificado":
                    mensaje += f"\nValor actual: {slider1}"
                    mensaje += "\nValor esperado: 65"

                elif alarma == "RPM Agitador 2 modificado":
                    mensaje += f"\nValor actual: {slider2}"
                    mensaje += "\nValor esperado: 80"

                elif alarma == "Nivel Tanque 1 alto":
                    mensaje += f"\nValor actual: {nivel1:.0f}"
                    mensaje += "\nLímite máximo: 650"
                    mensaje += f"\nExceso: +{nivel1 - 650:.0f}"

                elif alarma == "Nivel Tanque 2 alto":
                    mensaje += f"\nValor actual: {nivel2:.0f}"
                    mensaje += "\nLímite máximo: 650"
                    mensaje += f"\nExceso: +{nivel2 - 650:.0f}"

                elif alarma == "Presion Domo 1 Alta":
                    mensaje += f"\nValor actual: {presion1:.2f} mbar"
                    mensaje += "\nLímite máximo: 4.00 mbar"
                    mensaje += f"\nExceso: +{presion1 - 4:.2f} mbar"

                elif alarma == "Presion Domo 2 Alta":
                    mensaje += f"\nValor actual: {presion2:.2f} mbar"
                    mensaje += "\nLímite máximo: 4.00 mbar"
                    mensaje += f"\nExceso: +{presion2 - 4:.2f} mbar"

                elif alarma == "Temperatura Tanque 1 fuera de rango":
                    mensaje += f"\nValor actual: {temp1:.1f} °C"
                    mensaje += "\nRango permitido: 38 °C - 40.2 °C"

                    if temp1 < 38:
                        mensaje += f"\nPor debajo: {38 - temp1:.1f} °C"
                    else:
                        mensaje += f"\nPor encima: {temp1 - 40.2:.1f} °C"

                elif alarma == "Temperatura Tanque 2 fuera de rango":
                    mensaje += f"\nValor actual: {temp2:.1f} °C"
                    mensaje += "\nRango permitido: 38 °C - 40.2 °C"

                    if temp2 < 38:
                        mensaje += f"\nPor debajo: {38 - temp2:.1f} °C"
                    else:
                        mensaje += f"\nPor encima: {temp2 - 40.2:.1f} °C"

                enviar_alerta(mensaje)

                alarmas_activas.add(alarma)

            elif not activa and alarma in alarmas_activas:
                enviar_alerta(f"✅ NORMALIZADO\n\n{alarma}")
                alarmas_activas.remove(alarma)

        ahora = datetime.now()

        clave_reporte = ahora.strftime("%Y%m%d_%H")
        if ahora.hour in [0, 8, 16] and ahora.minute == 0:
            if ultimo_reporte_8h != clave_reporte:
                enviar_alerta(f"""📊 ESTADO GENERAL BIODIGESTOR

🕒 {ahora.strftime('%d/%m/%Y %H:%M')}

DOMO 1
Nivel: {nivel1}
Presión: {presion1}

DOMO 2
Nivel: {nivel2}
Presión: {presion2}

DIGESTOR 1: {temp1:.1f} °C
DIGESTOR 2: {temp2:.1f} °C

AGITADOR 1: {slider1}
AGITADOR 2: {slider2}

Ciclo: {datos.get('ciclo','')}
Chiller: {datos.get('chiller','')}
Soplador biogas: {datos.get('soplador_biogas','')}
""")
                ultimo_reporte_8h = clave_reporte

        clave_dia = ahora.strftime("%Y%m%d")
        if ahora.hour == 0 and ahora.minute == 5:
            if ultimo_resumen_diario != clave_dia:
                enviar_alerta(f"""📈 RESUMEN DIARIO

Tanque 1
Min: {temp1_min:.1f} °C
Max: {temp1_max:.1f} °C

Tanque 2
Min: {temp2_min:.1f} °C
Max: {temp2_max:.1f} °C

Presión máxima domo 1: {presion1_max}
Presión máxima domo 2: {presion2_max}

Cantidad de alarmas: {cantidad_alarmas_dia}
""")
                ultimo_resumen_diario = clave_dia
                temp1_min = 999
                temp1_max = -999
                temp2_min = 999
                temp2_max = -999
                presion1_max = 0
                presion2_max = 0
                cantidad_alarmas_dia = 0

        print(datetime.now().strftime("%H:%M:%S"), "OK")

    except Exception as e:
        print(datetime.now().strftime("%H:%M:%S"), "ERROR:", e)

    time.sleep(INTERVALO)
