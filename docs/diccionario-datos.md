# Diccionario de datos — FlotaÁgil

Modelo lógico del Anexo D del Informe 2. Nombres de tablas y columnas tal como deben implementarse (singular, snake_case).

## EMPRESA

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador de la empresa | Autoincremental | — |  |
| rut | VARCHAR(12) | No | UK | RUT de la empresa | Formato 12345678-9; dígito verificador válido | — |  |
| razon_social | VARCHAR(120) | No |  | Razón social | Texto no vacío | — |  |
| plan | VARCHAR(12) | No |  | Plan contratado | BASICO \| FLOTA_PLUS | BASICO |  |
| activa | BOOLEAN | No |  | Indica si la empresa opera | true/false | true |  |
| creado_en | TIMESTAMPTZ | No |  | Fecha de alta | UTC | now() |  |

## USUARIO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador del usuario | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa a la que pertenece | → EMPRESA.id | — |  |
| nombre | VARCHAR(80) | No |  | Nombre completo | Texto no vacío | — | Personal |
| email | VARCHAR(120) | No | UK | Correo de acceso | Formato correo; único | — | Personal |
| password_hash | VARCHAR(128) | No |  | Hash de la contraseña | PBKDF2-SHA256 con salt | — | Credencial |
| rol | VARCHAR(14) | No |  | Rol de acceso | ADMINISTRADOR \| DESPACHADOR \| CONDUCTOR | — |  |
| activo | BOOLEAN | No |  | Cuenta habilitada | true/false | true |  |
| intentos_fallidos | SMALLINT | No |  | Intentos fallidos consecutivos | 0–5; bloqueo al llegar a 5 | 0 |  |
| bloqueado_hasta | TIMESTAMPTZ | Sí |  | Fin del bloqueo temporal | UTC | NULL |  |

## CONDUCTOR

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador del conductor | Autoincremental | — |  |
| usuario_id | BIGINT | No | FK, UK | Cuenta de acceso asociada | → USUARIO.id (1:1) | — |  |
| rut | VARCHAR(12) | No | UK | RUT del conductor | Dígito verificador válido | — | Personal |
| telefono | VARCHAR(16) | No |  | Teléfono de contacto | E.164 (+569XXXXXXXX) | — | Personal |
| licencia_clase | VARCHAR(4) | No |  | Clase de licencia | A1 \| A2 \| A3 | — |  |
| licencia_vence | DATE | No |  | Vencimiento de la licencia | Fecha futura al alta | — |  |
| estado | VARCHAR(14) | No |  | Estado operativo | DISPONIBLE \| NO_DISPONIBLE \| EN_VIAJE | NO_DISPONIBLE |  |
| vehiculo_activo_id | BIGINT | Sí | FK | Vehículo declarado para el turno | → VEHICULO.id; obligatorio si DISPONIBLE (RN-05) | NULL |  |
| consentimiento_gps_en | TIMESTAMPTZ | Sí |  | Aceptación informada del tratamiento de ubicación | Requerido para iniciar turno | NULL |  |

## VEHICULO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador del vehículo | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa propietaria | → EMPRESA.id | — |  |
| patente | VARCHAR(8) | No | UK | Placa patente | Formato chileno (AB1234 o ABCD12) | — |  |
| marca_modelo | VARCHAR(60) | No |  | Marca y modelo | Texto no vacío | — |  |
| anio | SMALLINT | No |  | Año de fabricación | ≥ año actual − 12 (antigüedad máx. del servicio) | — |  |
| capacidad | SMALLINT | No |  | Número de pasajeros | 1–7 | 4 |  |
| activo | BOOLEAN | No |  | Vehículo habilitado | true/false | true |  |

## CONDUCTOR_VEHICULO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| conductor_id | BIGINT | No | PK, FK | Conductor | → CONDUCTOR.id | — |  |
| vehiculo_id | BIGINT | No | PK, FK | Vehículo | → VEHICULO.id | — |  |
| desde | DATE | No |  | Inicio de la asociación | — | current_date |  |

## CONVENIO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador del convenio | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa de taxi que otorga el convenio | → EMPRESA.id | — |  |
| cliente_nombre | VARCHAR(120) | No |  | Nombre de la empresa cliente | Texto no vacío | — |  |
| cliente_rut | VARCHAR(12) | No |  | RUT de la empresa cliente | Dígito verificador válido | — |  |
| token_link | CHAR(43) | No | UK | Token del link único | Aleatorio de 256 bits (base64url) | — | Credencial |
| password_hash | VARCHAR(128) | No |  | Hash de la contraseña del convenio | PBKDF2-SHA256 | — | Credencial |
| activo | BOOLEAN | No |  | Vigencia del convenio | false invalida el link (RN-08) | true |  |

## PASAJERO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador del pasajero | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa que lo atiende | → EMPRESA.id | — |  |
| nombre | VARCHAR(80) | No |  | Nombre declarado | Texto no vacío | — | Personal |
| telefono | VARCHAR(16) | No | UK (empresa) | Número de WhatsApp | E.164; único por empresa | — | Personal |
| verificado_en | TIMESTAMPTZ | Sí |  | Fecha de verificación por WhatsApp | UTC | NULL |  |
| opt_in_en | TIMESTAMPTZ | Sí |  | Aceptación de avisos por WhatsApp | Requerido antes de enviar plantillas | NULL |  |

## VIAJE

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador del viaje | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa | → EMPRESA.id | — |  |
| pasajero_id | BIGINT | No | FK | Pasajero | → PASAJERO.id | — |  |
| convenio_id | BIGINT | Sí | FK | Convenio, si es corporativo | → CONVENIO.id | NULL |  |
| conductor_id | BIGINT | Sí | FK | Conductor asignado | → CONDUCTOR.id | NULL |  |
| vehiculo_id | BIGINT | Sí | FK | Vehículo usado | → VEHICULO.id | NULL |  |
| canal | VARCHAR(12) | No |  | Canal de ingreso | WEB \| WHATSAPP \| TELEFONO \| CONVENIO | — |  |
| sentido | VARCHAR(16) | No |  | Tipo de trayecto | DESDE_AEROPUERTO \| HACIA_AEROPUERTO \| URBANO | URBANO |  |
| origen_dir | VARCHAR(200) | No |  | Dirección de recogida | Texto no vacío | — | Personal |
| origen_geo | GEOGRAPHY(Point,4326) | No |  | Coordenadas de recogida | Dentro de la RM | — | Ubicación |
| destino_dir | VARCHAR(200) | No |  | Dirección de destino | Texto no vacío | — | Personal |
| destino_geo | GEOGRAPHY(Point,4326) | No |  | Coordenadas de destino | — | — | Ubicación |
| recogida_en | TIMESTAMPTZ | No |  | Hora de recogida vigente | Ajustable por P2.2 | — |  |
| estado | VARCHAR(20) | No |  | Estado del viaje (Anexo F) | Ver máquina de estados | PENDIENTE_CONFIRMACION |  |
| tarifa | INTEGER | Sí |  | Tarifa acordada (CLP) | ≥ 0; definida por el cliente | NULL |  |
| motivo_cancelacion | VARCHAR(200) | Sí |  | Motivo de cancelación | Obligatorio si CANCELADO | NULL |  |
| origen_cancelacion | VARCHAR(14) | Sí |  | Quién canceló | PASAJERO \| DESPACHADOR \| SUPERVISOR \| SISTEMA | NULL |  |
| creado_en | TIMESTAMPTZ | No |  | Fecha de ingreso | UTC | now() |  |

## VUELO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| viaje_id | BIGINT | No | FK, UK | Viaje asociado | → VIAJE.id (1:0..1) | — |  |
| numero | VARCHAR(8) | No |  | Código IATA del vuelo | Formato LA123 / H2 456 | — |  |
| fecha | DATE | No |  | Fecha programada | — | — |  |
| hora_programada | TIMESTAMPTZ | No |  | Hora programada de llegada | UTC | — |  |
| hora_estimada | TIMESTAMPTZ | Sí |  | Última ETA informada | UTC | NULL |  |
| estado_vuelo | VARCHAR(12) | No |  | Estado informado | PROGRAMADO \| DEMORADO \| ATERRIZADO \| CANCELADO \| DESVIADO | PROGRAMADO |  |
| ultima_consulta_en | TIMESTAMPTZ | Sí |  | Última consulta a la API | UTC | NULL |  |

## ASIGNACION

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| viaje_id | BIGINT | No | FK | Viaje | → VIAJE.id | — |  |
| conductor_id | BIGINT | No | FK | Conductor notificado | → CONDUCTOR.id | — |  |
| despachador_id | BIGINT | No | FK | Usuario que confirmó | → USUARIO.id (RN-02) | — |  |
| origen_sugerencia | VARCHAR(10) | No |  | Fuente del candidato | FILA \| DISTANCIA \| MANUAL | — |  |
| enviada_en | TIMESTAMPTZ | No |  | Envío de la notificación | UTC | now() |  |
| respondida_en | TIMESTAMPTZ | Sí |  | Respuesta del conductor | ≤ enviada_en + 60 s | NULL |  |
| resultado | VARCHAR(10) | Sí |  | Resultado | ACEPTADA \| RECHAZADA \| EXPIRADA | NULL |  |

## HISTORIAL_ESTADO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| viaje_id | BIGINT | No | FK | Viaje | → VIAJE.id | — |  |
| estado_anterior | VARCHAR(20) | Sí |  | Estado previo | Dominio de VIAJE.estado | NULL |  |
| estado_nuevo | VARCHAR(20) | No |  | Estado resultante | Transición válida (Anexo F) | — |  |
| actor | VARCHAR(14) | No |  | Tipo de actor | CONDUCTOR \| DESPACHADOR \| PASAJERO \| SISTEMA | — |  |
| usuario_id | BIGINT | Sí | FK | Usuario responsable | → USUARIO.id | NULL |  |
| creado_en | TIMESTAMPTZ | No |  | Momento de la transición | UTC | now() |  |

## PAGO_VIAJE

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| viaje_id | BIGINT | No | FK, UK | Viaje cobrado | → VIAJE.id (1:0..1) | — |  |
| metodo | VARCHAR(14) | No |  | Método de pago | EFECTIVO \| TARJETA \| TRANSFERENCIA \| CONVENIO | — |  |
| monto | INTEGER | No |  | Monto cobrado (CLP) | 0–500.000 | — |  |
| registrado_en | TIMESTAMPTZ | No |  | Momento del registro | UTC | now() |  |
| corregido_por | BIGINT | Sí | FK | Administrador que corrigió | → USUARIO.id; genera AUDITORIA | NULL |  |

## CALIFICACION

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| viaje_id | BIGINT | No | FK, UK | Viaje calificado | → VIAJE.id | — |  |
| puntaje | SMALLINT | No |  | Nota del servicio | 1–5 | — |  |
| creado_en | TIMESTAMPTZ | No |  | Fecha | UTC | now() |  |

## GEOCERCA

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa | → EMPRESA.id | — |  |
| nombre | VARCHAR(60) | No |  | Nombre de la zona | Texto no vacío | — |  |
| poligono | GEOGRAPHY(Polygon,4326) | No |  | Límite geográfico | Polígono válido (ST_IsValid) | — |  |

## FILA_AEROPUERTO

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| geocerca_id | BIGINT | No | FK | Zona de la fila | → GEOCERCA.id | — |  |
| conductor_id | BIGINT | No | FK | Conductor en la fila | → CONDUCTOR.id; una entrada abierta por conductor | — |  |
| ingreso_en | TIMESTAMPTZ | No |  | Ingreso a la geocerca | Define el orden FIFO (RN-16) | now() |  |
| salida_en | TIMESTAMPTZ | Sí |  | Salida de la fila | NULL mientras está en la fila | NULL |  |
| motivo_salida | VARCHAR(14) | Sí |  | Motivo de salida | ASIGNADO \| FUERA_ZONA \| NO_DISPONIBLE | NULL |  |

## POSICION_GPS

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Secuencia | — |  |
| conductor_id | BIGINT | No | FK | Conductor emisor | → CONDUCTOR.id | — |  |
| viaje_id | BIGINT | Sí | FK | Viaje en curso, si existe | → VIAJE.id | NULL |  |
| punto | GEOGRAPHY(Point,4326) | No |  | Posición | Índice GiST | — | Ubicación |
| precision_m | SMALLINT | Sí |  | Precisión informada (m) | 0–500; > 100 se marca no confiable | NULL |  |
| registrada_en | TIMESTAMPTZ | No |  | Momento de captura | Retención 30 días | — |  |

## MENSAJE_WHATSAPP

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| pasajero_id | BIGINT | No | FK | Interlocutor | → PASAJERO.id | — |  |
| viaje_id | BIGINT | Sí | FK | Viaje relacionado | → VIAJE.id | NULL |  |
| direccion | VARCHAR(8) | No |  | Sentido | ENTRANTE \| SALIENTE | — |  |
| tipo | VARCHAR(10) | No |  | Tipo de mensaje | PLANTILLA \| SESION | — |  |
| cuerpo | TEXT | No |  | Contenido | ≤ 1.024 caracteres | — | Personal |
| proveedor_sid | VARCHAR(40) | Sí | UK | Identificador en Twilio | Idempotencia de webhooks | NULL |  |
| estado_entrega | VARCHAR(12) | No |  | Estado de entrega | QUEUED \| SENT \| DELIVERED \| READ \| FAILED | QUEUED |  |
| usuario_id | BIGINT | Sí | FK | Despachador que respondió | → USUARIO.id | NULL |  |
| creado_en | TIMESTAMPTZ | No |  | Fecha | UTC | now() |  |

## AUDITORIA

| Columna | Tipo | Nulo | Clave | Descripción | Dominio / restricción | Defecto | Clasificación |
|---|---|---|---|---|---|---|---|
| id | BIGINT | No | PK | Identificador | Autoincremental | — |  |
| empresa_id | BIGINT | No | FK | Empresa | → EMPRESA.id | — |  |
| usuario_id | BIGINT | No | FK | Usuario que actuó | → USUARIO.id | — |  |
| entidad | VARCHAR(30) | No |  | Entidad afectada | CONVENIO \| VIAJE \| PAGO_VIAJE \| USUARIO | — |  |
| entidad_id | BIGINT | No |  | Registro afectado | — | — |  |
| accion | VARCHAR(30) | No |  | Acción realizada | Ej.: CAMBIO_CLAVE, CIERRE_FORZADO | — |  |
| motivo | VARCHAR(200) | Sí |  | Motivo declarado | Obligatorio en cierres forzados (RN-11) | NULL |  |
| datos_previos | JSONB | Sí |  | Valores anteriores | Sin contraseñas ni hashes | NULL |  |
| creado_en | TIMESTAMPTZ | No |  | Fecha | UTC | now() |  |

## Relaciones

| Origen | Destino | Cardinalidad |
|---|---|---|
| EMPRESA | USUARIO | 1:N |
| EMPRESA | VEHICULO | 1:N |
| EMPRESA | CONVENIO | 1:N |
| EMPRESA | PASAJERO | 1:N |
| EMPRESA | GEOCERCA | 1:N |
| USUARIO | CONDUCTOR | 1:0..1 |
| CONDUCTOR | CONDUCTOR_VEHICULO | 1:N |
| VEHICULO | CONDUCTOR_VEHICULO | 1:N |
| PASAJERO | VIAJE | 1:N |
| CONVENIO | VIAJE | 0..1:N |
| CONDUCTOR | VIAJE | 0..1:N |
| VIAJE | VUELO | 1:0..1 |
| VIAJE | ASIGNACION | 1:N |
| CONDUCTOR | ASIGNACION | 1:N |
| VIAJE | HISTORIAL_ESTADO | 1:N |
| VIAJE | PAGO_VIAJE | 1:0..1 |
| VIAJE | CALIFICACION | 1:0..1 |
| GEOCERCA | FILA_AEROPUERTO | 1:N |
| CONDUCTOR | FILA_AEROPUERTO | 1:N |
| CONDUCTOR | POSICION_GPS | 1:N |
| PASAJERO | MENSAJE_WHATSAPP | 1:N |
| VIAJE | MENSAJE_WHATSAPP | 0..1:N |
| USUARIO | AUDITORIA | 1:N |
