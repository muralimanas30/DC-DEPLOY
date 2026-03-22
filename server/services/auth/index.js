const { login } = require('./login')
const { register } = require('./register')
const { oauthLogin } = require('./otherauth');
const { checkUser } = require('./checkUser');

module.exports = { login, register, oauthLogin,checkUser }