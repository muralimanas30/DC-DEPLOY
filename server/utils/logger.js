const chalk = require('chalk');

const categoryStyles = {
    app: chalk.bgWhite.black.bold(' APP '),
    server: chalk.bgYellow.black.bold(' SERVER '),
    db: chalk.bgGreen.black.bold(' DB '),
    socket: chalk.bgCyan.black.bold(' SOCKET '),
    webhook: chalk.bgMagenta.white.bold(' WEBHOOK '),
    location: chalk.bgBlue.white.bold(' LOCATION '),
    notify: chalk.bgRed.white.bold(' NOTIFY '),
    security: chalk.bgHex('#ff8c00').black.bold(' SECURITY '),
};

const levelStyles = {
    info: chalk.white,
    warn: chalk.yellow,
    error: chalk.redBright,
    success: chalk.greenBright,
};

const highlight = (value) => chalk.bold.whiteBright(String(value || ''));

const write = ({ level = 'info', category = 'server', message, meta }) => {
    const tag = categoryStyles[category] || categoryStyles.server;
    const paint = levelStyles[level] || levelStyles.info;

    const head = `${tag} ${paint(String(message || ''))}`;

    if (level === 'error') {
        if (meta !== undefined) {
            console.error(head, meta);
            return;
        }
        console.error(head);
        return;
    }

    if (level === 'warn') {
        if (meta !== undefined) {
            console.warn(head, meta);
            return;
        }
        console.warn(head);
        return;
    }

    if (meta !== undefined) {
        console.log(head, meta);
        return;
    }

    console.log(head);
};

const logger = {
    highlight,
    app: (message, meta) => write({ level: 'info', category: 'app', message, meta }),
    server: (message, meta) => write({ level: 'info', category: 'server', message, meta }),
    db: (message, meta) => write({ level: 'info', category: 'db', message, meta }),
    socket: (message, meta) => write({ level: 'info', category: 'socket', message, meta }),
    webhook: (message, meta) => write({ level: 'info', category: 'webhook', message, meta }),
    location: (message, meta) => write({ level: 'info', category: 'location', message, meta }),
    notify: (message, meta) => write({ level: 'info', category: 'notify', message, meta }),
    security: (message, meta) => write({ level: 'info', category: 'security', message, meta }),
    warn: (category, message, meta) => write({ level: 'warn', category, message, meta }),
    error: (category, message, meta) => write({ level: 'error', category, message, meta }),
    success: (category, message, meta) => write({ level: 'success', category, message, meta }),
};

module.exports = { logger };
