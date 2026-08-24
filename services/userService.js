const bcrypt = require('bcrypt')
const jwtUtils = require('../utils/jwtUtils')
const { createUser} = require('../repostiories/userRepository');

exports.register = async (username, password) => {
    const hashpassword = await bcrypt.hash(password, 10);
    await createUser(username, hashpassword);
}
