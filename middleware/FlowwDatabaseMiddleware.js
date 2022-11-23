const { check, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const FlowwDbOrganization = require('../models/FlowwDbOrganization');
const mongoURI = "mongodb://localhost:27017/floww";

const initializeMiddlewareAPI = (app) => {
    const saltMiddleware = require('./FlowwSaltMiddleware');
    const bcrypt = require("bcryptjs");
    const jwt = require("jsonwebtoken");
    const FlowwDbUser = require('./../models/FlowwDbUser');

    const msecOf = (duration) => {
        switch (duration.charAt(duration.length - 1)) {
            case 'd':
                return (+duration.slice(0, -1)) * 86400000;
            default:
                return undefined;
        }
    }

    const parseJwtToken = (token) => {
        try {
            const decodedToken = jwt.verify(token, saltMiddleware.saltKey)
            return (decodedToken)
        } catch (err) {
            throw err;
        }
    }

    app.get('/api/status', (req, res) => {
        res.status(200).send("<h1>Floww API Middleware loaded.</h1>")
    });

    app.post('/api/verifyauth', (req, res) => {
        const jwtToken = req.cookies.jwtToken;
        if (!jwtToken)
            return res.status(401).json({ message: 'Unauthenticated', status: false });

        try {
            let decodedToken = parseJwtToken(jwtToken);
            res.status(200).json({ ...decodedToken.public, status: true });
            // { ...decodedToken } -> Changes may mandate for security
        } catch (err) {
            res.status(401).json({
                message: 'Authentication Token is Invalid'
            });
        }
    });

    app.post('/api/logout', (req, res) => {
        res
         .status(200)
         .cookie("jwtToken", "", { httpOnly: true, maxAge: 0, secure: true, sameSite: 'none' })
         .json({ status: true })
    })

    app.post('/api/login', [
        check("email", "Email is Invalid").isEmail(),
        check("password", "Password is Invalid").isLength({ min: 8 })
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            })
        }

        try {
            const loginUser = await FlowwDbUser.findOne({ email: req.body.email })
            if (!loginUser)
                return res.status(401).json({ message: "Couldn't find your Floww Account.", status: false });

            const passwordMatches = await bcrypt.compare(req.body.password, loginUser.password);
            if (!passwordMatches)
                return res.status(401).json({ message: "Wrong Password. <b>Forgot Password</b> helps you reset it.", status: false });

            const jwtPayload = {
                public: {
                    id: loginUser.id,
                    email: loginUser.email,
                    name: loginUser.fullName
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
                        .cookie("jwtToken", jwtToken, { httpOnly: true, maxAge: msecOf('7d').toString(), secure: true, sameSite: 'none' })
                        .json({ status: true })
                }
            )
        } catch (err) {
            console.log(err);
            res.status(500).json({
                error: err,
                message: 'FLW_USER_LOGIN: Internal Server Error'
            });
        }
    });

    app.post('/api/signup', [
        check("email", "Email is Invalid").isEmail(),
        check("password", "Password shorter than 8 characters").isLength({ min: 8 })
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

            // Update database with created user...
            newUser.save((err, user) => {
                if (err) throw (err)
                const jwtPayload = {
                    public: {
                        id: user._id,
                        email: user.email,
                        name: user.fullName
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
                            .cookie("jwtToken", jwtToken, { httpOnly: true, maxAge: msecOf('7d').toString(), secure: true, sameSite: 'none' })
                            .json({ status: true })
                    }
                )
            });
        } catch (err) {
            res.status(500).json({
                error: err,
                message: 'FLW_USER_CREATE: Internal Server Error'
            });
        }
    });

    app.post('/api/orgz/createorg', [
        check("email", "Email is Invalid").isEmail(),
        check("name", "Name is Invalid").notEmpty()
    ], async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            })
        }

        try {
            let newOrg = await FlowwDbOrganization.findOne({ name: req.body.name });
            if (newOrg) {
                return res.status(400).json({ message: "There's another organization with the same name." });
            }

            const jwtToken = req.cookies.jwtToken;
            const decodedToken = parseJwtToken(jwtToken);
            newOrg = new FlowwDbOrganization({
                name: req.body.name,
                contact: { email: [req.body.email], tel: [req.body.tel] },
                administrators: [ mongoose.Types.ObjectId(decodedToken.public.id) ]
            })

            //Save New Organization Document
            newOrg.save((err, org) => {
                if (err) throw (err);
                res.status('200').json({
                    status: true,
                    orgData: org
                })
            });
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_CREATE: Internal Server Error"
            })
        }
    })
}

const FlowwDatabaseMiddleware = async (app) => {
    try {
        await mongoose.connect(mongoURI);
        console.log("Connected to Mongo Database Server");
        initializeMiddlewareAPI(app);
    } catch (e) {
        console.log("MongoDB Connection Failed. Exiting.");
        throw e;
    }
}

module.exports = FlowwDatabaseMiddleware;