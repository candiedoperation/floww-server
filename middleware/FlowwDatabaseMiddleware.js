const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const mongoURI = "mongodb://localhost:27017/floww";

const initializeMiddlewareAPI = (app) => {
    const saltMiddleware = require('./FlowwSaltMiddleware');
    const bcrypt = require("bcryptjs");
    const jwt = require("jsonwebtoken");
    const FlowwDbUser = require('./../models/FlowwDbUser');

    const SecondsOf = (duration) => {
        switch (duration.charAt(duration.length - 1)) {
            case 'd':
                return (+duration.slice(0, -1)) * 86400;
            default:
                return undefined;
        }
    }

    app.get('/api/status', (req, res) => {
        res.status(200).send("<h1>Floww API Middleware loaded.</h1>")
    });

    app.post('/api/signup', [
        check("email", false).isEmail(),
        check("password", false).isLength({ min: 8 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            })
        }

        try {
            let newUser = await FlowwDbUser.findOne({ email: req.body.email });
            if (newUser) {
                return res.status(400).json({ userEmailExists: true });
            }

            const salt = await bcrypt.genSalt(saltMiddleware.saltRounds);
            const hash = await bcrypt.hash(req.body.password, salt);

            newUser = new FlowwDbUser({
                fullName: req.body.fullName,
                email: req.body.email,
                password: hash
            });
            
            newUser.save();

            const jwtPayload = {
                user: {
                    id: newUser.id,
                    email: newUser.email,
                    name: newUser.fullName
                }
            }

            jwt.sign(
                jwtPayload,
                saltMiddleware.saltKey,
                { expiresIn: '7d' },
                (err, jwtToken) => {
                    if (err) throw (err)
                    res
                     .status(200)
                     .cookie("jwtToken", jwtToken, { httpOnly: true, maxAge: SecondsOf('7d').toString() })
                     .redirect('/dashboard')
                }
            )
        } catch (err) {
            console.log(err);
            res.status(500).json({
                error: err,
                message: 'FLW_USER_CREATE: Internal Server Error'
            });
        }
    });
}

const FlowwDatabaseMiddleware = async (app) => {
    try {
        await mongoose.connect(mongoURI);
        console.log ("Connected to Mongo Database Server");
        initializeMiddlewareAPI(app);
    } catch (e) {
        console.log ("MongoDB Connection Failed. Exiting.");
        throw e;
    }
}

module.exports = FlowwDatabaseMiddleware;