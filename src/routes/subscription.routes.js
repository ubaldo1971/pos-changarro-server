const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db = require('../db/database');
const { sendPaymentSuccessEmail, sendPlanUpgradedEmail } = require('../services/email.service');
const { PLAN_LIMITS } = require('../middleware/plan.middleware');

// Initialize Mercado Pago
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-ACCESS-TOKEN';
const client = new MercadoPagoConfig({ accessToken });

// Plan pricing
const PLAN_PRICES = {
    basic: {
        name: 'Básico',
        price: 49,
        features: [
            '300 productos',
            '5 usuarios',
            'Importar CSV',
            'Reportes completos',
            'Multi-dispositivo'
        ]
    },
    pro: {
        name: 'Pro',
        price: 99,
        features: [
            'Productos ilimitados',
            'Usuarios ilimitados',
            'Importar CSV',
            'Reportes avanzados',
            'Multi-dispositivo',
            'API Access',
            'Soporte prioritario'
        ]
    }
};

/**
 * POST /api/subscription/create-preference
 * Create a Mercado Pago preference for plan upgrade
 */
router.post('/create-preference', verifyToken, async (req, res) => {
    try {
        const { planKey } = req.body;
        const user = req.user;

        if (!planKey || !PLAN_PRICES[planKey]) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        const plan = PLAN_PRICES[planKey];

        // Create preference
        const preference = new Preference(client);

        const preferenceData = {
            items: [{
                title: `POS Changarro - Plan ${plan.name}`,
                description: `Suscripción mensual al plan ${plan.name}`,
                unit_price: plan.price,
                quantity: 1,
                currency_id: 'MXN'
            }],
            payer: {
                email: user.email,
                name: user.name
            },
            metadata: {
                user_id: user.id,
                business_id: user.business_id,
                plan_key: planKey,
                plan_name: plan.name
            },
            back_urls: {
                success: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?payment=success&plan=${planKey}`,
                failure: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?payment=failure`,
                pending: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?payment=pending`
            },
            auto_return: 'approved',
            notification_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/subscription/webhook`,
            statement_descriptor: 'POS CHANGARRO',
            external_reference: `upgrade_${user.business_id}_${planKey}_${Date.now()}`
        };

        const response = await preference.create({ body: preferenceData });

        // Store pending subscription
        await db.run(
            `INSERT INTO pending_subscriptions (business_id, user_id, plan_key, preference_id, external_reference, created_at)
             VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [user.business_id, user.id, planKey, response.id, preferenceData.external_reference]
        );

        res.json({
            id: response.id,
            init_point: response.init_point,
            sandbox_init_point: response.sandbox_init_point,
            plan: plan.name,
            price: plan.price
        });

    } catch (error) {
        console.error('Error creating subscription preference:', error);
        res.status(500).json({ error: 'Failed to create payment preference' });
    }
});

/**
 * POST /api/subscription/webhook
 * Handle Mercado Pago payment notifications
 */
router.post('/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;

        console.log('Webhook received:', type, data);

        if (type === 'payment') {
            const paymentId = data.id;

            // Get payment details
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: paymentId });

            console.log('Payment info:', paymentInfo.status, paymentInfo.external_reference);

            if (paymentInfo.status === 'approved') {
                // Extract subscription info from external_reference
                const externalRef = paymentInfo.external_reference;

                if (externalRef && externalRef.startsWith('upgrade_')) {
                    const parts = externalRef.split('_');
                    const businessId = parseInt(parts[1]);
                    const planKey = parts[2];

                    // Update business plan
                    const planLimits = PLAN_LIMITS[planKey] || PLAN_LIMITS.basic;

                    await db.run(
                        `UPDATE businesses SET plan = ?, plan_limits = ? WHERE id = ?`,
                        [planKey, JSON.stringify(planLimits), businessId]
                    );

                    // Get user info for email
                    const users = await db.query(
                        `SELECT u.*, b.name as business_name 
                         FROM users u 
                         JOIN businesses b ON u.business_id = b.id 
                         WHERE u.business_id = ? AND u.role = 'owner'`,
                        [businessId]
                    );

                    if (users.length > 0) {
                        const owner = users[0];
                        const planInfo = PLAN_PRICES[planKey];

                        // Send confirmation email
                        await sendPaymentSuccessEmail(
                            owner.email,
                            owner.name,
                            planInfo.name,
                            planInfo.price,
                            owner.business_name
                        );

                        // Send upgrade email with features
                        await sendPlanUpgradedEmail(
                            owner.email,
                            owner.name,
                            planInfo.name,
                            planInfo.features
                        );
                    }

                    // Update pending subscription status
                    await db.run(
                        `UPDATE pending_subscriptions SET status = 'completed', payment_id = ?, completed_at = datetime('now') 
                         WHERE external_reference = ?`,
                        [paymentId, externalRef]
                    );

                    console.log(`Plan upgraded for business ${businessId} to ${planKey}`);
                }
            }
        }

        res.status(200).send('OK');

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

/**
 * GET /api/subscription/status
 * Get current subscription status
 */
router.get('/status', verifyToken, async (req, res) => {
    try {
        const businessId = req.user.business_id;

        const businesses = await db.query(
            'SELECT plan, plan_limits FROM businesses WHERE id = ?',
            [businessId]
        );

        if (businesses.length === 0) {
            return res.status(404).json({ error: 'Business not found' });
        }

        const business = businesses[0];
        const planLimits = business.plan_limits ? JSON.parse(business.plan_limits) : PLAN_LIMITS.free;

        res.json({
            plan: business.plan || 'free',
            limits: planLimits,
            prices: PLAN_PRICES
        });

    } catch (error) {
        console.error('Error getting subscription status:', error);
        res.status(500).json({ error: 'Failed to get subscription status' });
    }
});

/**
 * POST /api/subscription/simulate-payment
 * For testing: Simulate a successful payment
 */
router.post('/simulate-payment', verifyToken, async (req, res) => {
    try {
        const { planKey } = req.body;
        const user = req.user;

        if (!planKey || !PLAN_PRICES[planKey]) {
            return res.status(400).json({ error: 'Invalid plan' });
        }

        // Update business plan
        const planLimits = PLAN_LIMITS[planKey];

        await db.run(
            `UPDATE businesses SET plan = ?, plan_limits = ? WHERE id = ?`,
            [planKey, JSON.stringify(planLimits), user.business_id]
        );

        // Get business info
        const businesses = await db.query(
            'SELECT name FROM businesses WHERE id = ?',
            [user.business_id]
        );

        const planInfo = PLAN_PRICES[planKey];

        // Send emails
        await sendPaymentSuccessEmail(
            user.email,
            user.name,
            planInfo.name,
            planInfo.price,
            businesses[0]?.name || 'Tu tienda'
        );

        await sendPlanUpgradedEmail(
            user.email,
            user.name,
            planInfo.name,
            planInfo.features
        );

        res.json({
            success: true,
            message: `Plan upgraded to ${planInfo.name}`,
            plan: planKey
        });

    } catch (error) {
        console.error('Error simulating payment:', error);
        res.status(500).json({ error: 'Simulation failed' });
    }
});

module.exports = router;
