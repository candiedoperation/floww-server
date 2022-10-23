const CollabViewMiddleware = (httpServer) => {
    // Init. Socket.IO Server
    const io = require('socket.io')(httpServer, {
        cors: {
            origin: '*',
        }
    });

    io.on('connection', (socket) => {
        console.log(`Client Connected: ${socket.id}`);
        socket.on('cbv-nibPosition', (e) => {
            socket.broadcast.emit('cbv-nibPosition', e);
        })
    })
}

module.exports = CollabViewMiddleware;