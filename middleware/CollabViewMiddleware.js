const moment = require('moment');
const sUUID = require('short-unique-id');
const mediasoup = require("mediasoup");

const CollabViewMiddleware = (httpServer) => {
    // Init. Socket.IO Server
    const io = require('socket.io')(httpServer, {
        path: '/cbv-socket',
        cors: {
            origin: '*',
        }
    });

    const meetingID = new sUUID({
        length: 9,
        dictionary: 'alphanum_lower'
    });

    let vcWorker = undefined;
    const volatileRooms = {};
    const volatileWbStates = {};

    const initializeMediasoupWorker = (callback) => {
        callback(
            new Promise(async (resolve, reject) => {
                let mediasoupWorker = await mediasoup.createWorker({
                    rtcMinPort: 2000,
                    rtcMaxPort: 2020
                });

                if (mediasoupWorker) resolve(mediasoupWorker);
                else reject("Failed to create Mediasoup Worker...");
            })
        );
    }

    const initializeMediaRouter = (callback) => {
        const mediasoupRouterPromise = new Promise(async (resolve, reject) => {
            if (vcWorker == null) reject("Mediasoup Worker is Null.");
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
                await vcWorker.createRouter({ mediaCodecs })
            );
        });

        mediasoupRouterPromise
            .then(callback)
            .catch(() => {
                console.error("Router Creation Failed. Retrying in 5 seconds");
                setTimeout(() => {
                    initializeMediaRouter(callback);
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
    initializeMediasoupWorker((mediasoupWorkerPromise) => {
        mediasoupWorkerPromise
            .then((worker) => {
                // Log Worker Information
                vcWorker = worker;
                console.log(`VC_WORKER_CREATE: PROCESS_ID ${worker.pid}`);

                // Worker Event 'Error'
                worker.on('died', error => {
                    console.error("Mediasoup Worker Died. Attempting Restart in 5 seconds...");
                    setTimeout(() => {
                        initializeMediasoupWorker();
                    }, 5000);
                });
            })

            .catch(() => {
                console.error("Failed to create Mediasoup Worker, Attempting creation in 5 seconds...");
                setTimeout(() => {
                    initializeMediasoupWorker();
                }, 5000);
            })
    });

    io.on('connection', (socket) => {
        // Per user room status (used to update exits)
        let joinedRoom = null;

        const initializeNewFlowwRoom = (roomName, callback) => {
            volatileRooms[roomName] = {};
            volatileWbStates[roomName] = {};
            volatileRooms[roomName].activeUsers = {};
            volatileRooms[roomName].presenters = {};
            // volatileRooms[roomName].presenters[socket.id] -> Here

            initializeMediaRouter((router) => {
                console.log(`VC_ROUTER_ASSIGN: RoomID ${roomName} -> RouterID ${router.id}`);
                volatileRooms[roomName].vcRouter = router;
                callback("Init. Complete");
            });
        }

        const initializeActiveUsersListeners = () => {
            socket.on("cbv-createRoom", (callback) => {
                const createRoomName = () => {
                    let roomName = meetingID();
                    if (volatileRooms[roomName] == undefined) {
                        initializeNewFlowwRoom(roomName, () => {
                            callback(roomName);
                        });
                    } else {
                        createRoomName ();
                    }
                }

                createRoomName ();
            });

            socket.on('cbv-roomExists', (roomName, callback) => {
                if (volatileRooms[roomName] == undefined)
                    callback(false);
                else
                    callback(true);
            })

            socket.on('cbv-joinRoom', (e) => {
                if (volatileRooms[e.roomName] == undefined) {
                    return false;
                }

                socket.join(e.roomName);
                joinedRoom = e.roomName;
    
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

            socket.on('disconnect', (e) => {
                try {
                    delete volatileRooms[joinedRoom].activeUsers[socket.id]
                    io.in(joinedRoom).emit('cbv-delActiveUser', {
                        uId: socket.id
                    });
                } catch {
                    console.log(`CBV_PREJOIN_DISC: SOCKET_ID ${socket.id}`);
                }
            });
        }

        const initializeConferenceListeners = () => {
            socket.on("cbv-vcRouterRtpCapabilities", (e) => {
                e.callback(volatileRooms[e.roomName].vcRouter.rtpCapabilities);
            });
    
            socket.on("cbv-vcProduceMedia", (e) => {
    
            });
        }        

        const initializeDrawingBoardListeners = () => {
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
        }

        const initializeCommentsListeners = () => {
            socket.on('cbv-comment', (e) => {
                e.time = moment().toISOString();
                socket.to(e.roomName).emit('cbv-comment', e);
            })
        }

        initializeActiveUsersListeners();
        initializeConferenceListeners();
        initializeDrawingBoardListeners();
        initializeCommentsListeners();
    })
}

module.exports = CollabViewMiddleware;