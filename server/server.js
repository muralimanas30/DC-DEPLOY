require("dotenv").config();
const http = require("http");
const { app, ready } = require("./app");
const { initSocket } = require("./socket");
const { PORT, NODE_ENV, HOST } = require("./config");
const { logger } = require("./utils/logger");

const server = http.createServer(app);
initSocket(server);

(async () => {
    await ready;
    
    server.listen(PORT, HOST, () => {
        logger.success('server', `Server started on port ${logger.highlight(PORT)}`);
        logger.server(`Host binding: ${logger.highlight(HOST)}`);
        logger.server(`Environment: ${logger.highlight(NODE_ENV)}`);
        logger.server('Ready to accept requests');
    });
})();