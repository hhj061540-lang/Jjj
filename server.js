const { WebSocketServer } = require('ws');
const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 5900;

// 1. Create the HTTP server to handle standard POST requests and routes
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'POST' && url.pathname === '/api/exec') {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      if (res.headersSent) return;

      try {
        const payload = JSON.parse(body || '{}');
        const commandToRun = payload.command || 'echo "No command provided"';

        console.log(`\n[EXEC] Triggered command: ${commandToRun}`);

        // Spawn bash -c process
        const child = spawn('bash', ['-c', commandToRun]);

        let output = '';
        let errorOutput = '';

        child.stdout.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          process.stdout.write(`[STDOUT] ${chunk}`);
        });

        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          errorOutput += chunk;
          process.stderr.write(`[STDERR] ${chunk}`);
        });

        child.on('close', (code) => {
          console.log(`[EXEC] Process exited with code: ${code}`);

          const executionResult = {
            type: 'EXEC_RESULT',
            command: commandToRun,
            exitCode: code,
            stdout: output.trim(),
            stderr: errorOutput.trim(),
            timestamp: new Date().toISOString()
          };

          wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(JSON.stringify(executionResult));
            }
          });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Command spawned and logs streaming', 
          command: commandToRun 
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// 2. Attach WebSocketServer to the HTTP server instance
const wss = new WebSocketServer({ server });

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

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
