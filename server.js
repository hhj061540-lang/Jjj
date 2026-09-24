const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 5900;

// Initialize WebSocket server directly on the environment port
const wss = new WebSocketServer({ port: PORT });

// Hook into the internal HTTP server for the POST /api/exec route
if (wss._server) {
  wss._server.on('request', (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'POST' && url.pathname === '/api/exec') {
      let body = '';

      req.on('data', chunk => {
        body += chunk;
      });

      req.on('error', (err) => {
        console.error('[HTTP] Request stream error:', err);
      });

      req.on('end', () => {
        // Prevent writing headers if response was already closed or sent
        if (res.headersSent) return;

        try {
          const payload = JSON.parse(body || '{}');
          const commandToRun = payload.command || 'echo "No command provided"';

          console.log(`\n[EXEC] Triggered command: ${commandToRun}`);

          // Spawn bash -c process
          const child = spawn('bash', ['-c', commandToRun]);

          let output = '';
          let errorOutput = '';

          // Stream stdout logs to console live
          child.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            process.stdout.write(`[STDOUT] ${chunk}`);
          });

          // Stream stderr logs to console live
          child.stderr.on('data', (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            process.stderr.write(`[STDERR] ${chunk}`);
          });

          // Handle process completion, logs, and exit codes (including exit 1)
          child.on('close', (code) => {
            console.log(`[EXEC] Process exited with code: ${code}`);

            if (code === 1) {
              console.warn(`[EXEC] Warning: Command exited with status code 1.`);
            } else if (code !== 0) {
              console.warn(`[EXEC] Warning: Command exited with non-zero status code: ${code}`);
            }

            const executionResult = {
              type: 'EXEC_RESULT',
              command: commandToRun,
              exitCode: code,
              stdout: output.trim(),
              stderr: errorOutput.trim(),
              timestamp: new Date().toISOString()
            };

            // Broadcast the result to all connected WebSocket clients
            wss.clients.forEach(client => {
              if (client.readyState === client.OPEN) {
                client.send(JSON.stringify(executionResult));
              }
            });
          });

          if (!res.headersSent) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: true, 
              message: 'Command spawned and logs streaming', 
              command: commandToRun 
            }));
          }
        } catch (err) {
          if (!res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
          }
        }
      });
    } else {
      if (!res.headersSent) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    }
  });
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log(`Client connected from ${req.socket.remoteAddress}`);

  ws.send(JSON.stringify({ message: `Connected to WebSocket server` }));

  ws.on('message', (message) => {
    console.log(`Received from client: ${message}`);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log(`WebSocket server running on port ${PORT}`);
console.log(`HTTP POST endpoint ready at /api/exec`);
