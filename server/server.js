require("dotenv").config();
const http = require("http");
const { app, ready } = require("./app");
const { initSocket } = require("./socket");
const { PORT, NODE_ENV, HOST } = require("./config");

const server = http.createServer(app);
initSocket(server);

(async () => {
    await ready;
    
    server.listen(PORT, HOST, () => {
        console.log(`[SERVER] ✓ Server started on port ${PORT}`);
        console.log(`[SERVER] Host binding: ${HOST}`);
        console.log(`[SERVER] Environment: ${NODE_ENV}`);
        console.log('[SERVER] Ready to accept requests');
    });
})();