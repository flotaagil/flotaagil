# Informe PoC GPS en segundo plano (H-3)

> Plantilla. Los campos marcados con `‹…›` se llenan después de probar en teléfonos reales.
> Evidencias (CSV exportados) en `docs/evidencias/H-3/`.

| Campo | Valor |
|---|---|
| Tarea | H-3 · Prueba de concepto de GPS en segundo plano (issue #6) |
| Riesgo | R-01: el sistema operativo detiene o espacia la ubicación con la app en segundo plano o la pantalla apagada |
| Bloquea | HU-02, HU-04, HU-29 |
| Responsable | Renato González |
| Fecha de ejecución | ‹AAAA-MM-DD a AAAA-MM-DD› |
| Versión probada | ‹commit› |

## 1. Objetivo

Validar que `@capacitor-community/background-geolocation` en Android 10+ entrega posiciones con la frecuencia, precisión y consumo que exige el informe, con la app en segundo plano y la pantalla apagada, y documentar qué ocurre cuando el usuario o el sistema cierra la app.

## 2. Criterios de éxito

| # | Criterio | Meta | Origen |
|---|---|---|---|
| C1 | Intervalo entre posiciones en viaje | 10 s | Informe |
| C2 | Intervalo entre posiciones en espera | 30 s | Informe |
| C3 | Huecos con pantalla apagada | Ninguno > 60 s | Informe (umbral «no confiable» de HU-02) |
| C4 | Datos por turno de 8 h | < 50 MB | Informe (RNF-07) |
| C5 | Precisión horizontal p95 | ≤ 50 m | **Propuesta del equipo** (la geocerca EN_ZONA es de 150 m) |
| C6 | Batería | Sin meta: se registra %/h | — |

## 3. Implementación

| Componente | Versión |
|---|---|
| Capacitor | 7.6.9 |
| @capacitor-community/background-geolocation | 1.2.26 (MIT) |
| Android | minSdk 29, targetSdk 35 |

**Cómo obtiene posiciones el plugin.** En Android, el servicio en primer plano del plugin pide posiciones a Fused Location Provider con un intervalo fijo de 1000 ms, prioridad `HIGH_ACCURACY` y `distanceFilter` como desplazamiento mínimo. No tiene opción de intervalo por tiempo.

**Decisión de muestreo.** Se usa `distanceFilter: 0` para que el plugin entregue posiciones aunque el teléfono esté quieto (escenario E2); con un filtro por distancia, un conductor detenido no generaría posiciones y C2 y C3 fallarían por diseño y no por el sistema operativo. La app registra solo una posición cada 10 s (modo «En viaje») o 30 s (modo «En espera»), decidiendo en cada entrega del plugin y no con temporizadores, porque estos se ralentizan en segundo plano. Consecuencia: el GPS trabaja a ~1 Hz y la batería medida es el **peor caso**; si C6 resulta alto, la mejora es ajustar el intervalo nativo del plugin (fork o parche) en la app real.

**Datos.** La PoC no envía nada. Por cada posición registrada calcula los bytes del mensaje que enviaría la app real (JSON con hora, lat, lon, precisión, velocidad y rumbo) más una sobrecarga **supuesta** de 80 bytes por mensaje (WebSocket, TLS, TCP/IP), y lo proyecta a 8 h. Se contrasta con la lectura manual de Ajustes → Red → Uso de datos de la app.

**Consentimiento (RN-18).** La app muestra el aviso de uso de ubicación antes de la primera sesión y solo registra mientras hay una sesión iniciada, con notificación fija.

**Registro.** Dos CSV en el almacenamiento privado de la app, exportables desde la app:
- `posiciones.csv`: una fila por posición registrada (sesión, hora, modo, lat, lon, precisión, velocidad, rumbo, intervalo, entregas del plugin desde la anterior, batería, carga, segundo plano, bytes estimados).
- `eventos.csv`: inicio, fin, cambio de modo, paso a segundo y primer plano, errores y sesiones **interrumpidas** (la app se cerró sin detener la sesión; se detecta al reabrir).

## 4. Teléfonos

| Teléfono | Marca y modelo | Android | Capa del fabricante | Ahorro de batería de la app |
|---|---|---|---|---|
| T1 | ‹marca y modelo› | ‹versión› | ‹One UI / MIUI / HyperOS / stock…› | ‹optimizada / sin restricciones› |

Condiciones comunes: datos móviles o Wi-Fi ‹…›, ubicación en «alta precisión», permiso de ubicación «solo mientras se usa la app» (el plugin usa servicio en primer plano y no requiere ubicación en segundo plano).

## 5. Escenarios

| # | Escenario | Duración | Modo | Pantalla | Procedimiento |
|---|---|---|---|---|---|
| E1 | Primer plano | 15 min | Viaje | Encendida | App abierta, en movimiento |
| E2 | Espera con pantalla apagada | 60 min | Espera | Apagada | Teléfono quieto, app en segundo plano |
| E3 | Viaje con pantalla apagada | 60 min | Viaje | Apagada | En vehículo, app en segundo plano |
| E4 | Cerrar la app | 10 min + reabrir | Viaje | Apagada | Iniciar, deslizar la app fuera de recientes, esperar 5 min, reabrir |
| E5 | Ahorro de batería activo | 30 min | Espera | Apagada | Igual que E2 con el ahorro de batería del sistema encendido |
| E6 | Turno completo (recomendado) | 8 h | Mixto | Mayormente apagada | Turno simulado alternando viaje y espera; valida C4 sin proyectar y el efecto de Doze a largo plazo |

E6 se recomienda porque C4 se define por turno de 8 h y porque Doze y los gestores de batería de algunos fabricantes actúan después de horas, no de minutos. Si no se puede ejecutar, C4 queda validado por proyección de E2 y E3 y se declara así en la conclusión.

## 6. Resultados

Valores tomados del resumen de cada sesión en la app (o de `posiciones.csv`).

| Esc. | Tel. | Sesión | Muestras | Intervalo mediana / p95 / máx (s) | Huecos > 60 s | Precisión mediana / p95 (m) | Batería (%/h) | Datos estimados (MB/h · MB/8 h) | Datos medidos en Ajustes (MB) | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|
| E1 | T1 | ‹S…› | ‹…› | ‹…› | ‹…› | ‹…› | ‹…› | ‹…› | ‹…› | ‹…› |
| E2 | T1 | | | | | | | | | |
| E3 | T1 | | | | | | | | | |
| E4 | T1 | | | | | | | | | ‹¿siguió el servicio tras cerrar la app? hueco hasta reabrir› |
| E5 | T1 | | | | | | | | | |
| E6 | T1 | | | | | | | | | |

### Comportamiento al cerrar la app (E4)

- ¿La notificación siguió visible después de deslizar la app? ‹sí/no›
- ¿Hubo posiciones entre el cierre y la reapertura? ‹sí/no; hueco de ‹…› s›
- ¿La app marcó la sesión como interrumpida al reabrir? ‹sí/no›

## 7. Evaluación

| Criterio | Resultado | Cumple |
|---|---|---|
| C1 Intervalo en viaje 10 s | ‹mediana / p95› | ‹sí/no› |
| C2 Intervalo en espera 30 s | ‹…› | ‹…› |
| C3 Sin huecos > 60 s con pantalla apagada | ‹…› | ‹…› |
| C4 Datos < 50 MB / 8 h | ‹medido en E6 o proyectado de E2/E3› | ‹…› |
| C5 Precisión p95 ≤ 50 m (propuesta del equipo) | ‹…› | ‹…› |
| C6 Batería | ‹%/h; proyección a 8 h› | — |

## 8. Conclusión y decisión

‹¿Se mantiene el plugin para HU-02, HU-04 y HU-29? ¿Qué ajustes requiere la app real (intervalo nativo, instrucciones de ahorro de batería al conductor, manejo de cierre)? Riesgos que quedan abiertos.›

## 9. Limitaciones

- Una sola marca de teléfono: los resultados no representan a otros fabricantes con gestores de batería más agresivos.
- Los datos son estimados (con sobrecarga supuesta) y se contrastan con una lectura manual.
- La batería medida corresponde al GPS a ~1 Hz (peor caso).
- JavaScript no detecta si la pantalla está apagada: esa condición la registra quien prueba, por escenario.
