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
            console.log(err);
            throw err;
        }
    }

    const isAuthorized = (req, res, next) => {
        try {
            res.decodedToken = parseJwtToken(req.cookies.jwtToken);
            next();
        } catch (err) {
            if (err.message === 'jwt must be provided')
                return res.status(401).json({ message: 'Unauthenticated', status: false });
            else if (err.message === "invalid token")
                return res.status(401).json({ message: 'Authentication Token is Invalid' });
            else
                res.status(500).json({
                    error: err,
                    message: 'FLW_VERIFY_AUTH: Internal Server Error'
                });
        }
    }

    const isOrgAdmin = async (req, res, next) => {
        try {
            let org = await FlowwDbOrganization.findById(req.body.orgId);
            if (!org) return res.status(404).json({ message: "Couldn't Find the Organization" })

            let orgAdmins = JSON.stringify(org.administrators);
            if (orgAdmins.indexOf(res.decodedToken.public.id) > -1) {
                res.org = org;
                res.orgAdmins = orgAdmins;
                next()
            } else {
                return res.status(401).json({ message: "You are not authorized to delete this organization" });
            }
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_ADMCHK: Internal Server Error"
            })
        }
    }

    app.get('/api/status', (req, res) => {
        res.status(200).send("<h1>Floww API Middleware loaded.</h1>")
    });

    app.post('/api/auth/verify', (req, res) => {
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

    app.post('/api/auth/logout', (req, res) => {
        res
            .status(200)
            .cookie("jwtToken", "", { httpOnly: true, maxAge: 0, secure: true, sameSite: 'none' })
            .json({ status: true })
    })

    app.post('/api/auth/login', [
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

    app.post('/api/auth/signup', [
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

    app.get('/api/user/notifications', isAuthorized, async (req, res) => {
        try {
            let loginUser = await FlowwDbUser.findById(res.decodedToken.public.id);
            if (!loginUser) res.status(404).json({ message: 'Authenticated User Unfound' });

            //Reply with JSON
            res.status(200).json(loginUser.notifications);
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_USR_NOTIFY: Internal Server Error"
            })
        }
    });

    app.get('/api/user/memberoforg', isAuthorized, async (req, res) => {
        try {
            let loginUser =
                await FlowwDbUser
                    .findById(res.decodedToken.public.id)
                    .populate({
                        path: 'memberOf.organizations',
                        select: 'contact _id name subOrganizations administrators invitedAdministrators',
                        populate: [{
                            path: 'administrators',
                            model: 'user',
                            select: '_id fullName email'
                        },
                        {
                            path: 'invitedAdministrators.invitee',
                            model: 'user',
                            select: '_id fullName email'
                        },
                        {
                            path: 'subOrganizations',
                            model: 'organization',
                            select: 'name'
                        }]
                    })

            if (loginUser) {
                return res.status(200).json(loginUser.memberOf.organizations)
            }
            else
                throw ("Failed to Fetch organizations the user is a memberOf");

        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_MBR_FETCH: Internal Server Error"
            })
        }
    });

    app.post('/api/orgz/updateemail', isAuthorized, isOrgAdmin, async (req, res) => {
        try {
            let org = res.org;
            req.body.newEmail = (req.body.newEmail) ? req.body.newEmail : "";
            req.body.oldEmail = (req.body.oldEmail) ? req.body.oldEmail : "";

            if (req.body.newEmail.trim() === "" || req.body.oldEmail.trim() === "")
                return res.status(400).json({ message: "Invalid Organization Email" })

            let oldEmailIndex = org.contact.email.indexOf(req.body.oldEmail);
            if (oldEmailIndex < 0) throw ("Email not found");

            org.contact.email[oldEmailIndex] = req.body.newEmail;
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Email Updated' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_EMLUPD: Internal Server Error"
            })
        }
    });

    app.post('/api/orgz/updatetel', isAuthorized, isOrgAdmin, async (req, res) => {
        /* UPDATE-EMAIL API COMPLETELY REUSED. ADDED SECTION FOR FUTURE DEVELOPMENT */
        try {
            let org = res.org;
            req.body.newTel = (req.body.newTel) ? req.body.newTel : "";
            req.body.oldTel = (req.body.oldTel) ? req.body.oldTel : "";

            if (req.body.newTel.trim() === "" || req.body.oldTel.trim() === "")
                return res.status(400).json({ message: "Invalid Organization Tel" })

            let oldTelIndex = org.contact.tel.indexOf(req.body.oldTel);
            if (oldTelIndex < 0) throw ("Tel not found");

            org.contact.tel[oldTelIndex] = req.body.newTel;
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Tel Updated' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_TELUPD: Internal Server Error"
            })
        }
    });    

    app.post('/api/orgz/inviteadmin', isAuthorized, isOrgAdmin, async (req, res) => {
        try {
            let org = res.org;
            req.body.adminEmail = (req.body.adminEmail) ? req.body.adminEmail : "";

            if (req.body.adminEmail.trim() === "")
                return res.status(400).json({ message: "Invalid Admin Email" })
            
            let newAdmin = await FlowwDbUser.findOne({ email: req.body.adminEmail });
            if (!newAdmin) return res.status(404).json({ message: "This Floww account does not exist" })
            if (org.administrators.indexOf(mongoose.Types.ObjectId(newAdmin._id)) > -1) return res.status(400).json({ message: "User is already an Admin" })

            let newAdminNotificationId = new mongoose.Types.ObjectId();
            newAdmin.notifications.push({
                _id: newAdminNotificationId,
                category: "inviteadmin",
                content: {
                    invitor: res.decodedToken.public,
                    orgData: { orgId: org._id, orgName: org.name }
                }
            });

            newAdmin.save((err, savedAdmin) => {
                if (err) throw (err);
                org.invitedAdministrators.push({
                    invitee: savedAdmin._id,
                    inviteId: newAdminNotificationId
                })

                org.save((err, newOrg) => {
                    if (err) throw (err);
                    res.status(200).json({ message: "Admin Invite Sent" })
                })
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_INVADM: Internal Server Error"
            })
        }
    });
    
    app.post('/api/orgz/inviteadminreject', isAuthorized, async (req, res) => {
        try {
            let org = await FlowwDbOrganization.findById(req.body.orgId);
            if (!org) return res.status(404).json({ message: "Couldn't Find the Organization" })

            let invitedAdminIndex = org.invitedAdministrators.map(key => key.inviteId.toString()).indexOf(req.body.inviteId);
            if (invitedAdminIndex < 0) return res.status(404).json({ message: "Organization misses the Invite." });
            let adminInvitee = org.invitedAdministrators[invitedAdminIndex].invitee;
            
            org.invitedAdministrators.splice(invitedAdminIndex, 1);
            org.save(async (err, newOrg) => {
                if (err) throw (err);
                let invitedUser = await FlowwDbUser.findById(adminInvitee);
                if (!invitedUser) return res.status(404).json({ message: "Authenticated User Unfound" });

                let notificationIndex = invitedUser.notifications.map(key => key._id.toString()).indexOf(req.body.inviteId);
                if (invitedAdminIndex < 0) return res.status(404).json({ message: "User Notification misses the Invite." });

                invitedUser.notifications.splice(notificationIndex, 1);
                invitedUser.save((err, savedUser) => {
                    if (err) throw (err);
                    res.status(200).json({ message: "Invite Rejected" });
                });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_RNVADM: Internal Server Error"
            })
        }
    })

    app.post('/api/orgz/inviteadminaccept', isAuthorized, async (req, res) => {
        try {
            let org = await FlowwDbOrganization.findById(req.body.orgId);
            if (!org) return res.status(404).json({ message: "Couldn't Find the Organization" })

            let invitedAdminIndex = org.invitedAdministrators.map(key => key.inviteId.toString()).indexOf(req.body.inviteId);
            if (invitedAdminIndex < 0) return res.status(404).json({ message: "Organization misses the Invite." });
            
            let adminInvitee = org.invitedAdministrators[invitedAdminIndex].invitee;
            org.administrators.push(adminInvitee);
            org.invitedAdministrators.splice(invitedAdminIndex, 1);

            org.save(async (err, newOrg) => {
                if (err) throw (err);
                let invitedUser = await FlowwDbUser.findById(adminInvitee);
                if (!invitedUser) return res.status(404).json({ message: "Authenticated User Unfound" });

                let notificationIndex = invitedUser.notifications.map(key => key._id.toString()).indexOf(req.body.inviteId);
                if (invitedAdminIndex < 0) return res.status(404).json({ message: "User Notification misses the Invite." });

                invitedUser.notifications.splice(notificationIndex, 1);
                invitedUser.memberOf.organizations.push(newOrg._id);
                invitedUser.save((err, savedUser) => {
                    if (err) throw (err);
                    res.status(200).json({ message: "Invite Accepted" });
                });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_ANVADM: Internal Server Error"
            })
        }
    })

    app.post('/api/orgz/addemail', isAuthorized, isOrgAdmin, async (req, res) => {
        try {
            let org = res.org;
            req.body.email = (req.body.email) ? req.body.email : "";

            if (req.body.email.trim() === "")
                return res.status(400).json({ message: "Invalid Organization Email" })

            org.contact.email.push(req.body.email);
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Email Added' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_EMLADD: Internal Server Error"
            })
        }
    });    

    app.post('/api/orgz/addtel', isAuthorized, isOrgAdmin, async (req, res) => {
        /* ADD-EMAIL API COMPLETELY REUSED. ADDED SECTION FOR FUTURE DEVELOPMENT */
        try {
            let org = res.org;
            req.body.tel = (req.body.tel) ? req.body.tel : "";

            if (req.body.tel.trim() === "")
                return res.status(400).json({ message: "Invalid Organization Tel" })

            org.contact.tel.push(req.body.tel);
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Tel Added' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_TELADD: Internal Server Error"
            })
        }
    });      

    app.post('/api/orgz/deleteemail', isAuthorized, isOrgAdmin, async (req, res) => {
        try {
            let org = res.org;
            req.body.email = (req.body.email) ? req.body.email : "";

            if (org.contact.email.length < 2)
                return res.status(400).json({ message: "Only Primary Email Exists" })

            if (req.body.email.trim() === "")
                return res.status(400).json({ message: "Invalid Organization Email" })

            let emailIndex = org.contact.email.indexOf(req.body.email);
            if (emailIndex < 0) throw ("Email not found");

            org.contact.email.splice(emailIndex, 1);
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Email Deleted' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_EMLDEL: Internal Server Error"
            })
        }
    });    

    app.post('/api/orgz/deletetel', isAuthorized, isOrgAdmin, async (req, res) => {
        /* DELETE-TEL API COMPLETELY REUSED. ADDED SECTION FOR FUTURE DEVELOPMENT */
        try {
            let org = res.org;
            req.body.tel = (req.body.tel) ? req.body.tel : "";

            if (org.contact.tel.length < 2)
                return res.status(400).json({ message: "Only Primary Tel Exists" })

            if (req.body.tel.trim() === "")
                return res.status(400).json({ message: "Invalid Organization Tel" })

            let telIndex = org.contact.tel.indexOf(req.body.tel);
            if (telIndex < 0) throw ("Tel not found");

            org.contact.tel.splice(telIndex, 1);
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Tel Deleted' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_TELDEL: Internal Server Error"
            })
        }
    });        

    app.post('/api/orgz/updatename', isAuthorized, isOrgAdmin, async (req, res) => {
        try {
            let org = res.org;
            req.body.name = (req.body.name) ? req.body.name : "";
            if (req.body.name.trim() === "") return res.status(400).json({ message: "Invalid Organization Name" })

            org.name = req.body.name;
            org.save((err, orgNew) => {
                if (err) throw (err);
                res.status(200).json({ message: 'Organization Name Updated' });
            })
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_NAMUPD: Internal Server Error"
            })
        }
    });

    app.post('/api/orgz/deleteorg', isAuthorized, isOrgAdmin, async (req, res) => {
        try {
            let org = res.org;
            await org.remove();
            return res.status(200).json({ status: true });
        } catch (err) {
            return res.status(500).send({
                error: err,
                message: "FLW_ORG_DELETE: Internal Server Error"
            })
        }
    })

    app.post('/api/orgz/createorg', isAuthorized, [
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

            newOrg = new FlowwDbOrganization({
                name: req.body.name,
                contact: { email: [req.body.email], tel: (req.body.tel) ? [req.body.tel] : [] },
                administrators: [mongoose.Types.ObjectId(res.decodedToken.public.id)]
            })

            //Save New Organization Document
            newOrg.save(async (err, org) => {
                if (err) throw (err);

                let loginUser = await FlowwDbUser.findById(res.decodedToken.public.id);
                loginUser.memberOf.organizations.push(
                    mongoose.Types.ObjectId(org._id)
                )

                loginUser.save((err, user) => {
                    if (err) throw (err);

                    res.status(200).json({
                        status: true,
                        orgData: org
                    })
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