const { MercadoPagoConfig, Preference } = require('mercadopago');

// Initialize Mercado Pago SDK with new API
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-ACCESS-TOKEN';
const client = new MercadoPagoConfig({
    accessToken: accessToken
});

exports.createPreference = async (req, res) => {
    try {
        const { items, payer } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items are required' });
        }

        // Create preference instance
        const preference = new Preference(client);

        // Create preference body
        const preferenceData = {
            items: items.map(item => ({
                title: item.title,
                unit_price: parseFloat(item.unit_price),
                quantity: parseInt(item.quantity),
                currency_id: 'MXN'
            })),
            payer: payer || {},
            backUrls: {
                success: process.env.FRONTEND_URL + '/ventas?payment=success',
                failure: process.env.FRONTEND_URL + '/ventas?payment=failure',
                pending: process.env.FRONTEND_URL + '/ventas?payment=pending'
            },
            autoReturn: 'approved',
            notification_url: process.env.BACKEND_URL + '/api/payment/webhook'
        };

        const response = await preference.create({ body: preferenceData });

        res.json({
            id: response.id,
            init_point: response.init_point,
            sandbox_init_point: response.sandbox_init_point
        });
    } catch (error) {
        console.error('Error creating preference:', error);
        res.status(500).json({ error: 'Failed to create payment preference' });
    }
};

exports.handleWebhook = async (req, res) => {
    try {
        const { type, data } = req.body;

        if (type === 'payment') {
            const paymentId = data.id;
            // Here you would typically:
            // 1. Get payment details from Mercado Pago API
            // 2. Update your database with payment status
            // 3. Send confirmation to customer
            console.log('Payment notification received:', paymentId);
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};
