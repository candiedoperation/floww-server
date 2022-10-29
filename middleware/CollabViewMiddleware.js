const moment = require('moment');

const CollabViewMiddleware = (httpServer) => {
    // Init. Socket.IO Server
    const io = require('socket.io')(httpServer, {
        cors: {
            origin: '*',
        }
    });

    const volatileActiveUsers = {};
    const volatileWbStates = {};
    const volatilePollStatus = {};

    io.on('connection', (socket) => {
        let joinedRoom = null;

        socket.on('cbv-newActiveUser', (e) => {
            socket.join(e.roomName);
            joinedRoom = e.roomName;

            if (volatileWbStates[e.roomName] == undefined) 
                volatileWbStates[e.roomName] = {};

            if (volatileActiveUsers[e.roomName] == undefined)
                volatileActiveUsers[e.roomName] = [];

            io.to(socket.id).emit('cbv-cachedActiveUsersList', volatileActiveUsers[e.roomName]);
            volatileActiveUsers[e.roomName].push({
                uName: e.uName,
                uId: e.uId,
                roomName: e.roomName
            })

            //Send Required States to new user
            io.to(socket.id).emit('cbv-volatileStates', volatileWbStates[e.roomName]);

            //Notify users in room about new user
            socket.to(e.roomName).emit('cbv-newActiveUser', e);
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
            console.log(`${socket.id} disconnected\n`)

            volatileActiveUsers[joinedRoom]
                = volatileActiveUsers[joinedRoom]
                    .filter((activeUser) => (activeUser.uId != socket.id))

            io.in(joinedRoom).emit('cbv-delActiveUser', {
                uId: socket.id
            });
        });
    })
}

module.exports = CollabViewMiddleware;