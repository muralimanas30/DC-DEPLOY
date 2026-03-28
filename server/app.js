const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const crypto = require('crypto');
const { errorHandler } = require('./errorHandler/errorHandler');
const routes = require('./routes');
const { CORS_ORIGIN, NODE_ENV } = require('./config');

const app = express();

// --- DB connection (REST + socket handlers depend on Mongo) ---
const connectDB = require("./db/connect");

console.log('[APP] Initializing server...');

const ready = (async () => {
    await connectDB();
})();


const allowedOrigins = String(CORS_ORIGIN)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS_NOT_ALLOWED'));
    },
    credentials: true,
}));
app.use(express.json());

app.use((req, res, next) => {
    const traceId = req.headers["x-trace-id"] || crypto.randomUUID();
    req.traceId = traceId;
    res.locals.traceId = traceId;
    res.setHeader("x-trace-id", traceId);
    next();
});

if (NODE_ENV === 'production') {
    app.use(morgan('combined'));
} else {
    morgan.token('body', (req) => JSON.stringify(req.body));
    app.use(morgan(':method :url :status - body: :body'));
}



app.use('/api', routes.router);


app.use(errorHandler);



module.exports = { app, ready };