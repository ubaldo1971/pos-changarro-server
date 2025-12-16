const { Server } = require('socket.io');

let io;

// Store connected clients by business
const businessRooms = new Map();

function initializeSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    io.on('connection', (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Join business room when client identifies themselves
        socket.on('join:business', (businessId) => {
            if (!businessId) return;

            const roomName = `business:${businessId}`;
            socket.join(roomName);
            socket.businessId = businessId;

            // Track connected clients per business
            if (!businessRooms.has(businessId)) {
                businessRooms.set(businessId, new Set());
            }
            businessRooms.get(businessId).add(socket.id);

            console.log(`Socket ${socket.id} joined room ${roomName}`);

            // Notify other devices in the same business
            socket.to(roomName).emit('device:connected', {
                deviceId: socket.id,
                connectedDevices: businessRooms.get(businessId).size
            });
        });

        // Product events
        socket.on('product:created', (product) => {
            broadcastToBusiness(socket, 'product:created', product);
        });

        socket.on('product:updated', (product) => {
            broadcastToBusiness(socket, 'product:updated', product);
        });

        socket.on('product:deleted', (productId) => {
            broadcastToBusiness(socket, 'product:deleted', productId);
        });

        // Stock events
        socket.on('stock:updated', (data) => {
            broadcastToBusiness(socket, 'stock:updated', data);
        });

        // Sale events
        socket.on('sale:created', (sale) => {
            broadcastToBusiness(socket, 'sale:created', sale);
        });

        // Cash session events
        socket.on('cash:opened', (session) => {
            broadcastToBusiness(socket, 'cash:opened', session);
        });

        socket.on('cash:closed', (session) => {
            broadcastToBusiness(socket, 'cash:closed', session);
        });

        // Category events
        socket.on('category:created', (category) => {
            broadcastToBusiness(socket, 'category:created', category);
        });

        socket.on('category:updated', (category) => {
            broadcastToBusiness(socket, 'category:updated', category);
        });

        socket.on('category:deleted', (categoryId) => {
            broadcastToBusiness(socket, 'category:deleted', categoryId);
        });

        // Handle disconnection
        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);

            if (socket.businessId) {
                const businessId = socket.businessId;
                const roomName = `business:${businessId}`;

                if (businessRooms.has(businessId)) {
                    businessRooms.get(businessId).delete(socket.id);

                    if (businessRooms.get(businessId).size === 0) {
                        businessRooms.delete(businessId);
                    } else {
                        // Notify remaining devices
                        io.to(roomName).emit('device:disconnected', {
                            deviceId: socket.id,
                            connectedDevices: businessRooms.get(businessId).size
                        });
                    }
                }
            }
        });
    });

    return io;
}

// Broadcast to all devices in the same business except sender
function broadcastToBusiness(socket, event, data) {
    if (!socket.businessId) return;

    const roomName = `business:${socket.businessId}`;
    socket.to(roomName).emit(event, data);

    console.log(`Broadcast ${event} to ${roomName}:`, typeof data === 'object' ? data.id || data.name || 'object' : data);
}

// Get IO instance for use in other modules
function getIO() {
    return io;
}

// Get connected devices count for a business
function getConnectedDevices(businessId) {
    return businessRooms.has(businessId) ? businessRooms.get(businessId).size : 0;
}

module.exports = {
    initializeSocket,
    getIO,
    getConnectedDevices
};
