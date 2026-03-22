const jwt = require("jsonwebtoken");
const { errorHandler, CustomError } = require("../errorHandler/errorHandler");


module.exports.authMiddleware = (req, res, next) => {
    const auth = req.headers.authorization;

    if (!auth || !auth.startsWith("Bearer ")) {
        return next(new CustomError("Unauthorized", 401));
    }

    try {
        const token = auth.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        req.userId = decoded?.id || decoded?._id || null;
        next();
    } catch {
        next(new CustomError("Invalid token", 401));
    }
};
