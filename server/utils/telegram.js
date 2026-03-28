const normalizeTelegramId = (rawValue) => {
    if (rawValue === undefined || rawValue === null) return null;

    const value = String(rawValue).trim();
    if (!value) return null;

    if (!/^-?\d{5,20}$/.test(value)) {
        return null;
    }

    return value;
};

const normalizeTelegramUsername = (rawValue) => {
    if (rawValue === undefined || rawValue === null) return null;

    let value = String(rawValue).trim();
    if (!value) return null;

    if (value.startsWith('@')) {
        value = value.slice(1);
    }

    if (!/^[a-zA-Z0-9_]{5,32}$/.test(value)) {
        return null;
    }

    return value.toLowerCase();
};

module.exports = {
    normalizeTelegramId,
    normalizeTelegramUsername,
};