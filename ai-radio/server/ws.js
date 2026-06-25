const { WebSocketServer } = require('ws');

let wss;

function setupWebSocket(server) {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('🌐 WebSocket connected');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // For now, echo back
        ws.send(JSON.stringify({ type: 'echo', data: msg }));
      } catch {
        // ignore
      }
    });

    ws.on('close', () => {
      console.log('🌐 WebSocket disconnected');
    });
  });

  return wss;
}

function broadcast(data) {
  if (!wss) return;
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(msg);
  });
}

module.exports = { setupWebSocket, broadcast };
