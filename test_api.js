const baseURL = 'http://localhost:3000/api';
const credentials = {
    username: 'admin',
    password: 'admin123'
};

async function test() {
    try {
        console.log('--- Logging in ---');
        const loginRes = await fetch(`${baseURL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });

        if (!loginRes.ok) {
            console.error('Login failed:', loginRes.status, await loginRes.text());
            return;
        }

        const { token } = await loginRes.json();
        console.log('Login successful. Token:', token ? 'OK' : 'MISSING');

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        console.log('\n--- Testing /api/products ---');
        const prodRes = await fetch(`${baseURL}/products`, { headers });
        if (prodRes.ok) {
            const products = await prodRes.json();
            console.log('Products fetched:', products.length);
        } else {
            console.error('Products error:', prodRes.status, await prodRes.text());
        }

        console.log('\n--- Testing /api/orders ---');
        const orderRes = await fetch(`${baseURL}/orders`, { headers });
        if (orderRes.ok) {
            const orders = await orderRes.json();
            console.log('Orders fetched:', orders.length);
        } else {
            console.error('Orders error:', orderRes.status, await orderRes.text());
        }

    } catch (e) {
        console.error('Unexpected error:', e.message);
    }
}

test();
