const { login, register, oauthLogin, checkUser } = require('../services/auth/index.js')
const authController = { login, register, oauthLogin,checkUser };
module.exports = { authController };

