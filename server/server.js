require("dotenv").config();
const { app: server } = require('./app')

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`[SERVER] Listening on port ${PORT}`);
});