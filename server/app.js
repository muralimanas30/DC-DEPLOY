const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');
const { errorHandler } = require('./errorHandler/errorHandler');
const routes = require('./routes');

const app = express();

// --- DB connection (REST + socket handlers depend on Mongo) ---
const connectDB = require("./db/connect");

const ready = (async () => {
    await connectDB();
})();


app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    const traceId = req.headers["x-trace-id"] || crypto.randomUUID();
    req.traceId = traceId;
    res.locals.traceId = traceId;
    res.setHeader("x-trace-id", traceId);
    next();
});

app.use(morgan(':method :url :status - body: :body'));
morgan.token('body', (req) => JSON.stringify(req.body));



app.use('/api', routes.router);


app.use(errorHandler);



module.exports = { app };