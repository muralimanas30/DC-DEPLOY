require("dotenv").config();
const http = require("http");
const { app } = require("./app");
const { initSocket } = require("./socket");
const { PORT, NODE_ENV } = require("./config");

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
    if (NODE_ENV !== "production") {
        console.log(`[SERVER] Listening on port ${PORT}`);
    }
});