const { updateUser, clearDatabase } = require("../services/user/index");

const userController = { updateUser, clearDatabase };
module.exports = { userController };