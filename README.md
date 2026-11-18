# MOSPEADA · Cyclone VR-052F

Estado actual: **jugabilidad activa**, con conducción, boost, wheelie, frenado, derrape, saltos y Scott a pie. El panel de animaciones fue retirado del juego. Se conservan geometría, esqueleto, pesos y los 16 clips originales de `assets/scott-bernard-animated.glb`. El juego usa una copia binaria exacta; el derivado rigidizado rechazado no se carga.

## Ejecutar

Requiere Node.js 22.12 o posterior.

```powershell
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

Abrir http://127.0.0.1:5173. No hace falta capturar el mouse. Producción: `npm run build` y `npm run preview`.

**F** frena antes de bajar con la secuencia corregida. A pie, **WASD** permite caminar, **Shift** correr y **Ctrl** agacharse; **F** cerca de la moto vuelve al punto de acceso izquierdo y reproduce la subida. Caminar (`walking_2_inplace`), correr (`Running`) y agacharse (`air_squat`) utilizan los clips originales con transiciones del mixer. **Mantener botón derecho** mueve la cámara, **rueda** acerca/aleja y **C** cambia de vista. La limpieza de hombreras sigue siendo sólo un cambio de mapas.

El Cyclone conserva el aumento solicitado del **7 % sobre el tamaño reducido anterior**: escala de instancia `0,88 × 1,07 = 0,9416`, con Scott en su escala previa intacta. El asiento queda a unos **0,845 m** en el marco de la moto. Ambos GLB y sus piezas internas permanecen intactos.

`public/animations/scott-cyclone-actions.json` conserva las secuencias de **2,5 s** fuera del GLB. La corrección actual cambia exclusivamente las cuatro pistas locales de la pierna derecha: `RightUpLeg`, `RightLeg`, `RightFoot` y `RightToeBase`. Copia la flexión original de **Roll_Dodge_4** (1,95–2,22 s) y su postura abierta de 0,20 s para la salida. Conserva las otras 42 pistas de subida/bajada, tiempos, pelvis, cuerpo, manos, pierna izquierda y pose de conducción. No se ejecuta IK sobre la pierna derecha ni se añaden rotaciones a la pose de Meshy. Los solapamientos con la moto se aceptan para priorizar naturalidad, según lo solicitado.

`scripts/patch-scott-right-leg-roll.mjs` aplica únicamente esa corrección sobre la coreografía congelada en `artifacts/scott-right-leg-roll/base-actions.json`. `scripts/author-scott-cyclone-actions.mjs` delega al mismo parche; el generador procedural anterior quedó desactivado. El cruce Roll_Dodge_4 y las animaciones originales a pie se reproducen sin IK superpuesto.

`mountedScottMotion.js` restituye exclusivamente las reacciones montadas: se pone de pie en los apoyos al saltar, vuelve al asiento y flexiona al caer, se recoge con boost, acompaña la frenada, apoya la pierna al detenerse o derrapar, mueve lentamente la cabeza detenido y empuja con los pies al retroceder. Cada cuadro restaura primero la pose del mixer para evitar acumulación. Usa los 24 huesos originales, conserva longitudes y pesos, mantiene las manos en los puños y limita la elevación por el alcance real de piernas y brazos.

Los apoyos virtuales de conducción se miden bajo cada pieza rayada `caballero-right`: suelas a **0,183 m**, unos **12 mm por debajo** del borde inferior (0,195 m), sin añadir geometría. El final de subida y el inicio de bajada interpolan hacia estos apoyos solamente en el tramo de asiento; el cruce de la pierna derecha procedente de Roll_Dodge_4 permanece intacto.

La copia activa es `public/models/mospeada/scott-bernard-animated-original.glb`. `npm test` verifica integridad de los 16 clips, pistas conservadas, alcance, contacto y apoyos durante salto, boost y frenada. `node scripts/validate-restored-gameplay.mjs` prueba el ciclo completo con teclado real; `node scripts/validate-mounted-scott-motion.mjs` captura nueve maniobras sobre el terreno real. Informes y capturas actuales: `artifacts/gameplay-restored/`. La revisión previa de los clips queda en `artifacts/scott-right-leg-roll/`. Las manos mantienen su geometría original y un hueso por mano.

Controles de juego:

| Control | Acción |
| --- | --- |
| W / flecha arriba | Acelerar |
| S / flecha abajo | Frenar; al llegar a cero, mantener para retroceder a pie |
| Espacio | Freno de mano: bloquea la rueda trasera y permite derrapar |
| Shift izquierdo / derecho | Booster de turbina: un golpe por pulsación, recarga de 1,5 s |
| Ctrl izquierdo / derecho | Mantener para wheelie estable, máximo 6 s; soltar para bajar y rearmar |
| F | Bajar del Cyclone; cerca de la moto, volver a subir |
| W A S D a pie | Caminar en relación con la cámara |
| A D / flechas izquierda y derecha | Girar |
| R | Reiniciar en autopista |
| 1 / 2 / 3 / 4 / 5 | Autopista / curvas / terraplén / campo / cresta de salto |
| C | Cambiar entre vista trasera, laterales e inspección; todas permiten mover la cámara |
| Mouse / arrastre táctil | Mirar alrededor desde el inicio, sin tecla de activación |
| Rueda / pellizco | Acercar o alejar |
| Recentrar | Volver al encuadre trasero cercano |
| P / Escape | Pausa; también se pausa al perder foco |
| M / N | Noche / día; los cuatro faros se encienden automáticamente de noche |

Los botones en pantalla permiten elegir escenario, pausar, cambiar cámara y afinar parámetros. En dispositivos táctiles aparecen acelerador, freno, dirección, freno de mano y booster. La cámara también se puede mover en pausa; el panel de pausa deja libre el centro de la pantalla. Las ubicaciones también aceptan `?start=highway`, `curves`, `slope`, `rough` o `jump`.

## Assets elegidos

Archivos de ejecución, todos locales y con texturas embebidas:

- `public/models/mospeada/cyclone-vr052f.glb`: reconstrucción del ensamblado final de materiales; 203 superficies, 189.953 triángulos y 7 imágenes embebidas. No es el GLB Meshy de referencia.
- `public/models/mospeada/scott-bernard-animated-original.glb`: copia binaria exacta de `assets/scott-bernard-animated.glb`; un skin, 24 huesos, 3 texturas y los 16 clips originales de Meshy.
- `public/animations/scott-cyclone-actions.json`: secuencias independientes de subir/bajar y pose de referencia, con la corrección local de Roll_Dodge_4. Los apoyos inferiores y las reacciones montadas se aplican por código, conservando las proporciones del esqueleto. El antiguo `scott-bernard-gear.glb` y `scott-riding-pose.json` permanecen como recursos históricos y no se cargan en el juego.
- `public/models/mospeada/asset-manifest.json`: rutas completas, SHA-256 originales, tamaños, piezas y límites geométricos.

El punto de entrada de 3D LAB es:

`C:/IT-UP/3D-LAB/assets/mospeada/assembly json/cyclone-material-assembly.json`

Sus únicas dependencias de geometría son estos cinco archivos en `C:/IT-UP/3D-LAB/assets/mospeada/assembly json/material-studio/`:

1. `vr052-cyclone-1rst-attempt · test-soldar.json` — frente, tanque, ópticas, controles y las dos horquillas.
2. `cyclone-rueda.json` — rueda delantera final.
3. `cyclone-rueda-rear.json` — rueda trasera final.
4. `arm-guard-cuff.json` — protectores izquierdo y espejo derecho.
5. `rear_body-axle-rounded.json` — asiento, cuerpo trasero, motor, escapes y brazos mecánicos.

Aunque el nombre del primer archivo conserva “1rst-attempt”, es la versión que referencia el ensamblado final de materiales e incluye las horquillas hidráulicas y ópticas actuales. No se seleccionó por su nombre. Se excluyeron referencias Meshy, ruedas antiguas ocultas, backups, tests, el Scott sin rig y el Invid presente en el proyecto de autoría.

Para regenerar los GLB: `npm run assets:import -- C:/IT-UP/3D-LAB`. El Cyclone usa el evaluador real de piezas, sólidos, biseles, grupos, gráficos y materiales de ese proyecto, leyéndolo sin modificarlo. Scott se toma de `assets/scott-bernard-gear.glb` de MOSPEADA y se adapta la pose original al nuevo rig. Necesita las dependencias de 3D LAB instaladas; escribe únicamente en MOSPEADA. Los JSON pesados y el editor no son necesarios para jugar.

Para actualizar solamente a Scott después de reemplazar el archivo local: `npm run assets:scott`. Conserva la pose actual, la adapta al nuevo esqueleto y actualiza el GLB de ejecución y el manifiesto, sin reconstruir la moto ni necesitar 3D LAB.

Escala: factor uniforme 1,3, batalla 1,567 m y radios de neumático 0,375 m. Conversión de ejes original −X hacia delante a +Z hacia delante, +Y arriba, +X eje de rueda. La geometría original conserva sus posiciones relativas; las transformaciones se aplican sobre copias.

## Mecánica y conducción

- Chasis separado del conjunto de dirección, articulado sobre el eje real inclinado de las horquillas. El display, sus cubiertas, las cajas y los mandos del manubrio permanecen fijos en el puesto de conducción.
- Ruedas delantera y trasera con pivotes en sus centros y giro por distancia; la delantera cubre el arco más largo de las curvas.
- Las abrazaderas, orejetas y pasadores superiores de las dos horquillas quedan fijos al chasis. Cada vástago bascula desde su asiento superior fijo hacia el apoyo móvil de la rueda; la manga hueca acompaña ese apoyo y conserva el mismo eje que el vástago. La inserción cambia con dirección y suspensión, sin mover la base superior ni escalar destructivamente las piezas. Los anclajes inferiores siguen el soporte de rueda. Los protectores siguen la rueda sin girar con el neumático.
- Los antiguos brazos rígidos se ocultan únicamente en la copia de ejecución y se sustituyen por hidráulicos telescópicos: base fija con rótula, camisa, sello, vástago y anclaje exterior al soporte de rueda. Su longitud y orientación se resuelven en cada cuadro. Ambos pivotes se alojan dentro de las ranuras originales de las bases circulares; se mide su fondo sobre los triángulos del modelo y se elimina el separador exterior. El hidráulico delantero articula en el apoyo posterior del guard. Al girar a la izquierda, el guard abre hasta 11,46° alrededor de su punta de contacto con la rueda para dejar pasar el actuador. El ángulo se ajusta con `guardClearanceAngle` en `bikeConfig.js`. Los anclajes y el límite mecánico de dirección mantienen el actuador fuera del neumático.
- Modelo de bicicleta para conducción normal, con dirección dependiente de velocidad, arrastre, gravedad longitudinal en pendientes e inercia. El motor alcanza unos 215 km/h en llano, con límite configurable de 60 m/s (216 km/h). El arranque añade un tirón de 0,38 s; el 0–100 ronda los 3 s. El freno normal muerde a 26 m/s²: en la prueba plana, de 100 km/h a cero pasa de 24 m / 1,74 s a 14,7 m / 1,08 s, con hundimiento delantero y descarga trasera.
- Shift activa un impulso de turbina de 10 m/s más una cola de empuje de 0,55 s. Funciona también en el aire; mantener la tecla apretada no repite impulsos. Hay que soltar, completar la recarga de 1,5 s y volver a pulsar. Puede superar la velocidad del motor hasta el tope de 80 m/s (288 km/h); al terminar conserva la inercia y pierde velocidad por arrastre. El freno, la reversa y el freno de mano cortan el empuje. El HUD muestra actividad y recarga, con un breve retraso de la cámara de seguimiento al disparar. La turbina trasera todavía no está modelada.
- Paso fijo de 120 Hz; dos apoyos elásticos independientes, amortiguación y topes. La altura y el pitch del chasis resultan de ambos apoyos: al salir se comprime la suspensión trasera y se descarga la delantera; al frenar se hunde la delantera y se descarga la trasera. Las ruedas conservan el apoyo, y la transferencia está limitada al recorrido real de cada mecanismo.
- Lean progresivo según velocidad y curvatura, recuperación amortiguada y adaptación al peralte. La inclinación se combina con el pitch y el terreno.
- Contacto por interpolación de los triángulos realmente renderizados: suelo, camino, asfalto, terraplenes y extensión de autopista. El perfil real del neumático y la normal local determinan su apoyo al inclinarse y subir pendientes.
- Scott acompaña el chasis; IK y orientación de muñeca ajustan la geometría visible del guante dentro del volumen inclinado real de cada caja. El torso responde a la conducción y los pies mantienen objetivos en la moto. Al detenerse, la moto se inclina unos 8° a la izquierda, Scott apoya el pie izquierdo sobre el suelo y mira lentamente hacia ambos lados. Mientras está detenido mantiene la retención para que no vuelva a rodar en una pendiente. Al acelerar o retroceder libera esa retención y recupera la postura de conducción.
- Cámara suavizada con anticipación y comprobaciones contra terreno/obstáculos; no hereda el roll ni cada oscilación de suspensión.
- Iluminación nocturna desde las cuatro ópticas reales: dos haces blancos de carretera con sombras y dos haces ámbar más cortos, orientados según las caras triangulares. Las superficies originales de vidrio, los proyectores internos y los triángulos se iluminan sin cambiar su geometría ni teñir la carrocería. Cada emisor está situado 12 mm por fuera de su cara óptica, medida sobre los triángulos del modelo, y acompaña al chasis. La emisión y la luz se desvanecen al pasar a día; los materiales originales del GLB permanecen intactos. Los parámetros están en `src/vehicle/cycloneLights.js`.
- Colisiones conservadoras con las primitivas del entorno y bloqueo al alcanzar el límite de la superficie disponible.

Los parámetros principales están en `src/vehicle/bikeConfig.js`. El panel **Ajustes** los cambia durante la sesión. El recorrido delantero está configurado entre −55 mm de extensión y +60 mm de compresión sobre su eje; el trasero dispone de 65 / 60 mm. La cinemática resuelve el ángulo y la longitud real de cada horquilla entre sus apoyos, manteniendo inserción en las mangas. El barrido de 63 combinaciones de dirección y altura comprueba ahora ambos extremos del recorrido completo.

Con Shift, el Cyclone y Scott reciben un golpe corto hacia atrás: la moto retrocede visualmente hasta 3,5 cm y la cadera acompaña el primer instante. Scott enseguida baja el cuerpo y se acurruca hacia adelante para contrarrestar el empuje. Con S, su torso acompaña el cabeceo hacia adelante. Las muñecas conservan sus objetivos dentro de las cajas y no se escalan huesos. Los cambios de carga sobre suelo plano no producen despegues por rebote de suspensión.

El entorno conserva los 11.000 grupos de pasto originales, su modelo, escala, colores y viento. La autopista extendida añade vegetación anclada a parcelas de mundo que se reciclan fuera del radio visible, con la misma geometría y distribución densa; no hay reducción automática de calidad. La niebla vuelve a su densidad original de 0,068. Las reflexiones de estudio se aplican sólo a materiales privados de Scott y el Cyclone: el suelo conserva sus mapas originales de color, normales y rugosidad y su iluminación exterior. El terraplén escribe profundidad para evitar que sus caras se dibujen por encima unas de otras como parches planos, manteniendo el borde difuminado.

El hidráulico lateral delantero queda paralelo al chasis en reposo, en el mismo plano lateral que su base circular. Su extremo móvil termina detrás del guard; un tubo de unión llega hasta la superficie real del refuerzo inferior de la horquilla vertical. Su longitud y orientación se actualizan entre ambos anclajes para conservar la conexión durante giro y suspensión. El barrido de dirección y suspensión comprueba los dos extremos de la unión y su separación del neumático, además de la separación del actuador respecto del guard.

La opción **Despegue por inercia**, activada por defecto, permite perder el apoyo en crestas y descensos abruptos. El impulso usa la pendiente de entrada y la velocidad de avance, en lugar de depender sólo del resorte. La detección del aterrizaje utiliza la velocidad real del terreno, para no volver a apoyar una rueda que ya está subiendo sobre una cresta plana. El techo del impulso crece con la velocidad hasta el máximo configurado de 11 m/s; la gravedad aérea permanece en ×1,6. En el perfil real de la autopista, con entradas de 8 / 20 / 40 / 80 m/s, se verificaron separaciones máximas de 1,83 / 2,25 / 4,18 / 5,73 m. La cresta del escenario 5 y el terraplén permiten probarlo. Desactivar la opción impide nuevos despegues; si ya estaba en el aire termina el aterrizaje sin teletransportarse.

Al aterrizar, el primer eje que toca recibe un impulso descendente limitado: el chasis comprime la suspensión durante varios fotogramas, en vez de saltar directamente a una postura comprimida. El recorrido adicional transitorio permite hasta 25 cm en la horquilla y 23 cm detrás; la simulación y la articulación visual comparten esos límites. En la caída de prueba desde 3 m, el cuerpo baja unos 20 cm, rebota unos 5,5 cm por encima del reposo y hace un segundo asentamiento de 2 cm. Las ruedas mantienen su apoyo y la oscilación se amortigua. El rebote no activa el impulso de despegue en una pendiente leve. El recorrido normal de frenado y aceleración permanece en 6 cm. **Ajustes** permite variar el impulso al despegar y la amortiguación al aterrizar.

Scott se pone de pie sobre los apoyapiés al despegar: la cadera sube hasta 30 cm y avanza 14 cm, las piernas se extienden y el torso se inclina hacia el manubrio. IK conserva las plantas de ambas botas en un marco fijo sobre los apoyos y las manos dentro de las cajas. La orientación de las botas y los dedos se toma de la suela plana del GLB original, no del vector tobillo–dedos de Meshy. Las rodillas flexionan hacia adelante al incorporarse, sin abrirse hacia afuera. Al tocar el suelo flexiona las rodillas y vuelve al asiento suavemente. Durante la coleada extiende la pierna del lado de inclinación real del chasis, con la bota orientada hacia el suelo y el alcance limitado por sus huesos; la otra pierna conserva su apoyo. La recoge al recuperar velocidad estable o detenerse. Las transiciones se calculan en el paso fijo, sin acumulación de transformaciones ni cambios de escala, pesos o archivos GLB.

Espacio bloquea la rueda trasera y frena a 23 m/s²: desde 72 km/h se detiene en unos 0,93 s, y desde 100 km/h en 1,25 s sobre el plano. El balanceo inicial se desvanece durante 0,8 s; la rotación de la coleada también se atenúa y termina a los 1,25 s de sostener el freno para evitar vueltas continuas. Al detenerse se anulan giro y deslizamiento residual. Con A/D el chasis gira alrededor del apoyo delantero y la trasera sale hacia el lado opuesto. El motor deja de transmitir fuerza por la rueda bloqueada. Al soltar se recupera agarre progresivamente. La cámara de seguimiento acompaña la trayectoria.

S / flecha abajo frena primero hasta cero. Si se mantiene, hay una pausa de 0,18 s para plantar ambos pies y Scott empuja el Cyclone hacia atrás, hasta 0,9 m/s (3,24 km/h). Los pasos son alternados, con cada pie anclado al suelo durante su apoyo y levantado al recuperarlo. No hay fuerza de motor hacia atrás. Al soltar S, Scott retiene la moto con los pies y vuelve a la postura de reposo. Q ya no activa movimiento. El indicador muestra **A PIE** al retroceder y el botón táctil combina freno/atrás.

La textura del suelo excita suavemente los apoyos elásticos mientras se avanza. La clasificación de asfalto/tierra procede de la malla realmente situada debajo de cada rueda, incluidas las extensiones recicladas. Las ruedas mantienen el contacto con su geometría real: la variación actúa sobre la suspensión del chasis. En la prueba a 20 m/s se midieron unos ±3 mm en asfalto y ±1,2 cm en tierra, sin nuevos despegues y sin vibración detenida.

Ctrl levanta el conjunto de chasis, horquillas y Scott alrededor del eje trasero hasta una postura estable de unos 49°. Las manos y botas conservan sus apoyos; la rueda trasera sigue el terreno. Es un wheelie de exhibición: no vuelca ni exige equilibrio manual. Comienza por encima de 9 km/h y dura como máximo 6 s desde que empieza. Al terminar baja el frente, aunque siga pulsada la tecla; hay que soltar Ctrl para poder repetirlo. Soltar antes, frenar o perder el apoyo trasero también baja el frente. La duración y el ángulo están en `wheelieDuration` y `wheelieAngle`.

Al bajar del wheelie, el frente cae por aceleración angular, en vez de interpolar lentamente al reposo. Desde la postura completa tarda unos 0,38 s en tocar: el golpe alimenta el solver de suspensión, comprime la horquilla unos 20 cm, hunde el cuerpo unos 11 cm y deja un rebote amortiguado. Scott flexiona el cuerpo con el impacto, conservando manos y pies en sus apoyos. Ocurre tanto al soltar Ctrl como al agotarse los 6 s. A/D gira la rueda delantera y las horquillas hasta el límite mecánico de ±30°, con una leve inclinación de equilibrio. El ángulo visual se reintegra al límite de conducción durante la bajada para evitar un giro brusco al apoyar a alta velocidad.

`node scripts/validate-wheelie-impact.mjs` comprueba ambas direcciones, impacto único, compresión/rebote, continuidad de los hidráulicos y contacto de ruedas en 85 muestras del recorrido real. Capturas e informe PBR/Anime: `artifacts/driving/wheelie-impact/`.

F frena primero si la moto está en movimiento y Scott baja por un lado disponible. Hay una transición de 1,1 s, el pie lejano pasa sobre el asiento y se despliega un caballete. A pie, WASD mueve a Scott respecto de la cámara y ésta lo sigue; la moto queda estacionada. Los pies se anclan durante el apoyo y se levantan en la recuperación. Se respetan terreno, obstáculos y la huella del Cyclone. F dentro de 1,8 m devuelve al asiento y restaura los mandos de conducción. Las poses de pie parten de los marcos de reposo reales del GLB, con IK y las suelas originales; no se modifican materiales, proporciones, pesos ni archivos de modelo.

`node scripts/validate-wheelie-presence.mjs` prueba Ctrl y F con entradas de teclado, duración, contacto trasero, caminar sin mover la moto, apoyo de botas, subida y poses en PBR/Anime. Capturas e informe: `artifacts/driving/actions/`.

Sigue siendo una simulación arcade: no simula caídas laterales ni colisiones volumétricas de un motor rígido completo. No incluye transformación, combate ni enemigos.

## Cámara de conducción

La tercera persona inicia cerca del Cyclone: distancia horizontal de 3,5 m, altura de 1,9 m y mirada adelantada sólo 0,4 m. Mantener el botón derecho y arrastrar mueve la vista; soltarlo deja el cursor libre. La rueda y los gestos táctiles siguen funcionando. Los controles de la interfaz conservan sus propios eventos. Todas las vistas están activas desde el comienzo. Recentrar devuelve la vista trasera; C cambia la posición inicial de la vista. En inspección, arrastrar con el botón central desplaza el encuadre.

La cámara incorpora de inmediato el desplazamiento de la moto. Se suaviza el ángulo y el pequeño desplazamiento de la mirada, en lugar de interpolar toda la posición: así no acumula una separación proporcional a la velocidad. El alejamiento adicional por velocidad está limitado a 48 cm, más hasta 10 cm de boost. La rueda conserva el zoom elegido. Después de mirar alrededor, el seguimiento se recupera suavemente tras 1,4 s sin intervención si la moto se mueve; detenido o en pausa mantiene el ángulo. Se conservan los límites contra terreno y obstáculos.

`node scripts/validate-driving-camera.mjs`: prueba botón derecho sin V, zoom, Recentrar, seguimiento a alta velocidad, gestos táctiles y el encuadre PBR/Anime. Las cuatro pruebas Node verifican distancia a 0/20/60/80 m/s, botones de mouse, pausa, retorno suave, zoom y colisión. Capturas e informe: `artifacts/driving/camera/`.

## Renderizado PBR / Anime

El selector **PBR / ANIME** aparece debajo de los escenarios. El juego inicia en **Anime**. El cambio es inmediato una vez preparada la variante Anime, sin recargar la escena ni importar nuevamente los GLB. **Comparar** muestra PBR a la izquierda y Anime a la derecha con una división deslizable, usando la misma cámara y el mismo estado de animación. Funciona también al orbitar con el mouse y con **P**, la pausa.

**Ajustes Anime** permite activar cel shading, elegir 2–5 niveles, cambiar intensidad de sombras, contornos, grosor, color y reflejos estilizados. Los valores iniciales son 3 niveles, sombras 0,72, contornos de 1,2 píxeles CSS azul oscuro `#111b2e` y reflejos 0,55. Los ajustes duran durante la sesión; Restablecer estilo recupera esos valores.

La implementación en `src/rendering/` conserva los materiales PBR y crea variantes de sus shaders de fragmentos. Reutiliza los mapas de color, normales, rugosidad, metal y oclusión; mantiene skinning, morphs, instancias, mapas de sombras, transparencia, transmisión y emisión originales. La iluminación difusa y los reflejos se cuantizan, con sombras frías y un mínimo de luz que varía entre día y noche. El brillo azul utiliza una máscara cromática del mapa existente de Scott, que tiene un único material horneado. El vidrio conserva su transmisión; goma, pintura y metal conservan sus parámetros y mapas. La atmósfera mantiene sus shaders de nubes, lluvia y niebla; el pasto conserva su viento y sus colores, con bandas en su gradiente de altura.

Anime renderiza una pasada de escena en un destino HDR con máscara y profundidad, seguida de una pasada de pantalla. Los contornos detectan siluetas y oclusiones; no dibujan las normales de cada cara ni añaden mallas alrededor del personaje. El grosor se calcula en píxeles CSS, ajustado al DPR, y los contornos se atenúan con la niebla. El modo Comparar añade una pasada PBR y copia su framebuffer real para conservar exactamente su aspecto, incluido el orden de niebla y tone mapping. PBR usa el render directo original, sin posprocesado.

El Canvas usa explícitamente PCF, el algoritmo que Three.js ya aplicaba como reemplazo de PCFSoft; así no recompila sombras al reconfigurar la vista. La carga inicial prepara PBR y Anime con iluminación de día y noche, incluidos los mapas de sombras, las pasadas internas del vidrio y la consulta de uniformes/atributos al driver. Las pasadas ocultas usan destinos temporales de 16×16, reutilizan las sombras dentro de cada iluminación y comparten programas cuando sólo cambian uniformes; no se dibuja PBR a pantalla completa repetidamente durante la espera. La primera imagen y el juego conservan resolución, antialiasing y sombras completos. La pantalla muestra «Preparando iluminación y estilos…» hasta terminar; la primera carga puede durar más, evitando compilar esas variantes al pulsar M o cambiar de estilo. Los controles modifican uniformes y no recompilan shaders. La máscara de contornos usa un único canal R8; con los contornos apagados, y en la mitad PBR de Comparar, se omiten sus lecturas de profundidad. La geometría, los huesos, las animaciones y los GLB no se modifican. No hay reducción automática de pasto, texturas, niebla ni resolución para compensar el efecto.

Capturas de día, noche, casco y armadura e informe de rendimiento: `artifacts/anime/`. La medición en Chrome aislado sobre Intel UHD a 1422×904 dio aproximadamente 215 ms/cuadro en PBR y 264 ms/cuadro en Anime (4,6 y 3,8 FPS). Esta instancia ya presenta un rendimiento de base bajo: la prueba verifica funcionamiento y coste adicional, pero no acredita fluidez en la sesión del usuario. Comparar cuesta más que jugar con un solo modo.

## Experimento: pincelada de luz

**Reflejo · ensayo** abre el panel. **Reproducir reflejo** activa Anime y lanza una pincelada rectangular alargada transversalmente a la moto. Recorre de adelante hacia atrás las 70 piezas pintadas de la carrocería, incluidos ambos lados, tapas inferiores, guardas y cola, con un barrido de 0,55 segundos por superficie y retrasos de hasta 0,32 segundos entre piezas/caras (secuencia total de 0,87 s). La repetición automática depende de la velocidad: no hay pasadas detenido; las pausas se acortan progresivamente al acelerar y se alargan al desacelerar. A partir de unos 234 km/h quedan sólo unos 40–50 ms entre secuencias. El desfase aleatorio por pieza permanece intacto. La pausa del juego congela la animación y la reproducción manual sigue disponible detenido. Se pueden ajustar velocidad, tamaño, intensidad, irregularidad, dirección, sensibilidad a normales/relieves, desfase y color. **Desfase entre paneles** permite comparar con el recorrido sincronizado al llevarlo a cero. Las piezas repetidas a izquierda y derecha tienen tiempos diferentes; la orientación introduce una variación suave sin separar triángulos coplanares. **Reproducción lenta (¼)** prolonga la secuencia a 3,48 segundos con la velocidad inicial; **Fotograma** permite detenerlo en cualquier punto para inspeccionarlo con la cámara libre.

El shader usa un desarrollo intrínseco de los triángulos reales de cada pieza. La posición longitudinal en reposo coordina la llegada del reflejo a las distintas piezas, mientras que el desarrollo de superficie, una variación propia de cada panel y las normales/relieves definen su contorno e intensidad. Las caras con otra orientación cambian el brillo; los bordes y pliegues fuertes lo interrumpen, sin marcar cada triángulo de las superficies curvas. Los tornillos, faros, juntas, goma, controles y vástagos mecánicos quedan fuera de la selección.

No utiliza sprites, imágenes ni texturas animadas, ni añade pasadas de renderizado. Los atributos de superficie viven en copias privadas de geometría, sin cambiar posiciones, normales, rig ni archivos GLB. Sólo se usan junto con los materiales Anime de las piezas seleccionadas; PBR recupera sus referencias originales. `SurfaceBrush`, `surfaceBrushGeometry` y `surfaceBrushShader` separan reproducción, selección y apariencia.

Capturas y comprobaciones: `artifacts/anime/brush/`. `npm run test:brush` ejecuta la prueba visual sobre el Chrome aislado local conectado por CDP, como las otras validaciones de navegador.

## Validación

`npm test`: pruebas existentes más conducción, independencia del frame rate, frenado, recuperación de lean, cambios rápidos de dirección, topes/amortiguación, normales/triángulos de terreno, chunks móviles, materiales/skin originales, alcance de manos/pies y contacto de la silueta real de las ruedas en pendientes y curvas.

`npm run build`: compilación de producción.

Al detenerse, la bota izquierda adapta su suela a la normal local del terreno. El apoyo se calibra sobre la geometría original y conserva un margen de sólo 4 mm para evitar intersecciones. La prueba comprueba talón y antepié, no únicamente el vértice más bajo. El GLB y sus pesos permanecen intactos.

`node scripts/validate-foot-support.mjs`: valida el apoyo en PBR, Anime y después de una coleada; capturas e informe en `artifacts/driving/foot/`. Las pruebas Node incluyen distintos rumbos y pendiente. `--reuse` permite comprobar poses sobre el navegador ya preparado y registra por separado el estado WebGL inicial.

`node scripts/validate-rider-actions.mjs`: captura postura sentada, de pie durante un salto real, contacto, flexión, regreso al asiento y coleadas hacia ambos lados, incluida una captura Anime. Verifica apoyos, extensión de piernas, alcance y guantes dentro de los cobertores. Informe y capturas en `artifacts/driving/rider/`.

`node scripts/validate-driving-refinements.mjs`: compara cuatro velocidades sobre el terraplén real, captura el golpe y la postura de boost, comprueba pasos de retroceso, clasificación y amplitud de suspensión; prueba S y Q con teclado real. Informe y ocho capturas en `artifacts/driving/refinements/`.

`node scripts/validate-heavy-landing.mjs`: prueba la caída desde 3 m sobre la calzada real y el salto sobre la cresta. Verifica el contacto de ambas ruedas durante compresión y rebote, los anclajes de horquilla y el alcance de las manos; guarda cinco capturas y el informe en `artifacts/driving/landing/`. Las pruebas Node cubren también el rebote sobre una bajada leve y comparan 30/120 FPS.

`node scripts/validate-action-dynamics.mjs`: compara frenada y saltos antes/después; reproduce las maniobras sobre el terreno real, comprueba manos, contacto de ruedas e inserción de horquillas, incluidas las compresiones al primer impacto. Prueba Espacio+A y Shift mediante teclado real en el Chrome aislado de pruebas y guarda capturas PBR/Anime en `artifacts/driving/action/`. `npm test` verifica también la coleada a ambos lados, el balanceo con dirección recta, impactos con cualquiera de los dos ejes primero y la independencia de 30/120 FPS.

`node scripts/validate-render-switches.mjs`: recarga el juego, espera la preparación inicial y mide los primeros renders de cada combinación PBR/Anime y día/noche, esperando la finalización de la GPU. Exige cero shaders nuevos, cero errores WebGL y ausencia de bloqueos de segundos. Informe: `artifacts/anime/switch-performance.json`. El bloqueo reproducido antes de corregir la precarga fue de 22,9 s y 72 programas nuevos en el primer PBR nocturno; después dio 33,6 ms con cero programas nuevos, y Anime nocturno 25,1 ms. Estos tiempos de una pasada no son una medida de FPS de conducción ni de la sesión del usuario.

`npm run test:anime`: validación en el Chrome aislado de pruebas del puerto 9333 y servidor local 5173. Comprueba igualdad de píxeles del render PBR directo, retorno desde Anime y referencia PBR de la comparación; cambios visibles de todos los controles; conservación de materiales, geometrías y 24 huesos; ausencia de nuevas cargas GLB; faros nocturnos, pasto/niebla, conducción, las cuatro cámaras, redimensionado y DPR 1,5. Genera `artifacts/anime/validation.json` y nueve capturas. `npm test` incluye además las pruebas de variantes de materiales, shaders y estado Anime.

`npm run test:driving`: prueba de teclado y capturas sobre el servidor local usando un Chrome de pruebas con depuración en el puerto 9333. Requiere el servidor en 5173 y una página abierta en ese Chrome. El comando controla solamente esa instancia de prueba.

El informe y las capturas están en `artifacts/driving/`: aceleración, giro, cambio rápido de dirección, frenado, pendiente y campo. El informe registra velocidad, lean, recorridos y errores de contacto/alcance. El acceso de diagnóstico `window.__MOSPEADA__` existe únicamente en desarrollo.

Los siete archivos de origen de 3D LAB fueron comprobados por SHA-256 después de importar para confirmar que no cambiaron.

La revisión de articulación, cámara libre, derrape, salto y postura detenida se comprueba con `node scripts/validate-revision.mjs`; capturas e informe en `artifacts/driving/revision-validation.json`. Las pruebas de geometría verifican también los planos inclinados de las cajas, las dos uniones de cada hidráulico, su separación del neumático y la suela del pie apoyado.

Alojamiento y separación del guard: `node scripts/validate-hydraulic-seating.mjs`. Informe `artifacts/driving/hydraulic-seating-validation.json` y cuatro vistas cercanas `hydraulic-seated-*.png`. Las pruebas de geometría barren 21 ángulos por tres alturas de suspensión y comprueban el alojamiento de ambos cuerpos, el pivote fijo y las separaciones tubo/guard/neumático.

Horquillas con asiento superior fijo: `node scripts/validate-front-forks.mjs`. Informe `artifacts/driving/front-forks-validation.json` y capturas `front-forks-*.png`. Comprueba ambas bases superiores, apoyos inferiores, coaxialidad e inserción en recta, giros a ambos lados, compresión, extensión y vuelo.

Velocidad, tirón y booster: `node scripts/validate-boost.mjs`. Prueba las dos teclas Shift, impulso por pulsación, recarga sin repetición automática, freno de mano independiente y carga delantera/trasera con capturas. `npm test` comprueba también velocidad sostenida, impulso aéreo, independencia de 30/120 FPS y contacto de neumáticos/anclajes del modelo real durante salida, boost y frenada.

Faros: `node scripts/validate-night-lights.mjs`, usando el mismo Chrome aislado de pruebas y servidor local. Comprueba las cuatro ópticas, colores, encendido con M, apagado con N y el aporte independiente de cada haz blanco sobre el asfalto. Durante la comparación A/B fija la iluminación ambiental para evitar que los relámpagos contaminen las mediciones. Capturas `artifacts/driving/night-lights-*.png` e informe `night-lights-validation.json`.

Entorno: `node scripts/validate-environment.mjs` comprueba densidad original de pasto y niebla, mapas PBR cargados, reflexiones limitadas al vehículo y continuidad de vegetación más allá del campo original. Verifica que las parcelas regresen a las mismas posiciones al reciclarlas y que sigan funcionando los faros nocturnos. Informe y capturas `artifacts/driving/environment-restor*`. La instancia aislada de pruebas no constituye una medición del rendimiento de la sesión del usuario.

### Manos de Scott y tapizado

Las manos usan una variante reversible de geometría en memoria (`relaxedScottHands.js`): dedos suavemente curvados a pie y agarre más compacto al conducir. El GLB, los 24 huesos, los pesos, los antebrazos y los 16 clips originales permanecen intactos. No hay huesos individuales de dedos. La transición al agarre acompaña la fase final de sentarse; las palmas se colocan usando los puños medidos y el ancho real de ambas tapas. La secuencia de cruce de pierna permanece sin cambios.

El asiento conserva su color y geometría, con material dieléctrico de rugosidad 0,98 y reflejos Anime reducidos específicamente para el tapizado. La carrocería mantiene sus brillos.

Comparación frontal, lateral, primeros planos y asiento PBR/Anime: `node scripts/validate-hand-relaxation.mjs`; archivos en `artifacts/hand-relaxation/`. La prueba de integración comprueba los guantes dentro del ancho de las tapas y los apoyos durante salto/boost.

Medición de carga: `node scripts/measure-startup.mjs etiqueta` (opcional `MOSPEADA_TEST_URL` para otro puerto). Con caché de archivos desactivada, el navegador aislado midió 66,1 s antes y 14,7 s después; la preparación gráfica pasó de 35,1 s a 2,4 s. Informes en `artifacts/render-startup/`. Son mediciones de ese navegador/equipo, no una garantía para otras sesiones.
