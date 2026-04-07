const normalizePhone = (rawPhone) => {
    if (!rawPhone) return null;

    const value = String(rawPhone).trim();
    if (!value) return null;

    const digits = value.replace(/\D/g, '');
    let local = digits;

    if (local.length === 12 && local.startsWith('91')) {
        local = local.slice(2);
    } else if (local.length === 11 && local.startsWith('0')) {
        local = local.slice(1);
    }

    if (!/^[6-9]\d{9}$/.test(local)) {
        return null;
    }

    return local;
};

module.exports = { normalizePhone };