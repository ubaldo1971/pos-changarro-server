const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth.routes');
const syncRoutes = require('./routes/sync.routes');
const paymentRoutes = require('./routes/payment.routes');
const usersRoutes = require('./routes/users.routes');
const storesRoutes = require('./routes/stores.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const adminRoutes = require('./routes/admin.routes');
const cancellationsRoutes = require('./routes/cancellations.routes');
const salesRoutes = require('./routes/sales.routes');

// Initialize database
const db = require('./db/database');
db.init();

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? ['https://elchangarrito.com.mx', 'https://www.elchangarrito.com.mx']
            : ['http://localhost:3000', 'http://localhost:5173'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? ['https://elchangarrito.com.mx', 'https://www.elchangarrito.com.mx']
        : ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cancellations', cancellationsRoutes);
app.use('/api/sales', salesRoutes);

// Socket.IO connection handling
const connectedDevices = new Map();

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('register', (businessId) => {
        socket.join(`business_${businessId}`);

        if (!connectedDevices.has(businessId)) {
            connectedDevices.set(businessId, new Set());
        }
        connectedDevices.get(businessId).add(socket.id);

        const deviceCount = connectedDevices.get(businessId).size;
        io.to(`business_${businessId}`).emit('device:connected', {
            connectedDevices: deviceCount
        });
    });

    socket.on('broadcast', ({ businessId, event, data }) => {
        socket.to(`business_${businessId}`).emit(event, data);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);

        connectedDevices.forEach((devices, businessId) => {
            if (devices.has(socket.id)) {
                devices.delete(socket.id);
                const deviceCount = devices.size;
                io.to(`business_${businessId}`).emit('device:disconnected', {
                    connectedDevices: deviceCount
                });
            }
        });
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 WebSocket server ready`);
});

module.exports = { app, server, io };
