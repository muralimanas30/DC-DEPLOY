const jwt = require("jsonwebtoken");

module.exports.signToken = (user) => {
    if (typeof user.toObject === 'function') {
        user = user.toObject();
    }
    return jwt.sign(
        user,
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
    );
};
