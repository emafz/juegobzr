# El más bizarro

Juego de cartas multijugador para teléfonos, hecho con React + Vite y un servidor Node.js + Socket.IO. La partida funciona entre 3 y 10 personas en una sala privada con código. No requiere cuentas ni servicios externos.

## Requisitos

- Node.js 20.19+ o 22.12+
- npm
- Para probar con varios teléfonos: todos conectados a la misma red Wi-Fi

## Iniciar en desarrollo

```bash
npm install
npm run dev
```

Buscá la dirección IP local de tu computadora (por ejemplo `192.168.1.50`) y abrí **http://192.168.1.50:5173** desde cada teléfono. En la computadora también podés abrir `http://localhost:5173`. Compartí el enlace o el código que aparece al crear la sala. Permití el acceso en el firewall si el teléfono no puede abrir la página. El puerto 5173 corresponde a Vite; el servidor de juego está en 3001 y Vite retransmite la conexión.

## Iniciar en producción

```bash
npm install
npm run build
npm start
```

Abrí `http://IP_DEL_SERVIDOR:3001` desde los teléfonos. Para jugar desde distintos lugares, alojá **la app y el proceso Node.js** en un servidor accesible por HTTPS; un hosting estático de Vite por sí solo no permite multijugador. Si tu proveedor define `PORT`, el servidor lo respeta. Configurá el proxy inverso para aceptar conexiones WebSocket de `/socket.io`.

## Publicar la interfaz en GitHub Pages

El workflow `.github/workflows/pages.yml` compila y publica la interfaz al hacer push a `main`. En GitHub, configurá **Settings → Pages → Build and deployment → Source → GitHub Actions**.

GitHub Pages solo sirve archivos estáticos; no ejecuta el servidor Socket.IO. Para que las partidas funcionen, alojá `server/` en un servicio Node.js con HTTPS y WebSockets habilitados. Luego agregá una variable de repositorio llamada `VITE_SERVER_URL` en **Settings → Secrets and variables → Actions → Variables**, con el origen público del servidor (por ejemplo, `https://juego.ejemplo.com`). El workflow la incorpora al build. Sin ese backend, la página se publica pero no podrá conectar jugadores.

## Reglas

- El anfitrión elige 8, 12 o 16 rondas (al menos tantas como jugadores) y empieza con al menos 3 personas conectadas.
- Todos tienen 5 cartas de respuesta preparadas, cada una de menos de 200 caracteres.
- Hay 30 segundos para elegir una; si alguien no llega, se juega una carta al azar.
- Un juez distinto en cada ronda no juega carta y elige la respuesta ganadora sin ver autores. Tiene 60 segundos para elegir; si se desconecta o vence el tiempo, se elige al azar.
- La respuesta ganadora suma 2 puntos. La carta jugada se repone después de la ronda.
- El juez rota por orden de ingreso. Empates finales comparten el primer lugar en puntos.

Las salas y las puntuaciones están en memoria; reiniciar el servidor termina las partidas. Los jugadores pueden reconectarse desde el mismo navegador mientras siga abierta la sala. Los códigos identifican salas privadas, pero no son una contraseña criptográfica.

## Archivos

- `src/`: interfaz para móvil.
- `server/index.js`: lógica de salas, turnos y temporizadores.
- `server/cards.js`: 50 consignas y 115 respuestas editables.

## Comprobación

```bash
npm test
npm run build
```
