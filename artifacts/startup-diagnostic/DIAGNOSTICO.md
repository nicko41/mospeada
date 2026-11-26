# Diagnóstico de carga inicial de MOSPEADA

Fecha: 26 de noviembre de 2026. Sitio: https://mospeada.vercel.app/. Diagnóstico exclusivamente: no se modificaron `src/`, `public/`, calidad, assets, configuración de Vercel ni despliegue.

## Resultado principal

La primera visita con caché inicialmente vacía descarga **212,731544 MB de cuerpos HTTP comprimidos**, aproximadamente **212,76 MB incluyendo los encabezados estimados por Resource Timing**. Esos recursos equivalen a **286,01 MB de archivos únicos por URL después de descomprimir HTTP**. MB significa 1.000.000 bytes.

El arranque exige las tres versiones de Scott, recursos del cañón, ruta posterior, desierto, Scouts, Rand, música posterior y preparación gráfica de vistas futuras. Scott V1 + V2 + V3 representan **105,216629 MB comprimidos**, el **49,46 %** de la transferencia inicial. La entrada queda bloqueada tanto por red como por trabajo de CPU y preparación de render.

`LOADING VEHICLES` no es un cronómetro de una fase exclusiva: `cycloneInstrumentModel.js:9` elige ese texto según el nombre del último ítem conocido por `useProgress`. El progreso se basa en ítems del LoadingManager, no en MB ni en costo de GPU. El pack forestal utiliza además un manager privado. `EntryPreloader` exige `!active`, `sceneReady` y `renderReady` para salir; por eso un porcentaje aparentemente avanzado o un texto persistente no identifica por sí solo el cuello de botella.

La compresión Brotli está funcionando. No se encontró un GLB grande incrustado en JavaScript. Los principales problemas comprobados son el conjunto excesivo de dependencias iniciales, solicitudes/objetos repetidos y trabajo de preparación concentrado antes de habilitar la entrada.

## Método y alcance

- Build publicado: `/assets/index-CkRGR8Ba.js`. SHA-256 del JavaScript descargado y del build local: `c7af0bb1296d6290ab91c18215221468cace8bc724fbe31221e4c7ae26b0c39f`. Referencia de código local: commit `1dae241`.
- Chrome 158 headless, perfiles exclusivos de diagnóstico, viewport 1440 × 960, sin limitación artificial de red o CPU. GPU Intel UHD mediante ANGLE / Direct3D11. La medición gráfica final se ejecutó con las otras escenas de diagnóstico detenidas.
- Se midió hasta el evento real `game-ready`, que retira el preloader y habilita la entrada. El botón de autorización del audio/introducción puede seguir visible: no se sumó el tiempo de espera de una acción humana.
- Pasada `cold`: caché vacía al comenzar, pero habilitada durante la navegación. Es la referencia para el peso de una primera visita normal.
- Pasada `baseline`: caché deshabilitada durante toda la navegación. Sirve para detectar solicitudes duplicadas y mostrar la exposición a red; fuerza descargas que una visita normal puede resolver mediante revalidación.
- Pasada `instrumented`: mismo bundle publicado, interceptado únicamente en un navegador de prueba para agregar cronómetros a los loaders y renderer; captura de Chrome Trace y consultas de tiempo GPU. No se alteraron geometrías, imágenes ni comportamiento de preparación.
- Se conservó una pasada preliminar `instrumented-shared-gpu*` para trazabilidad, pero está **excluida** de los resultados porque todavía había otra escena de prueba activa.
- Todas las respuestas públicas con headers CDN capturados fueron `X-Vercel-Cache: HIT`, con identificadores `gru1`. Esto describe el punto de acceso utilizado en estas pruebas. No se purgó el CDN ni se midió desde la ubicación física del incidente.

| Pasada | Entrada habilitada | Cuerpo HTTP descargado | Interpretación |
|---|---:|---:|---|
| Primera visita normal (`cold`) | 36,68 s | 212,73 MB | Caché inicialmente vacía; 17 revalidaciones durante el arranque |
| Caché siempre deshabilitada (`baseline`) | 206,10 s | 232,90 MB | Incluye 20,17 MB extra por solicitudes repetidas |
| Instrumentación final | 35,82 s | No usar para comparar transferencia | La respuesta JS fue intervenida localmente para medir fases |

Las pasadas tuvieron condiciones de red efectivas distintas. No corresponde interpretar 206 → 36 s como una optimización ni atribuir toda la diferencia a caché: las tres versiones grandes de Scott terminaron de descargarse mucho antes en la segunda visita. No se reprodujeron los cinco minutos exactos de la ubicación informada.

**Inferencia cuantitativa:** 212,73 MB requieren aproximadamente **340,4 segundos a 5 Mbps**, aun sin añadir CPU, latencia o preparación gráfica. Por lo tanto, un arranque de más de cinco minutos es compatible con este volumen en una conexión de ese orden. Es un cálculo, no una medición de la conexión del incidente.

## Peso y los 15 assets más pesados

### Por bytes realmente descargados

Ordenado por cuerpo HTTP transferido, después de negociar compresión. Los GLB siguientes están bajo `/models/mospeada/`, salvo indicación explícita. Un mismo recurso revalidado con 304 no se cuenta como una nueva descarga completa.

| # | Asset | Archivo, MB | Descarga comprimida, MB |
|---:|---|---:|---:|
| 1 | `scott-gear-v3-helmet-boundary.glb` | 61,858 | 52,297 |
| 2 | `scott-bernard-gear-v2-rear-refined.glb` | 46,259 | 40,333 |
| 3 | `scott-bernard-animated-original.glb` | 13,994 | 12,587 |
| 4 | `invid-scout-rigged.glb?rig=flight-v4-leg-seam` | 14,785 | 12,330 |
| 5 | `rand-casual-rigged.glb` | 11,058 | 8,508 |
| 6 | `scott-shoulders-normal.png` | 5,738 | 5,738 |
| 7 | `alpha-fighter-down.glb` | 6,312 | 5,071 |
| 8 | `scott-shoulders-decals.png` | 4,943 | 4,943 |
| 9 | `/models/glTF/Bark_NormalTree_Normal.png` | 4,384 | 4,384 |
| 10 | `rand-cyclone.glb` | 23,345 | 3,956 |
| 11 | `cyclone-vr052f.glb` | 23,345 | 3,956 |
| 12 | `/models/glTF/Bark_NormalTree.png` | 3,895 | 3,895 |
| 13 | `horizon-t-desert-landmark.glb` | 4,413 | 3,633 |
| 14 | `/assets/02-Robotech-Lifeline-Bd__GJoj.mp3` | 2,977 | 2,977 |
| 15 | `mars-gallant.glb` | 3,299 | 2,895 |

### Por tamaño del archivo antes de compresión HTTP

Para evitar confundir el tamaño del GLB con lo que circula por la red, el ranking alternativo es:

| # | Asset | Archivo, MB | Descarga comprimida, MB |
|---:|---|---:|---:|
| 1 | `scott-gear-v3-helmet-boundary.glb` | 61,858 | 52,297 |
| 2 | `scott-bernard-gear-v2-rear-refined.glb` | 46,259 | 40,333 |
| 3 | `rand-cyclone.glb` | 23,345 | 3,956 |
| 4 | `cyclone-vr052f.glb` | 23,345 | 3,956 |
| 5 | `invid-scout-rigged.glb` | 14,785 | 12,330 |
| 6 | `scott-bernard-animated-original.glb` | 13,994 | 12,587 |
| 7 | `rand-casual-rigged.glb` | 11,058 | 8,508 |
| 8 | `alpha-fighter-down.glb` | 6,312 | 5,071 |
| 9 | `scott-shoulders-normal.png` | 5,738 | 5,738 |
| 10 | `/transformations/cyclone-rear-pieces.glb` | 5,609 | 1,147 |
| 11 | `scott-shoulders-decals.png` | 4,943 | 4,943 |
| 12 | `horizon-t-desert-landmark.glb` | 4,413 | 3,633 |
| 13 | `/models/glTF/Bark_NormalTree_Normal.png` | 4,384 | 4,384 |
| 14 | `/models/glTF/Bark_NormalTree.png` | 3,895 | 3,895 |
| 15 | `mars-gallant.glb` | 3,299 | 2,895 |

La publicación local inventariada contiene 630,51 MB en `dist/`, de los cuales 602,27 MB proceden de `public/`. Ese volumen **no** es la descarga inicial: incluye variantes y respaldos que no aparecieron en el registro de red. Los 106 registros HTTP del arranque representan 89 URLs distintas. Sumar indiscriminadamente `decodedBodySize` de cada registro da 306,26 MB porque incluye representaciones reutilizadas; tampoco es la transferencia real.

## Scott V1, V2 y V3: confirmados simultáneamente

`src/vehicle/OriginalScott.jsx:35` precarga las tres URLs y las exige mediante hooks en las líneas 43–46. `SCOTT_MODEL` y `SCOTT_V2_MODEL` son aliases de la misma URL, por lo que las cuatro llamadas de precarga resultan en **tres GLB distintos**, no cuatro descargas de Scott.

`src/vehicle/scottModelConfig.js:14` fija la selección visible inicial en V3, pero `ScottModelComparison.js` construye las otras variantes y las mantiene disponibles. Ocultarlas con `visible=false` no evita la descarga, el parseo ni todo el precalentamiento: las alternativas V1/V2 también se marcan con `prewarmVFX`.

En la primera visita normal, las tres solicitudes comenzaron juntas alrededor de 0,56 s. Terminaron a los 3,03 s (V1), 5,69 s (V2) y 6,89 s (V3). En la pasada lenta terminaron a los 104,82, 170,99 y 177,74 s respectivamente.

Además se cargan tres mapas de hombros: **13,49 MB**. Su aplicación especial corresponde a la variante V1 limpia en `ScottModelComparison.js:27`; se solicitan aunque la selección inicial sea V3.

V1 es referencia de rig/animación y también lo utiliza Rand; V2 funciona como fuente del controlador actual. Por eso retirar sus archivos completos sin separar esas responsabilidades no sería un cambio seguro. El diagnóstico confirma el costo; no implementa esa separación.

## Recursos posteriores y ajenos al escenario inicial

`ForestEnvironment.jsx:45` monta `ForestStage2`, `ForestStage3` y `ForestStage4` al construir el bosque. `Motorcycle.jsx:301` monta también los sistemas de combate y desenlace desde el inicio.

| Grupo confirmado antes de entrar | Evidencia | Costo o efecto |
|---|---|---|
| Cañón / etapa 2 | `ForestEnvironment.jsx:26`, `ForestStage2.jsx:32` | Texturas de barranco y orilla, worker y construcción del escenario |
| Ruta / etapa 3 | `ForestEnvironment.jsx:46` | Construcción de la ruta y preparación de sus vistas |
| Desierto / etapa 4 | `ForestStage4.jsx:21` y `:24` | Dos texturas de desierto, mundo y materiales antes de llegar a él |
| Scouts del desierto | `ForestDesertScouts.jsx:18` | GLB comprimido de 12,33 MB y construcción de patrullas |
| Rand y su Cyclone | `ForestRandEscape.jsx:20` | 12,46 MB comprimidos entre ambos GLB |
| Nave del horizonte | `DesertHorizonCarrier.jsx:7` | 3,63 MB comprimidos aunque sólo se muestra en el desierto |
| Música posterior | `ForestOpening.jsx:21`, `ForestMusic.js:19` | Se crean y cargan los cuatro audios con `preload='auto'`, incluidos Cyclone y victoria |
| Assets de autopista | Precargas en `GuardHut`, `ParkedRangeRover`, `TreeClusters`, importados estáticamente por `main.jsx` | `phone`, `rangerover`, `tree02`, `deadtrees01`: 5,58 MB comprimidos aun iniciando en bosque |

Un subconjunto identificable de recursos posteriores —Scouts, Rand, nave, desierto, barranco, orilla y las tres músicas posteriores— suma **41,26 MB comprimidos**. No representa todo el trabajo diferible: excluye geometría generada en CPU, uploads y vistas de preparación. Tampoco debe sumarse como un ahorro comprometido sin diseñar las dependencias.

`rand-cyclone.glb` y `cyclone-vr052f.glb` tienen el mismo SHA-256: `f116f651b56351415f6a8b36c4ac7c5b56b80e6e192388dec8a6b6a97e513f8c`. Son dos URLs y dos descargas completas, con **3,956 MB comprimidos adicionales** y otra instancia de parseo de un archivo de 23,35 MB.

El pack forestal descarga `Bark_NormalTree_Normal.png` (4,38 MB), pero `forestAssets.js` crea materiales Lambert usando el mapa de color y no copia `normalMap`. Es una textura de origen cargada por glTF que no se utiliza en ese material final; conviene considerarla al diseñar el manifiesto futuro, sin tocar resolución ni calidad.

## Descargas secuenciales y trabajo serializado

1. **Descubrimiento tardío de Armor.** `FrontTransformation.jsx:27` espera cinco JSON en paralelo y luego solicita `rear.geometryUrl`. La descarga de `cyclone-rear-pieces.glb` depende de que termine todo ese grupo, aunque su ruta es fija. Además el efecto no comienza hasta montar el vehículo. Primera visita normal: JSON alrededor de 17,03 s; GLB solicitado a 17,57 s, terminado a 19,27 s. En la pasada lenta, los JSON terminaron alrededor de 187,71 s, pero el GLB se solicitó recién a 200,09 s. Parte de esa demora fue ejecución/scheduling del hilo principal, no bytes del GLB.
2. **Atlas de copas detrás del pack.** `ForestEnvironment.jsx:28` llama primero a `useForestAssets()` y luego a `useTexture([largeCanopyUrl,edgeCanopyUrl])`. Si el primer hook suspende, todavía no se descubren los atlas. Primera visita: solicitudes de atlas a 2,95 s; en la pasada lenta, a 78,60 s, después de terminar el pack. Es una dependencia de descubrimiento evitable; no una dependencia gráfica real entre sus descargas.
3. **glTF externo → binarios e imágenes.** Los 14 glTF forestales deben terminar de descargar su JSON antes de descubrir `.bin` y PNG. Es la secuencia normal del formato actual. Un manifiesto de dependencias permitiría anticipar solicitudes; no se realizó ese cambio.
4. **Precarga y consumo con claves distintas.** React Three Fiber usa `[loader, ...urls]` como clave de caché. El grupo de siete texturas precargado en `CycloneVFX.jsx:35` no coincide con el grupo de ocho consumido en la línea 38. Hay grupos de suelo/atlas distintos entre etapas. Se observaron dos solicitudes por VFX/desierto y tres por pasto, tierra y atlas forestal. En la visita normal hubo **17 respuestas HTTP 304**; con caché deshabilitada esas reiteraciones añadieron **20,17 MB**. Aunque el navegador reutilice bytes, se crean cargas/objetos de textura distintos a nivel de hooks.
5. **GPU y vistas en secuencia.** `AnimeRenderer.prepareOpening()` espera `prepareTextures()` y luego `prepareStartupViews()`. El primer método cede un turno por textura y el segundo por vista. Esto consume tiempo de pared aun cuando el trabajo GPU efectivo sea menor.

Las peticiones grandes de Scott están en paralelo. No se encontró una secuencia V1 → V2 → V3; la simultaneidad aumenta la competencia por ancho de banda.

## Mediciones separadas de red, GLB, texturas y GPU

Los siguientes números corresponden a instrumentos diferentes y **no deben sumarse como fases mutuamente excluyentes**. La decodificación de imágenes ocurre dentro de la resolución de GLTFLoader; los trabajos CPU/GPU y descargas se solapan.

### Red, sin instrumentación del bundle

| Indicador | Primera visita normal | Caché siempre deshabilitada |
|---|---:|---:|
| V3: inicio → fin de solicitud | 0,56 → 6,89 s | 2,53 → 177,74 s |
| V3: recepción del cuerpo, según timing de red | 6,27 s | 174,20 s |
| Último recurso HTTP terminado | 19,27 s | 200,75 s |
| `game-ready` | 36,68 s | 206,10 s |
| Intervalo entre última respuesta y entrada | 17,40 s | 5,35 s |

El último intervalo demuestra que terminar de descargar no equivale a poder entrar. No permite por sí solo separar CPU de GPU. Se utilizan los timings internos de red, no el momento de recepción del evento CDP, que puede llegar tarde si el hilo principal está ocupado.

### GLB e imágenes, pasada instrumentada final

- **15 parseos GLB** desde que los bytes están disponibles hasta `onLoad`: 10,125 s acumulados; **3,917 s de unión temporal** por concurrencia. V3: **767,8 ms**; V2: **501,7 ms**; V1: **1.990,7 ms**; Scout: **2.030,5 ms**. Es latencia inclusiva del loader: incluye resolución de recursos, decodificación de imágenes incrustadas y colas de ejecución, no solamente geometría.
- La entrada síncrona a `GLTFLoader.parse()` acumuló **87,0 ms** entre 29 GLB/glTF. Es sólo cabecera/JSON y puesta en marcha: **no equivale al costo completo de CPU del parseo**, que tiene continuaciones asíncronas. No se presenta una cifra inventada de CPU exclusiva de geometría.
- **47 llamadas `createImageBitmap`**, principalmente imágenes incrustadas en modelos: 18,198 s de latencias individuales acumuladas, pero **3,034 s de unión temporal**. La suma alta no significa 18 segundos adicionales en la ruta crítica.
- Chrome Trace registró **84 operaciones `Decode Image`**, incluyendo imágenes externas: **2,771 s de duración acumulada** y **1,763 s de CPU de hilo acumulada** (`tdur`). Esta es la medición de CPU de decodificación de imágenes; ya forma parte de otros intervalos inclusivos.
- No se detectaron `KHR_draco_mesh_compression`, `EXT_meshopt_compression` ni `KHR_texture_basisu` en los GLB auditados. La carga actual no está pagando una fase Draco/Basis de esos modelos: es GLB convencional más imágenes PNG/JPEG y compresión HTTP Brotli.

### Preparación gráfica, pasada instrumentada final

| Operación medida | Tiempo | Alcance |
|---|---:|---|
| Preparación inicial `warm()` | 14,507 s | Incluye espera/compilación y primeras pasadas; comienza a 15,51 s |
| Preparación/espera registrada como `compileMs` | 3,953 s | Tiempo de pared; no es CPU pura del compilador |
| Llamadas síncronas `renderer.compile()` | 0,398 s acumulados | Dos llamadas; la finalización de shaders puede continuar después |
| `primeMs` | 10,554 s | Preparación de objetos dormidos y primer render completo; produjo una tarea principal de aproximadamente 10,55 s |
| Todas las llamadas `renderer.initTexture()` previas a entrada | 2,707 s acumulados | 125 llamadas; pueden incluir recursos repetidos o ya inicializados |
| Bloque explícito `prepareTextures()` | 1,181 s | Recorre 92 texturas, cediendo turnos entre ellas; está contenido parcialmente en el total anterior |
| 44 vistas de preparación | 4,558 s | 10 de intro, 16 de etapa 3, 18 de etapa 4; incluye turnos y fence |
| Espera final del fence | 24,4 ms | Sólo espera del último fence, no tiempo GPU total |
| Consultas GPU de renders | 2,484 s acumulados | 673 consultas disponibles, sin `disjoint`; sólo comandos dentro de `renderer.render()` |

Los 44 puntos de vista se generan en `ForestOpening.jsx:47` y `forestFirstPassPreparation.js:7`. La preparación explícita de texturas y esas vistas agrega **5,749 s** después de `warm()`. Hay **125 programas** al terminar la preparación inicial.

Las consultas `EXT_disjoint_timer_query_webgl2` aportan tiempo GPU real de las pasadas de render, pero **no cubren toda la compilación del driver ni uploads fuera de esas llamadas**. A su vez, `texSubImage2D` acumuló **3,512 s de tiempo síncrono en CPU/driver** y `bufferData` **230,9 ms**; esos tiempos no deben llamarse ejecución exclusiva en GPU.

Una evidencia directa de bloqueo: el GLB de piezas traseras terminó su transferencia a **19,47 s**, pero `parse()` comenzó a **30,07 s**, unos **10,60 s después**, coincidiendo con la tarea larga de `primeVariant`. Ese tramo es espera de ejecución, no descarga lenta.

El renderer reportó 1.566 geometrías y 1.846 texturas. Estos son contadores de objetos GPU —incluyen texturas de datos/batching y render targets— y no una medición de MB de VRAM.

La iluminación alternativa día/noche no es una barrera obligatoria de esta entrada: `startupRenderReady()` espera la preparación inicial y `openingReady`. El costo comprobado está en la iluminación inicial, objetos dormidos y vistas futuras; no se atribuye a una espera obligatoria de `nightReady`.

## Compresión y caché de Vercel

Los GET reales del navegador confirman Brotli para HTML, JS, CSS, fuentes, JSON y GLB. Por ejemplo, V3 pasa de 61,858 a **52,297 MB** y cada Cyclone de 23,345 a **3,956 MB**. Las imágenes PNG y los MP3 ya están comprimidos como formatos y fueron servidos sin compresión HTTP adicional. Verificar `Content-Encoding` es la comprobación indicada en la [documentación de compresión de Vercel](https://vercel.com/docs/how-vercel-cdn-works/compression).

Headers observados:

```http
Cache-Control: public, max-age=0, must-revalidate
X-Vercel-Cache: HIT
Content-Encoding: br
```

El último header corresponde a formatos comprimidos por HTTP. La política `max-age=0, must-revalidate` apareció **incluso en JS/CSS con hash** y obliga a validar frescura antes de reutilizar una representación vencida. No significa que los archivos nunca se almacenen: la visita normal confirmó reutilización mediante 304. Tampoco significa que el CDN no tenga caché: sus respuestas fueron HIT. La separación entre directivas de navegador/CDN está descrita en [Vercel Cache-Control](https://vercel.com/docs/caching/cache-control-headers) y [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control).

No hay `vercel.json` ni configuración Vite de headers en este checkout. No se inspeccionaron ajustes privados del dashboard. El resultado comprobado es que el despliegue no está enviando una política larga `immutable` ni siquiera para los archivos con hash; no se infiere la causa administrativa.

Una política de caché larga ayudaría a reutilización y a algunas solicitudes repetidas, pero **no elimina los 212,73 MB de una primera visita desde otro equipo**. Las URLs sin hash de `public/` requieren versionado/invalidation antes de tratarlas como inmutables. No se modificaron headers.

## Assets incrustados en JavaScript

- JavaScript principal: **2.406.611 bytes** sin compresión, **705.187 bytes** con Brotli en Vercel.
- Worker de follaje: **123.632 bytes**, **40.321 bytes** con Brotli; se crean dos workers para las distribuciones del bosque y etapa 2.
- Sólo se encontraron **dos data URI de imágenes base64**, con **510 caracteres combinados**: pruebas de compatibilidad WebP/AVIF de los loaders. No son texturas del juego ni GLB pesados.
- Las importaciones JPG/PNG/MP3 de `assets/` se emitieron como archivos separados con hash, no como esos medios enteros incrustados en el JS.
- El bundle incluye dos implementaciones de GLTFLoader (`three-stdlib`, usado por drei, y `three/addons`, usado directamente) y código de etapas importado estáticamente. Esto es peso de código y acoplamiento de inicialización, no evidencia de modelos binarios incrustados. No se atribuye al JavaScript el grueso de los 212,73 MB.

## Conclusión para la siguiente etapa, sin implementación

El sistema ya realiza parte de la preparación por sectores, pero el contrato de entrada sigue exigiendo recursos y vistas del recorrido futuro. El siguiente diseño debería establecer conjuntos de dependencias por escenario, conservar explícitamente las dependencias de animación/controlador de Scott y separar descarga, parseo y preparación GPU progresiva. Las transiciones deberán anticiparse con margen suficiente y presupuesto de CPU/GPU para evitar interrupciones. Los datos de este informe permiten diseñarlo sin reducir polígonos, resolución ni calidad visual.

## Evidencias y reproducción

- `cold.json`, `cold-summary.json`, `cold-network.csv`: primera visita normal, red cruda, headers, status HTTP real y tiempos por solicitud.
- `baseline.json`, `baseline-summary.json`, `baseline-network.csv`: caché siempre deshabilitada, útil para identificar reiteraciones.
- `instrumented.json`, `cpu-texture-gpu.json`, `instrumented-summary.json`: fases, parseos, decodificación, tiempo GPU y contadores.
- `instrumented-trace.json.gz`: Chrome Trace comprimido; se puede descomprimir y abrir en Chrome DevTools Performance o Perfetto.
- `inventory.json`: tamaños publicados, metadatos GLB, imágenes incrustadas, extensiones y hashes.
- `instrumentation-targets.json`: clases localizadas y hash del bundle interceptado.
- `cold.png`: estado observado después de retirar el preloader, esperando autorización para la intro.
- `scripts/diagnose-startup.mjs`: ejecutor CDP; requiere un Chrome de pruebas dedicado en `DIAGNOSTIC_PORT` (9357 por defecto). Modos: `cold`, `baseline`, `instrumented`. Siempre deja la pestaña en blanco al terminar para detener el render.
- `node scripts/summarize-startup-diagnostic.mjs`: recalcula inventario, tablas CSV y resúmenes a partir de las capturas.

No se hicieron cambios funcionales ni se publicó un deploy. No se ejecutó la suite de gameplay porque no cambió el juego; la verificación consistió en navegaciones reales completas, cero errores HTTP/runtime en las pasadas y revisión de los registros y la captura final.
