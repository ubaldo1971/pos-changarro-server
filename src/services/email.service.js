/**
 * Email Service
 * Handles all email communications using Nodemailer
 */

const nodemailer = require('nodemailer');

// Email templates
const TEMPLATES = {
    WELCOME: 'welcome',
    PAYMENT_SUCCESS: 'payment_success',
    PLAN_UPGRADED: 'plan_upgraded',
    PLAN_EXPIRED: 'plan_expired',
    PASSWORD_RESET: 'password_reset'
};

// Create transporter based on environment
const createTransporter = () => {
    // For development, use ethereal email (fake SMTP)
    if (process.env.NODE_ENV !== 'production') {
        return nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.ethereal.email',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER || 'test@ethereal.email',
                pass: process.env.SMTP_PASS || 'testpassword'
            }
        });
    }

    // For production, use real SMTP (Gmail, SendGrid, etc.)
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

let transporter = null;

const getTransporter = () => {
    if (!transporter) {
        transporter = createTransporter();
    }
    return transporter;
};

/**
 * Send welcome email after registration
 */
const sendWelcomeEmail = async (email, name, businessName) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .content h2 { color: #1e293b; margin-top: 0; }
            .content p { color: #64748b; line-height: 1.6; }
            .btn { display: inline-block; background: #3b82f6; color: white !important; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }
            .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 14px; }
            .plan-badge { display: inline-block; background: #f0fdf4; color: #16a34a; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 600; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🏪 POS Changarro</h1>
            </div>
            <div class="content">
                <h2>¡Bienvenido, ${name}!</h2>
                <p>Tu tienda <strong>${businessName}</strong> ha sido creada exitosamente.</p>
                <p>Ya puedes empezar a usar tu punto de venta con el plan <span class="plan-badge">Gratis</span></p>
                <p>Con el plan gratuito tienes:</p>
                <ul style="color: #64748b;">
                    <li>📦 Hasta 20 productos</li>
                    <li>👤 1 usuario</li>
                    <li>💵 Ventas ilimitadas</li>
                    <li>📊 Reportes básicos</li>
                </ul>
                <p>¿Necesitas más? Actualiza a un plan superior para desbloquear más funciones.</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Ir a Mi Tienda</a>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} POS Changarro. Todos los derechos reservados.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const info = await getTransporter().sendMail({
            from: `"POS Changarro" <${process.env.SMTP_FROM || 'noreply@poschangarro.com'}>`,
            to: email,
            subject: '🎉 ¡Bienvenido a POS Changarro!',
            html
        });

        console.log('Welcome email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending welcome email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send payment success email
 */
const sendPaymentSuccessEmail = async (email, name, planName, planPrice, businessName) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .content h2 { color: #1e293b; margin-top: 0; }
            .content p { color: #64748b; line-height: 1.6; }
            .success-icon { font-size: 48px; margin-bottom: 10px; }
            .receipt { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .receipt-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
            .receipt-row:last-child { border-bottom: none; font-weight: 600; color: #1e293b; }
            .btn { display: inline-block; background: #10b981; color: white !important; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="success-icon">✅</div>
                <h1>¡Pago Confirmado!</h1>
            </div>
            <div class="content">
                <h2>Hola ${name},</h2>
                <p>Tu pago ha sido procesado exitosamente. Tu cuenta de <strong>${businessName}</strong> ha sido actualizada.</p>
                
                <div class="receipt">
                    <h3 style="margin-top: 0; color: #1e293b;">Recibo de Pago</h3>
                    <div class="receipt-row">
                        <span>Plan</span>
                        <span>${planName}</span>
                    </div>
                    <div class="receipt-row">
                        <span>Precio</span>
                        <span>$${planPrice} MXN/mes</span>
                    </div>
                    <div class="receipt-row">
                        <span>Fecha</span>
                        <span>${new Date().toLocaleDateString('es-MX')}</span>
                    </div>
                    <div class="receipt-row">
                        <span><strong>Total</strong></span>
                        <span><strong>$${planPrice} MXN</strong></span>
                    </div>
                </div>
                
                <p>Ya puedes disfrutar de todas las funciones de tu nuevo plan. 🚀</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Ir a Mi Tienda</a>
            </div>
            <div class="footer">
                <p>Si tienes alguna pregunta, responde a este correo.</p>
                <p>© ${new Date().getFullYear()} POS Changarro</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const info = await getTransporter().sendMail({
            from: `"POS Changarro" <${process.env.SMTP_FROM || 'noreply@poschangarro.com'}>`,
            to: email,
            subject: '✅ Pago confirmado - Tu plan ha sido activado',
            html
        });

        console.log('Payment success email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending payment email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send plan upgrade confirmation email
 */
const sendPlanUpgradedEmail = async (email, name, newPlan, features) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .feature-list { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .feature-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; color: #1e293b; }
            .btn { display: inline-block; background: #8b5cf6; color: white !important; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; }
            .footer { background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚀 ¡Plan Actualizado!</h1>
            </div>
            <div class="content">
                <h2>¡Felicidades ${name}!</h2>
                <p>Tu cuenta ha sido actualizada al plan <strong>${newPlan}</strong>.</p>
                
                <div class="feature-list">
                    <h3 style="margin-top: 0;">Ahora tienes acceso a:</h3>
                    ${features.map(f => `<div class="feature-item">✅ ${f}</div>`).join('')}
                </div>
                
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" class="btn">Explorar Funciones</a>
            </div>
            <div class="footer">
                <p>© ${new Date().getFullYear()} POS Changarro</p>
            </div>
        </div>
    </body>
    </html>
    `;

    try {
        const info = await getTransporter().sendMail({
            from: `"POS Changarro" <${process.env.SMTP_FROM || 'noreply@poschangarro.com'}>`,
            to: email,
            subject: '🚀 Tu plan ha sido actualizado',
            html
        });

        console.log('Plan upgraded email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending upgrade email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    TEMPLATES,
    sendWelcomeEmail,
    sendPaymentSuccessEmail,
    sendPlanUpgradedEmail,
    getTransporter
};
