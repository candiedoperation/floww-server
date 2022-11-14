const moment = require('moment');
const mediasoup = require("mediasoup");

const CollabViewMiddleware = (httpServer) => {
    // Init. Socket.IO Server
    const io = require('socket.io')(httpServer, {
        cors: {
            origin: '*',
        }
    });

    let mediasoupWorker = null;
    const volatileRooms = {};
    const volatileWbStates = {};

    const initializeMediasoupWorker = () => {
        const mediasoupWorkerPromise = new Promise(async (resolve, reject) => {
            let mediasoupWorker = await mediasoup.createWorker({
                rtcMinPort: 2000,
                rtcMaxPort: 2020
            });

            if (mediasoupWorker) resolve(mediasoupWorker);
        });

        mediasoupWorkerPromise
            .then((worker) => {
                // Log Worker Information
                mediasoupWorker = worker;
                console.log(`Mediasoup Worker PID: ${worker.pid}`);

                // Worker Event 'Error'
                worker.on('died', error => {
                    console.error("Mediasoup Worker Died. Attempting Restart in 5 seconds...");
                    setTimeout(() => {
                        initializeMediasoupWorker();
                    }, 5000);
                });
            });
    }

    const initializeMediaRouter = (callback) => {
        const mediasoupRouterPromise = new Promise(async (resolve, reject) => {
            if (mediasoupWorker == null) reject("Mediasoup Worker is Null.");
            const mediaCodecs = [
                {
                    kind: "audio",
                    mimeType: "audio/opus",
                    clockRate: 48000,
                    channels: 2
                },
                {
                    kind: "video",
                    mimeType: "video/H264",
                    clockRate: 90000,
                    parameters:
                    {
                        "packetization-mode": 1,
                        "profile-level-id": "42e01f",
                        "level-asymmetry-allowed": 1
                    }
                }
            ];

            resolve(
                await mediasoupWorker.createRouter({ mediaCodecs })
            );
        });

        mediasoupRouterPromise
            .then(callback)
            .catch(() => {
                console.error("Router Creation Failed. Retrying in 5 seconds");
                setTimeout(() => {
                    initializeMediaRouter (callback);
                }, 5000);
            })
    }

    const initializeWebRTCTransport = (callback) => {
        const mediasoupWebRTCTransportPromise = new Promise(async (resolve, reject) => {
            const wRTC_transportLayerOptions = {

            }
        })
    }

    // Init. SFU Server Worker
    initializeMediasoupWorker();

    io.on('connection', (socket) => {
        let joinedRoom = null;

        socket.on('cbv-newActiveUser', (e) => {
            socket.join(e.roomName);
            joinedRoom = e.roomName;

            if (volatileRooms[e.roomName] == undefined)
                volatileRooms[e.roomName] = {};

            if (volatileRooms[e.roomName].vc_router == undefined) {
                initializeMediaRouter((router) => {
                    volatileRooms[e.roomName].vc_router = router;
                });
            }

            if (volatileWbStates[e.roomName] == undefined)
                volatileWbStates[e.roomName] = {};

            if (volatileRooms[e.roomName].activeUsers == undefined)
                volatileRooms[e.roomName].activeUsers = {};

            let parsedActiveUsers = [];
            Object.keys(volatileRooms[e.roomName].activeUsers).forEach((activeUser) => {
                parsedActiveUsers.push(volatileRooms[e.roomName].activeUsers[activeUser]);
            });

            io.to(socket.id).emit('cbv-cachedActiveUsersList', parsedActiveUsers);
            volatileRooms[e.roomName].activeUsers[e.uId] = {
                uName: e.uName,
                uId: e.uId,
                vcTransport: null
            }

            //Send Required States to new user
            io.to(socket.id).emit('cbv-volatileStates', volatileWbStates[e.roomName]);

            //Notify users in room about new user
            socket.to(e.roomName).emit('cbv-newActiveUser', e);
        });

        socket.on("cbv-vcRtpCapabilities", (e) => {
            io.to(socket.id).emit('cbv-vcRtpCapabilities', {
                rtpCapabilities: volatileRoomRouters[roomName].rtpCapabilities
            })
        });

        socket.on("cbv-vcCreateWebRTCTransport", (e) => {
            if (e.producer == true) {

            }
        });

        socket.on('cbv-createSelection', (e) => {
            socket.to(e.roomName).emit('cbv-createSelection', e);
        });

        socket.on('cbv-nibPosition', (e) => {
            socket.to(e.roomName).emit('cbv-nibPosition', e);
        });

        socket.on('cbv-nibPress', (e) => {
            volatileWbStates[e.roomName].wbOverlayDisableRef = true;
            socket.to(e.roomName).emit('cbv-nibPress', e);
        });

        socket.on('cbv-nibLift', (e) => {
            volatileWbStates[e.roomName].wbOverlayDisableRef = false;
            socket.to(e.roomName).emit('cbv-nibLift', e);
        });

        socket.on('cbv-comment', (e) => {
            e.time = moment().toISOString();
            socket.to(e.roomName).emit('cbv-comment', e);
        })

        socket.on('disconnect', (e) => {
            // Log disconnection
            console.log(`${socket.id} disconnected\n`)

            delete volatileRooms[joinedRoom].activeUsers[socket.id]
            io.in(joinedRoom).emit('cbv-delActiveUser', {
                uId: socket.id
            });
        });
    })
}

module.exports = CollabViewMiddleware;