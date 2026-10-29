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

**Datos.** La PoC no envía nada. Por cada posición registrada calcula los bytes del mensaje que enviaría la app real (JSON con hora, lat, lon, precisión, velocidad y rumbo) más una sobrecarga **supuesta** de 80 bytes por mensaje (WebSocket, TLS, TCP/IP), y lo proyecta a 8 h. La lectura de uso de datos en Ajustes de Android **se omite**: la PoC no envía datos, así que no aporta información; la medición real de C4 queda para cuando la app envíe posiciones al backend (HU-02).

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
| E2 | Sin restricciones | Activado | Sí | Desactivado | Sí | Permitidas | Sí (además «Pausar actividad si no se utiliza» desactivado) |
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
| E2 | T1 | S20261028-171058 | 53 | 30,0 / 33,3 / 34,9 | 0 | 3,4 / 11,9 | 6,8 (3 % en 0,44 h; baja resolución) | 0,020 · 0,16 | No aplica | **Parcial: 26,6 min de 60** (aceptado como parcial; se repite completo). Pantalla apagada todo el periodo, sin cable. Build con ajuste de visibilidad del WebView (D3b). Evidencia: `evidencias/H-3/E2-*-anon.csv` |
| E2b | T1 | | | | | | | | | |
| E3 | T1 | | | | | | | | | |
| E4 | T1 | | | | | | | | | ‹¿siguió el servicio tras cerrar la app? hueco hasta reabrir› |
| E5 | T1 | | | | | | | | | |
| E6 | T1 | | | | | | | | | |

### Sesión de uso normal (S1, no controlada)

Sesión `S20261028-184517` (2026-10-28, 18:45–20:19, 93,9 min, modo espera), con la configuración recomendada y el ajuste de visibilidad del WebView. Uso cotidiano del teléfono: salida desde la casa (bajo techo al iniciar), tramos caminando, un tramo en vehículo, clases; pantalla apagada y encendida según el uso; cable conectado de 19:40 a 19:50 y de 19:54 a 20:08. Evidencia: `evidencias/H-3/S1-*-anon.csv`.

| Medida | Valor |
|---|---|
| Muestras | 187 |
| Intervalo mediana / p95 / máx | 30,0 / 32,4 / 42,7 s |
| Huecos > 60 s | 0 |
| Precisión mediana / p95 | 3,4 / 100 m. 12 muestras > 50 m (6,4 %), 11 de ellas en los primeros 9 min (±88 a ±1400 m, inicio bajo techo) |
| Batería sin cargar | 51 → 42 % en 0,91 h ≈ 9,9 %/h (mezclado con el uso del teléfono; no representa solo a la app) |
| Datos estimados | 0,020 MB/h · 0,16 MB/8 h |

Aporta evidencia de robustez en uso real (sin huecos en 94 min con movimiento, interiores y uso del teléfono), pero no reemplaza a los escenarios: no prueba C1 (modo viaje) y no aísla la condición de pantalla apagada ni el consumo de la app.

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

**Observación.** D1 y D2 se hicieron con el ahorro de batería de la app **sin confirmar** (no se registró si estaba en «Inteligente», el valor por defecto, o en «Sin restricciones»), ni el estado de «Inicio automático» y «Pausar actividad si no se utiliza». Sus resultados no deben leerse como comportamiento con la configuración recomendada de la sección 4.1.

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

**Observación.** Igual que D1, con el ahorro de batería de la app sin confirmar.

**Hallazgo adicional.** Desde las 16:22:21 el proceso de la app no escribe ninguna línea en el log, incluidas las del puente nativo de Capacitor. El log no permite distinguir si se suspende solo el JavaScript (proceso de render del WebView) o el proceso completo de la app pese al servicio en primer plano. La diferencia es decisiva: en el segundo caso un módulo nativo tampoco resolvería el problema.

### D3 · 2026-10-28 · Ventana visible para el WebView + latido nativo, con el teléfono configurado

**Configuración del teléfono (confirmada antes de la prueba).**

| Ajuste | Valor |
|---|---|
| Ahorro de batería de la app | Sin restricciones |
| Inicio automático | Activado |
| Candado en recientes | Puesto |
| Pausar actividad si no se utiliza | Desactivado |
| Ahorro de batería del sistema | Desactivado |
| Cable | Conectado (captura del log) |

**Cambios en la app.**
- `MainActivity.onStop` informa al WebView que su ventana sigue visible (`dispatchWindowVisibilityChanged(VISIBLE)`), para que no suspenda la página. Se mantiene el ajuste de prioridad de D2.
- Latido nativo cada 5 s en el log (`H3 latido hilo=fondo` y `hilo=principal`), solo en builds de depuración, para saber si se suspende solo el JavaScript o el proceso completo de la app.

**Variables.** Respecto de D2 cambian dos cosas: la configuración de HyperOS y el ajuste de visibilidad. Si D3 pasa, conviene una prueba corta sin el ajuste de visibilidad para saber cuál de los dos lo resolvió.

**Resultado: pasa.** Sesión `S20261028-165003`. Pantalla apagada de forma continua de 16:51:18 a 16:55:56 (4 min 38 s; antes hubo dos encendidos breves).

| Medida | Valor |
|---|---|
| Latido nativo (fondo / principal) | 12 / 12 por minuto todo el periodo: el proceso de la app no se congeló |
| Entregas que llegaron al JavaScript | Continuas hasta el final (última 16:56:00) |
| Muestras con pantalla apagada | 9, intervalos entre 29,9 y 34,8 s |
| Intervalo máximo de la sesión | 34,8 s (sin huecos > 60 s) |
| Precisión | 5,8–13,3 m |

**Observación.** Con la pantalla apagada, Android entregó posiciones con menos frecuencia (en algunos tramos 5 a 9 entregas en 30 s, con pausas de hasta 36 s en el registro del sistema), por lo que algunos intervalos llegan a 32–35 s en vez de 30 s. No afecta C3, pero hay que vigilarlo en E2 y E3: si las pausas superan 60 s, aparecerían huecos.

**Pendiente.** Como cambiaron dos variables, falta saber si basta la configuración de HyperOS o si también hace falta el ajuste de visibilidad del WebView (D3b).

### D3b · 2026-10-28 · Solo configuración de HyperOS, sin el ajuste de visibilidad: no pasa

**Cambio.** Misma build y configuración del teléfono que D3, con la línea `dispatchWindowVisibilityChanged` comentada. Pantalla apagada de forma continua de 17:01:21 a 17:06:34. Log recuperado del buffer del teléfono.

| Minuto | Entregas del sistema a la app | Entregas al JavaScript | Latido nativo (fondo / principal) |
|---|---|---|---|
| 17:01 | — | 8 | 12 / 12 |
| 17:02 | 56 | 19 | 12 / 12 |
| 17:03–17:05 | 60 por minuto | 0 | 12 / 12 |
| 17:06 (al reabrir) | 34 | 262 de una vez | 12 / 12 |

En 17:01 el registro del sistema no identifica las entregas a la app al inicio de la sesión; no cambia la conclusión.

CSV de la sesión `S20261028-170114`: muestras a los 29,6 y 30,1 s, y la siguiente al reabrir con un **intervalo de 260,7 s** (C3 falla).

**Conclusión de D1 a D3b.**
- El proceso de la app **no se congela**: el latido nativo continúa todo el periodo, con y sin el ajuste.
- Lo que se suspende es **solo el WebView**, unos 60 s después de pasar a segundo plano, aun con HyperOS configurado (sin restricciones, inicio automático, candado).
- El ajuste `dispatchWindowVisibilityChanged(VISIBLE)` en `MainActivity.onStop` **es necesario y suficiente** en T1 junto con la configuración recomendada. Se mantiene en la app.
- No hace falta el módulo nativo (ADR-001) para H-3.

**Siguiente paso.** E2 sin cable (60 min, pantalla apagada, configuración recomendada) con build normal (sin `VITE_DIAGNOSTICO`) como confirmación definitiva. Riesgo a vigilar: el ajuste podría aumentar el consumo de batería al mantener activa la página; se mide en E2.

## 8. Conclusión y decisión

**Estado: preliminar.** Pendientes E3 (trayecto de 60 min en modo viaje con pantalla apagada; única prueba de C1) y E2 completo (60+ min). Hay además una sesión de uso normal (S1, 94 min, sin huecos).

**Resultados hasta ahora (T1, Xiaomi 14T, HyperOS 3).**
- Con el ajuste de visibilidad del WebView en `MainActivity` y la configuración recomendada del teléfono, la app registra con pantalla apagada y sin cable sin huecos > 60 s (E2 parcial: 26,6 min, intervalo máx 34,9 s, precisión p95 11,9 m).
- Sin el ajuste, el JavaScript se suspende unos 60 s después de pasar a segundo plano, aun con HyperOS configurado (D1–D3b). El proceso nativo no se congela.
- El plugin `@capacitor-community/background-geolocation` 1.2.26 se mantiene; no hace falta un módulo nativo propio (ADR-001) ni Solicitud de cambio.

**Decisiones.**
- Se descarta exigir que se siga registrando con la app cerrada. Mitigaciones: candado en recientes, retomar la sesión automáticamente al reabrir si el turno sigue activo, y el umbral de 60 s de HU-02 en el panel.

**Riesgos y ajustes para la app real.**

| # | Riesgo o ajuste | Detalle | Dónde se aborda |
|---|---|---|---|
| A1 | Consumo de batería | ~6,8 %/h en E2 parcial (≈ 54 % en un turno de 8 h), con el GPS a 1 Hz en alta precisión porque el plugin fija un intervalo nativo de 1000 ms. Medición de baja resolución: confirmar con E2 completo y E3. | HU-02 / HU-13 |
| A2 | Intervalo nativo del GPS | Bajar el intervalo nativo a 10 s en viaje y 30 s en espera (parche o fork del plugin, o reemplazo del servicio de ubicación), en vez de pedir 1 Hz y descartar en la app. Debería reducir A1 de forma importante; hay que verificar que no aumenten los huecos. | HU-02 / HU-13 |
| A3 | Ajuste del WebView | `dispatchWindowVisibilityChanged(VISIBLE)` en `MainActivity.onStop` es un ajuste no documentado como uso previsto; puede dejar de funcionar con actualizaciones del WebView. Repetir la prueba de diagnóstico tras actualizar WebView o Capacitor. | Mantenimiento de la app |
| A4 | Configuración de HyperOS | Sin «Sin restricciones», inicio automático y candado no se probó el comportamiento con el ajuste (E2b). La app real debe guiar al conductor para dejar esa configuración. | HU-13 |
| A5 | Cierre de la app | Si el conductor la cierra, el registro se detiene (decisión del equipo). Mitigación: retomar al reabrir y umbral de 60 s en el panel. | HU-02 / HU-13 |
| A6 | Representatividad | Un solo teléfono y fabricante. | Pruebas de aceptación |
| A7 | Posiciones de baja precisión | En S1, al iniciar bajo techo, hubo posiciones de ±88 a ±1400 m durante 9 min (p95 de la sesión: 100 m). La app real debe descartar o marcar las posiciones con precisión > 50 m en vez de mostrarlas en el mapa o usarlas para la geocerca de 150 m. Definir si C5 se evalúa excluyendo el periodo inicial en que el GPS aún no fija la posición. | HU-02 / HU-16 / HU-29 |

## 9. Limitaciones

- Un solo teléfono (Xiaomi 14T, HyperOS 3): los resultados no representan a otros fabricantes ni versiones de Android, aunque HyperOS está entre las capas más restrictivas con apps en segundo plano.
- Los datos son estimados (con sobrecarga supuesta) y se contrastan con una lectura manual.
- La batería medida corresponde al GPS a ~1 Hz (peor caso).
- JavaScript no detecta si la pantalla está apagada: esa condición la registra quien prueba, por escenario.
