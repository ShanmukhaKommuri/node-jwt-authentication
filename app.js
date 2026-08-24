const express = require('express');
const cookieParser = require('cookie-parser');
const authController = require('./controllers/authController');
const userController = require('./controllers/userController');
const verifyAccess = require('./middleware/verifyAcces');
const { loginRateLimiter } = require("./middleware/loginRateLimiter")
const app = express();
app.use(express.json());
app.use(cookieParser());

app.post('/register', userController.register);
app.post('/login', loginRateLimiter, authController.login);
app.post('/refresh', authController.refresh);
app.post('/logout', verifyAccess, authController.logout);
app.get('/home', verifyAccess, (req, res) => res.json({ message: `Welcome ${req.user.username}` }));

app.listen(3000, () => console.log('Server running on port 3000'));
