/**
 * Script para crear 3 tiendas de prueba con diferentes planes e inventario
 * Plan: free, basic, pro
 * Ejecutar desde: server/
 */

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = path.join(__dirname, 'database.sqlite');

const db = new Database(DB_PATH);
console.log('✅ Conectado a la base de datos:', DB_PATH);

async function createTestStores() {
    console.log('\n🏪 Creando tiendas de prueba...\n');

    // Datos de las 3 tiendas
    const stores = [
        {
            name: 'La Tiendita de Don Pepe',
            slug: 'tiendita-don-pepe',
            plan: 'free',
            address: 'Calle Principal #123, Col. Centro',
            phone: '555-111-2222',
            owner: {
                name: 'José Pérez García',
                email: 'pepe@tiendita.mx',
                password: 'tienda123',
                role: 'owner',
                pin: '1234'
            },
            categories: [
                { name: 'Abarrotes', color: '#FF6B35', icon: '🛒' },
                { name: 'Bebidas', color: '#00B4D8', icon: '🥤' },
                { name: 'Dulces', color: '#F72585', icon: '🍬' }
            ],
            products: [
                { name: 'Coca-Cola 600ml', price: 22, cost: 15, stock: 48, barcode: '7501055300495', category: 'Bebidas' },
                { name: 'Sabritas Original 45g', price: 18, cost: 12, stock: 36, barcode: '7501011116023', category: 'Abarrotes' },
                { name: 'Gansito Marinela', price: 16, cost: 10, stock: 24, barcode: '7501000114986', category: 'Dulces' },
                { name: 'Agua Ciel 1L', price: 15, cost: 8, stock: 60, barcode: '7501055300112', category: 'Bebidas' },
                { name: 'Maruchan Res', price: 12, cost: 7, stock: 50, barcode: '4901990513437', category: 'Abarrotes' },
                { name: 'Mazapán De La Rosa', price: 8, cost: 4, stock: 100, barcode: '7501511100010', category: 'Dulces' },
                { name: 'Doritos Nacho 62g', price: 20, cost: 13, stock: 30, barcode: '7501011115996', category: 'Abarrotes' },
                { name: 'Sprite 600ml', price: 22, cost: 15, stock: 36, barcode: '7501055306732', category: 'Bebidas' }
            ]
        },
        {
            name: 'Abarrotes El Ahorro',
            slug: 'abarrotes-el-ahorro',
            plan: 'basic',
            address: 'Av. Reforma #456, Col. Moderna',
            phone: '555-333-4444',
            owner: {
                name: 'María López Hernández',
                email: 'maria@elahorro.mx',
                password: 'ahorro456',
                role: 'owner',
                pin: '5678'
            },
            categories: [
                { name: 'Lácteos', color: '#4ECDC4', icon: '🥛' },
                { name: 'Carnes Frías', color: '#FF6B6B', icon: '🥓' },
                { name: 'Panadería', color: '#F4A261', icon: '🍞' },
                { name: 'Limpieza', color: '#2A9D8F', icon: '🧹' },
                { name: 'Frutas y Verduras', color: '#90BE6D', icon: '🍎' }
            ],
            products: [
                { name: 'Leche Lala Entera 1L', price: 28, cost: 20, stock: 40, barcode: '7501055363186', category: 'Lácteos' },
                { name: 'Jamón de Pavo FUD 200g', price: 45, cost: 32, stock: 15, barcode: '7501011115071', category: 'Carnes Frías' },
                { name: 'Pan Bimbo Grande', price: 52, cost: 38, stock: 20, barcode: '7501030426325', category: 'Panadería' },
                { name: 'Queso Oaxaca 250g', price: 65, cost: 48, stock: 12, barcode: '7503002711040', category: 'Lácteos' },
                { name: 'Fabuloso Lavanda 1L', price: 35, cost: 24, stock: 25, barcode: '7501035910010', category: 'Limpieza' },
                { name: 'Manzana Roja kg', price: 45, cost: 28, stock: 30, type: 'weight', category: 'Frutas y Verduras' },
                { name: 'Papel Higiénico Pétalo 4pz', price: 42, cost: 30, stock: 35, barcode: '7501019006159', category: 'Limpieza' },
                { name: 'Mantequilla Lala 90g', price: 32, cost: 22, stock: 18, barcode: '7501055310890', category: 'Lácteos' },
                { name: 'Salchicha FUD kg', price: 85, cost: 60, stock: 10, type: 'weight', category: 'Carnes Frías' },
                { name: 'Plátano kg', price: 25, cost: 15, stock: 50, type: 'weight', category: 'Frutas y Verduras' },
                { name: 'Crema Alpura 200ml', price: 28, cost: 19, stock: 22, barcode: '7501050439374', category: 'Lácteos' },
                { name: 'Bolillo (pieza)', price: 3, cost: 1.5, stock: 100, category: 'Panadería' }
            ]
        },
        {
            name: 'Super Mercado Express 24H',
            slug: 'super-express-24h',
            plan: 'pro',
            address: 'Blvd. Las Torres #789, Plaza Central',
            phone: '555-777-8888',
            owner: {
                name: 'Carlos Rodríguez Martínez',
                email: 'carlos@superexpress.mx',
                password: 'express789',
                role: 'owner',
                pin: '9012'
            },
            users: [
                { name: 'Ana Gómez', email: 'ana@superexpress.mx', role: 'admin', pin: '1111' },
                { name: 'Luis Torres', email: 'luis@superexpress.mx', role: 'manager', pin: '2222' },
                { name: 'Sofia Ruiz', email: 'sofia@superexpress.mx', role: 'cashier', pin: '3333' }
            ],
            categories: [
                { name: 'Bebidas Frías', color: '#00B4D8', icon: '🧊' },
                { name: 'Snacks', color: '#FF9F1C', icon: '🍿' },
                { name: 'Cigarros', color: '#6C757D', icon: '🚬' },
                { name: 'Cerveza', color: '#FFD700', icon: '🍺' },
                { name: 'Vinos y Licores', color: '#722F37', icon: '🍷' },
                { name: 'Higiene Personal', color: '#E9C46A', icon: '🧴' },
                { name: 'Farmacia', color: '#2EC4B6', icon: '💊' },
                { name: 'Electrónicos', color: '#7B2CBF', icon: '🔌' }
            ],
            products: [
                { name: 'Red Bull 250ml', price: 38, cost: 26, stock: 72, barcode: '9002490206078', category: 'Bebidas Frías' },
                { name: 'Monster Energy 473ml', price: 42, cost: 30, stock: 48, barcode: '0070847001003', category: 'Bebidas Frías' },
                { name: 'Cacahuates Japonés 200g', price: 32, cost: 20, stock: 45, barcode: '7501043700124', category: 'Snacks' },
                { name: 'Marlboro Rojo 20pz', price: 82, cost: 65, stock: 50, barcode: '7501011132782', category: 'Cigarros' },
                { name: 'Camel Azul 20pz', price: 78, cost: 62, stock: 40, barcode: '7501011132775', category: 'Cigarros' },
                { name: 'Corona Extra 355ml', price: 28, cost: 18, stock: 120, barcode: '7501064191091', category: 'Cerveza' },
                { name: 'Heineken 355ml', price: 32, cost: 22, stock: 96, barcode: '8711327356016', category: 'Cerveza' },
                { name: 'Vino Tinto Concha y Toro', price: 189, cost: 130, stock: 24, barcode: '7804320087009', category: 'Vinos y Licores' },
                { name: 'Tequila José Cuervo 750ml', price: 285, cost: 200, stock: 18, barcode: '7501035042131', category: 'Vinos y Licores' },
                { name: 'Shampoo Head&Shoulders 375ml', price: 95, cost: 68, stock: 30, barcode: '7501001169770', category: 'Higiene Personal' },
                { name: 'Desodorante Old Spice', price: 72, cost: 50, stock: 25, barcode: '7506195135303', category: 'Higiene Personal' },
                { name: 'Aspirina 100 tabs', price: 89, cost: 62, stock: 35, barcode: '7501050616133', category: 'Farmacia' },
                { name: 'Nexteel Plus 20 tabs', price: 145, cost: 98, stock: 20, barcode: '7501349023345', category: 'Farmacia' },
                { name: 'Cable USB-C 1m', price: 89, cost: 35, stock: 40, barcode: '0810043375122', category: 'Electrónicos' },
                { name: 'Audífonos Bluetooth', price: 299, cost: 150, stock: 15, barcode: '0810043375139', category: 'Electrónicos' },
                { name: 'Michelada Mix 500ml', price: 35, cost: 22, stock: 60, barcode: '7501022030025', category: 'Cerveza' },
                { name: 'Papas Pringles Original', price: 48, cost: 32, stock: 36, barcode: '0038000845536', category: 'Snacks' },
                { name: 'Modelo Especial 355ml', price: 26, cost: 17, stock: 144, barcode: '7501064101045', category: 'Cerveza' },
                { name: 'Vodka Absolut 750ml', price: 320, cost: 240, stock: 12, barcode: '7312040017072', category: 'Vinos y Licores' },
                { name: 'Chicles Trident 18pz', price: 22, cost: 14, stock: 80, barcode: '7622210706119', category: 'Snacks' }
            ]
        }
    ];

    // Prepared statements
    const insertBusiness = db.prepare(`
        INSERT INTO businesses (name, slug, address, phone, plan, plan_limits, currency, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?, 'MXN', 0.16)
    `);

    const insertUser = db.prepare(`
        INSERT INTO users (business_id, name, email, password, role, pin, active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
    `);

    const updateBusinessOwner = db.prepare('UPDATE businesses SET owner_id = ? WHERE id = ?');

    const insertCategory = db.prepare(`
        INSERT INTO categories (business_id, name, color, icon, active)
        VALUES (?, ?, ?, ?, 1)
    `);

    const insertProduct = db.prepare(`
        INSERT INTO products (business_id, name, price, cost, category_id, barcode, stock, min_stock, type, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 5, ?, 1)
    `);

    const insertSale = db.prepare(`
        INSERT INTO sales (business_id, user_id, total, payment_method, status)
        VALUES (?, ?, ?, ?, 'completed')
    `);

    for (const store of stores) {
        try {
            console.log(`\n📦 Creando: ${store.name} (Plan: ${store.plan.toUpperCase()})`);

            // 1. Crear el negocio
            const planLimits = {
                free: JSON.stringify({ products: 50, users: 2, reports: false }),
                basic: JSON.stringify({ products: 500, users: 5, reports: true }),
                pro: JSON.stringify({ products: -1, users: -1, reports: true })
            };

            const bizResult = insertBusiness.run(
                store.name, store.slug, store.address, store.phone,
                store.plan, planLimits[store.plan]
            );

            const businessId = bizResult.lastInsertRowid;
            console.log(`   ✅ Negocio creado (ID: ${businessId})`);

            // 2. Crear el usuario dueño
            const hashedPassword = await bcrypt.hash(store.owner.password, 10);
            const ownerResult = insertUser.run(
                businessId, store.owner.name, store.owner.email,
                hashedPassword, store.owner.role, store.owner.pin
            );

            const ownerId = ownerResult.lastInsertRowid;
            console.log(`   ✅ Dueño creado: ${store.owner.name} (${store.owner.email})`);

            // Actualizar owner_id
            updateBusinessOwner.run(ownerId, businessId);

            // 3. Crear usuarios adicionales (solo para tienda Pro)
            if (store.users) {
                for (const user of store.users) {
                    const userPass = await bcrypt.hash('password123', 10);
                    insertUser.run(businessId, user.name, user.email, userPass, user.role, user.pin);
                    console.log(`   ✅ Usuario: ${user.name} (${user.role})`);
                }
            }

            // 4. Crear categorías
            const categoryMap = {};
            for (const cat of store.categories) {
                const catResult = insertCategory.run(businessId, cat.name, cat.color, cat.icon);
                categoryMap[cat.name] = catResult.lastInsertRowid;
            }
            console.log(`   ✅ Categorías: ${store.categories.length}`);

            // 5. Crear productos
            for (const prod of store.products) {
                const categoryId = categoryMap[prod.category] || null;
                insertProduct.run(
                    businessId, prod.name, prod.price, prod.cost,
                    categoryId, prod.barcode || null, prod.stock, prod.type || 'unit'
                );
            }
            console.log(`   ✅ Productos: ${store.products.length}`);

            // 6. Crear algunas ventas de ejemplo para el plan Pro
            if (store.plan === 'pro') {
                const sampleSales = [
                    { total: 245.00, method: 'cash' },
                    { total: 520.50, method: 'card' },
                    { total: 189.00, method: 'cash' },
                    { total: 1250.00, method: 'mercadopago' },
                    { total: 85.00, method: 'cash' }
                ];
                for (const sale of sampleSales) {
                    insertSale.run(businessId, ownerId, sale.total, sale.method);
                }
                console.log(`   ✅ Ventas de ejemplo: ${sampleSales.length}`);
            }

            console.log(`   🎉 ¡${store.name} creada exitosamente!`);

        } catch (err) {
            console.error(`   ❌ Error creando ${store.name}:`, err.message);
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE TIENDAS CREADAS:');
    console.log('='.repeat(60));
    console.log('\n🆓 PLAN FREE - La Tiendita de Don Pepe');
    console.log('   Email: pepe@tiendita.mx | PIN: 1234 | Pass: tienda123');
    console.log('\n⭐ PLAN BÁSICO - Abarrotes El Ahorro');
    console.log('   Email: maria@elahorro.mx | PIN: 5678 | Pass: ahorro456');
    console.log('\n🚀 PLAN PRO - Super Mercado Express 24H');
    console.log('   Email: carlos@superexpress.mx | PIN: 9012 | Pass: express789');
    console.log('   + 3 usuarios adicionales (Ana, Luis, Sofia)');
    console.log('\n' + '='.repeat(60));
}

// Ejecutar
createTestStores()
    .then(() => {
        console.log('\n✅ Script completado exitosamente!\n');
        db.close();
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Error fatal:', err);
        db.close();
        process.exit(1);
    });
