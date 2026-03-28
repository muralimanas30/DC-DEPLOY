const normalizePhone = (rawPhone) => {
    if (!rawPhone) return null;

    const value = String(rawPhone).trim();
    if (!value) return null;

    const digits = value.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
        return null;
    }

    return `+${digits}`;
};

module.exports = { normalizePhone };