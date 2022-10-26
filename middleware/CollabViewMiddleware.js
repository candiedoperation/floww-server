const CollabViewMiddleware = (httpServer) => {
    // Init. Socket.IO Server
    const io = require('socket.io')(httpServer, {
        cors: {
            origin: '*',
        }
    });

    const volatileActiveUsers = {};
    io.on('connection', (socket) => {
        let joinedRoom = null;

        socket.on('cbv-joinRoom', (e) => {
            socket.join(e.roomName);
            joinedRoom = e.roomName;

            volatileActiveUsers[e.roomName] = [];
            volatileActiveUsers[e.roomName].push({

            })
        })

        socket.on('cbv-newActiveUser', (e) => {
            socket.join(e.roomName);
            joinedRoom = e.roomName;

            if (volatileActiveUsers[e.roomName] == undefined)
                volatileActiveUsers[e.roomName] = [];

            io.to(socket.id).emit('cbv-cachedActiveUsersList', volatileActiveUsers[e.roomName]);
            volatileActiveUsers[e.roomName].push({
                uName: e.uName,
                uId: e.uId,
                roomName: e.roomName
            })

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
            socket.to(e.roomName).emit('cbv-nibPress', e);
        });

        socket.on('cbv-nibLift', (e) => {
            socket.to(e.roomName).emit('cbv-nibLift', e);
        });

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