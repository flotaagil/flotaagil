# Informe PoC GPS en segundo plano (H-3)

> Plantilla. Los campos marcados con `‹…›` se llenan después de probar en teléfonos reales.
> Evidencias en `docs/evidencias/H-3/`: CSV **anonimizados** con `docs/scripts/anonimizar_poc_gps.py` (sin latitud, longitud, altitud ni rumbo; con distancia desde la posición anterior). Los CSV originales no se suben al repositorio.

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
| T1 | Xiaomi 14T | 16 (parche de seguridad 2026-08-01) | Xiaomi HyperOS 3.0.303.0 | Ver tabla por escenario |

Condiciones comunes: datos móviles o Wi-Fi ‹…›, ubicación del sistema activada, permiso de ubicación «Mientras se usa la app» con **ubicación precisa activada** (el plugin usa un servicio en primer plano y no requiere ubicación en segundo plano), notificaciones de la app permitidas.

### 4.1 Configuración del teléfono por escenario

HyperOS restringe las apps en segundo plano más que Android estándar. La **configuración recomendada** es la que se le pediría al conductor en la app real; E2b mide qué pasa si el conductor no la aplica.

| Esc. | Ahorro de batería de la app | Inicio automático | Bloqueada en recientes | Ahorro de batería del sistema | Ubicación precisa | Notificaciones | Confirmado al probar |
|---|---|---|---|---|---|---|---|
| E1 | Sin restricciones | Activado | Sí | Desactivado | Sí | Permitidas | ‹sí/no› |
| E2 | Sin restricciones | Activado | Sí | Desactivado | Sí | Permitidas | ‹sí/no› |
| E2b | Ahorro de batería inteligente (valor por defecto) | Desactivado (por defecto) | No | Desactivado | Sí | Permitidas | ‹sí/no› |
| E3 | Sin restricciones | Activado | Sí | Desactivado | Sí | Permitidas | ‹sí/no› |
| E4 | Sin restricciones | Activado | **No** (hay que desbloquearla para poder cerrarla) | Desactivado | Sí | Permitidas | ‹sí/no› |
| E5 | Sin restricciones | Activado | Sí | **Activado** | Sí | Permitidas | ‹sí/no› |
| E6 | Sin restricciones | Activado | Sí | Desactivado | Sí | Permitidas | ‹sí/no› |

Si algún ajuste quedó distinto al planificado, se corrige la fila y se explica en Observaciones.

## 5. Escenarios

| # | Escenario | Duración | Modo | Pantalla | Procedimiento |
|---|---|---|---|---|---|
| E1 | Primer plano | 15 min | Viaje | Encendida | App abierta, en movimiento |
| E2 | Espera con pantalla apagada | 60 min | Espera | Apagada | Teléfono quieto, app en segundo plano |
| E2b | Espera sin configurar el teléfono | 60 min | Espera | Apagada | Igual que E2, con los ajustes de HyperOS por defecto (sección 4.1) |
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
| E2b | T1 | | | | | | | | | |
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

## 7.1 Diagnósticos

### D1 · 2026-10-28 · El JavaScript se suspende con la pantalla apagada (T1)

**Hallazgo previo.** En una sesión de prueba (modo espera, cable conectado) la app dejó de registrar 79 s con la pantalla apagada, aunque el log de Android mostraba que el sistema seguía entregando posiciones al proceso cada 1 s.

**Prueba controlada.** Build de diagnóstico (`VITE_DIAGNOSTICO=1`) que registra en consola cada entrega del plugin que llega al JavaScript; log del teléfono capturado en vivo en el PC. Modo espera, app con candado en recientes, cable conectado, pantalla apagada 5 min sin tocar el teléfono.

| Minuto | Entregas de Android al proceso | Entregas que llegaron al JavaScript |
|---|---|---|
| 16:05 | 38 | 62 |
| 16:06 | 60 | 21 (última a las 16:06:20) |
| 16:07 | 60 | 0 |
| 16:08 | 60 | 0 |
| 16:09 | 60 | 0 |
| 16:10 (al reabrir) | 3 | 229 de una vez |

En 16:05 el conteo nativo es menor porque la sesión partió a las 16:04:55 y las primeras entregas no quedaron identificadas en el log.

**Conclusión.**
- El sistema siguió entregando posiciones a la app una vez por segundo durante todo el periodo (registro del sistema, no del proceso de la app; ver D2).
- Unos 60 s después de pasar a segundo plano dejan de llegar posiciones al JavaScript; quedan en cola y llegan todas juntas al reabrir. Capacitor no pausa el WebView (`KeepRunning=true` por defecto); en el log, el proceso de render del WebView baja a prioridad «idle» mientras la app sigue en primer plano por el servicio.
- Con este comportamiento C3 falla siempre con pantalla apagada (hueco de ~225 s) y las posiciones atrasadas no sirven para el mapa en tiempo real de HU-02.

**Cierre de la app sin candado (intento previo de E4).** Al deslizar la app fuera de recientes, HyperOS (`SwipeUpClean`) destruyó la actividad y el proceso del WebView, pero no el proceso de la app; el GPS se detuvo porque el plugin vincula su servicio a la actividad. Al reabrir, la app marcó la sesión como interrumpida.

**Decisión del equipo (2026-10-28).** Se descarta exigir que se siga registrando con la app cerrada. Mitigaciones: candado en recientes (guía al conductor), retomar la sesión automáticamente al reabrir si el turno sigue activo, y el umbral de 60 s de HU-02 en el panel para marcar la posición como no confiable. El único problema por resolver en H-3 es la suspensión del JavaScript con pantalla apagada.

**Siguiente paso.** Probar un ajuste en `MainActivity` (prioridad del proceso de render del WebView) y repetir esta prueba con cable. Si no hay huecos > 60 s, la confirmación definitiva es E2 sin cable (60 min, pantalla apagada); si E2 pasa, se continúa con E3. Si la prueba con cable falla, se evalúa un segundo ajuste del WebView y, si tampoco basta, se propone un módulo nativo reducido (ADR-001), sin reinicio tras cierre ni permiso de ubicación «todo el tiempo».

### D2 · 2026-10-28 · Ajuste de prioridad del proceso de render: no resuelve

**Cambio probado.** `MainActivity` con `WebView.setRendererPriorityPolicy(RENDERER_PRIORITY_IMPORTANT, false)`, plugin sin cambios. Misma prueba que D1 (modo espera, candado, cable, pantalla apagada). La captura del log se cortó a las 16:27:50 porque el teléfono se desconectó del PC; alcanzó a cubrir 6 min.

| Minuto | Entregas del sistema a la app | Entregas que llegaron al JavaScript |
|---|---|---|
| 16:21 | 29 | 29 |
| 16:22 | 60 | 22 (última a las 16:22:21) |
| 16:23–16:26 | 60 por minuto | 0 |
| 16:27 (hasta la desconexión) | 50 | 0 |

**Resultado.** Mismo comportamiento que D1: el JavaScript deja de recibir posiciones unos 60 s después de pasar a segundo plano. El ajuste no tiene efecto. El CSV de la sesión (`S20261028-162116`) lo confirma: muestras a los 30,3 s y 30,0 s, y la siguiente recién al reabrir la app, con un **intervalo de 348,9 s** (C3 falla).

**Hallazgo adicional.** Desde las 16:22:21 el proceso de la app no escribe ninguna línea en el log, incluidas las del puente nativo de Capacitor. El log no permite distinguir si se suspende solo el JavaScript (proceso de render del WebView) o el proceso completo de la app pese al servicio en primer plano. La diferencia es decisiva: en el segundo caso un módulo nativo tampoco resolvería el problema.

## 8. Conclusión y decisión

‹¿Se mantiene el plugin para HU-02, HU-04 y HU-29? ¿Qué ajustes requiere la app real (intervalo nativo, instrucciones de ahorro de batería al conductor, manejo de cierre)? Riesgos que quedan abiertos.›

## 9. Limitaciones

- Un solo teléfono (Xiaomi 14T, HyperOS 3): los resultados no representan a otros fabricantes ni versiones de Android, aunque HyperOS está entre las capas más restrictivas con apps en segundo plano.
- Los datos son estimados (con sobrecarga supuesta) y se contrastan con una lectura manual.
- La batería medida corresponde al GPS a ~1 Hz (peor caso).
- JavaScript no detecta si la pantalla está apagada: esa condición la registra quien prueba, por escenario.
