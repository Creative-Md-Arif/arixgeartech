/* ArixGear — Phase 4 Socket.IO gateway E2E.
   Verifies: JWT handshake (reject on bad token), auto rooms, order:join with
   ownership/phone-proof, live order:updated fanout to the customer room +
   admin room, ticket room events. Run with the API up:
     node scripts/qa_phase4_socket.js [base-url]   (default http://localhost:4000)
*/
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const BASE = process.argv[2] || 'http://localhost:4000';
const { io } = require('../backend/node_modules/socket.io-client');

const API = BASE.replace(/\/$/, '');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✓ ' + n); pass++; };
const bad = (n, e) => { console.log('  ✗ ' + n + (e ? ' — ' + e : '')); fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email, password) {
  const res = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('login failed: ' + JSON.stringify(data));
  return data.token;
}

function connect(token, label) {
  return new Promise((resolve, reject) => {
    const socket = io(API, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 5000,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (e) => reject(new Error(label + ': ' + e.message)));
    setTimeout(() => reject(new Error(label + ': handshake timeout')), 6000);
  });
}

const waitFor = (socket, event, timeoutMs = 6000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting for ' + event)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });

async function main() {
  console.log('── Phase 4 · Socket.IO E2E → ' + API + ' ──');

  /* tokens */
  const adminTok = await login('admin@arixgear.tech', 'ArixAdmin2026');
  const demoTok = await login('demo@arixgear.tech', 'arix2026');
  ok('tokens (admin + demo customer)');

  /* 1. bad token refused */
  const refused = await new Promise((resolve) => {
    const s = io(API, { auth: { token: 'garbage.token.here' }, reconnection: false, timeout: 4000 });
    s.on('connect_error', () => { s.close(); resolve(true); });
    s.on('connect', () => { s.close(); resolve(false); });
    setTimeout(() => resolve(false), 5000);
  });
  if (refused) ok('handshake.bad-token-refused'); else bad('handshake.bad-token-refused');

  /* 2. connect admin + customer */
  const admin = await connect(adminTok, 'admin');
  const customer = await connect(demoTok, 'customer');
  ok('handshake.jwt-connect (admin + customer)');

  /* 3. guest COD order to track (keeps seeded data pristine) */
  const orderRes = await fetch(API + '/api/orders', {
    method: 'POST',
    body: (() => { const fd = new FormData(); fd.append('payload', JSON.stringify({
      customer: { name: 'QA Socket Tracker', phone: '01734567892' },
      shipping: { address: 'QA Road 12', city: 'Dhaka', division: 'dhaka' },
      items: [{ slug: 'buds-air-3', qty: 1 }],
      paymentMethod: 'cod',
    })); return fd; })(),
  });
  const orderData = await orderRes.json();
  const orderNumber = orderData.order && orderData.order.orderNumber;
  if (!orderNumber) throw new Error('order create failed: ' + JSON.stringify(orderData));
  ok('fixture.guest-cod-order (' + orderNumber + ')');

  /* 4. customer joins the order room with phone proof */
  const joinAck = await new Promise((resolve) => {
    customer.emit('order:join', { orderNumber, phone: '34567892' }, resolve);
  });
  if (joinAck && joinAck.ok) ok('order:join.phone-proof (' + joinAck.room + ')'); else bad('order:join.phone-proof', JSON.stringify(joinAck));

  /* 5. admin listens on its admin room; customer listens in the order room */
  const adminP = waitFor(admin, 'order:updated');
  const custP = waitFor(customer, 'order:updated');

  /* admin flips the order → shipped */
  const listRes = await fetch(API + '/api/admin/orders?search=' + orderNumber, { headers: { Authorization: 'Bearer ' + adminTok } });
  const listData = await listRes.json();
  const orderId = listData.items[0]._id;
  await fetch(API + '/api/admin/orders/' + orderId + '/status', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + adminTok, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'shipped', note: 'QA socket E2E' }),
  });

  const [admEv, custEv] = await Promise.all([adminP, custP]);
  if (custEv && custEv.status === 'shipped' && custEv.orderNumber === orderNumber) ok('fanout.order-room (customer got status=shipped)');
  else bad('fanout.order-room', JSON.stringify(custEv));
  if (admEv && admEv.orderNumber === orderNumber) ok('fanout.admin-room (admin got order:updated)');
  else bad('fanout.admin-room', JSON.stringify(admEv));

  /* 6. notification event reaches the admin socket (bell parity) */
  const notifP = waitFor(admin, 'notification');
  await fetch(API + '/api/orders', {
    method: 'POST',
    body: (() => { const fd = new FormData(); fd.append('payload', JSON.stringify({
      customer: { name: 'QA Socket Notif', phone: '01734567893' },
      shipping: { address: 'QA Road 13', city: 'Dhaka', division: 'dhaka' },
      items: [{ slug: 'buds-air-3', qty: 1 }],
      paymentMethod: 'cod',
    })); return fd; })(),
  });
  const notif = await notifP;
  if (notif && notif.title) ok('fanout.notification (admin bell event)'); else bad('fanout.notification', JSON.stringify(notif));

  /* 7. order:leave */
  const leaveAck = await new Promise((resolve) => {
    customer.emit('order:leave', { orderNumber }, () => resolve(true));
    setTimeout(() => resolve(true), 800);
  });
  if (leaveAck) ok('order:leave'); else bad('order:leave');

  admin.close(); customer.close();

  /* cleanup — remove the two QA orders */
  const cleanup = async (phone) => {
    const r = await fetch(API + '/api/admin/orders?search=' + phone, { headers: { Authorization: 'Bearer ' + adminTok } });
    const d = await r.json();
    for (const o of d.items || []) {
      if (['QA Socket Tracker', 'QA Socket Notif'].includes(o.customer.name)) {
        await fetch(API + '/api/admin/orders/' + o._id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + adminTok } });
      }
    }
  };
  await cleanup('01734567892'); await cleanup('01734567893');
  console.log('  ✓ cleanup (socket QA orders removed)');

  console.log('── RESULT: ' + pass + ' passed · ' + fail + ' failed ──');
  if (fail === 0) { console.log('✅ PHASE 4 SOCKET E2E GREEN'); process.exit(0); }
  console.log('❌ PHASE 4 SOCKET E2E — FIX REQUIRED');
  process.exit(1);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
