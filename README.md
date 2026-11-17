# MOSPEADA

Prototipo mínimo para validar atmósfera y locomoción en un paisaje rural nocturno con React + R3F.

## Ejecutar

```bash
npm install
npm run dev
```

Abrí la URL que muestre Vite.

## Controles

- Click: capturar mouse
- Mouse: mirar
- WASD: caminar
- ESC: liberar mouse

## Alcance deliberado

No hay físicas, entidad, audio, clima dinámico ni assets externos todavía. El objetivo es validar únicamente:

1. sensación FPS,
2. escala del entorno,
3. noche / niebla / distancia visual,
4. dirección artística rural básica.

Siguiente iteración sugerida: reemplazar primitivas por assets GLB optimizados, incorporar cultivo instanciado y audio ambiental.


## Proyecto independiente

Copia completa del experimento Espectros de `C:\NSPOLITA\BG LEARN\01-yo`. Conserva los escenarios, controles, combate, narrativa, audio y assets del juego base. No incorpora Scott ni Cyclone.

Requiere Node.js 22.12 o posterior. Instalación reproducible: `npm ci`. Desarrollo: `npm run dev -- --host 127.0.0.1 --port 5173`. Producción: `npm run build`; vista previa: `npm run preview`. Pruebas existentes: `node --test`.

El historial Git comienza de cero, sin remotos heredados. El proyecto original se conserva intacto. La documentación previa del prototipo se mantiene arriba como referencia.
