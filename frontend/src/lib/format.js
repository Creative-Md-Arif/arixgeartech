export const money = (n) => {
  n = +n || 0;
  return '৳' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};

export const etaDate = (ts) => new Date(ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

export const PAY_LABELS = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', cod: 'Cash on Delivery', sslcommerz: 'SSLCOMMERZ' };
export const STATUS_LABELS = { verifying: 'Verifying', processing: 'Processing', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', 'payment-rejected': 'Payment rejected' };
export const DIV_LABELS = { dhaka: 'Dhaka', chattogram: 'Chattogram', khulna: 'Khulna', rajshahi: 'Rajshahi', barishal: 'Barishal', sylhet: 'Sylhet', rangpur: 'Rangpur', mymensingh: 'Mymensingh' };

/* Convert publicView order data to the storefront order shape. */
export function adaptOrder(o) {
  return {
    no: o.orderNumber, date: new Date(o.createdAt || Date.now()).getTime(),
    items: (o.items || []).map((i) => ({ id: i.slug, name: i.name, price: i.price, qty: i.qty, size: i.size, color: i.color, image: i.image })),
    total: o.totals ? o.totals.grandTotal : 0, shipTotal: o.totals ? o.totals.shipping : 0,
    division: (o.shipping && o.shipping.division) || '', city: (o.shipping && o.shipping.city) || '',
    pay: o.payment ? o.payment.method : 'cod', payLabel: PAY_LABELS[o.payment && o.payment.method] || 'Mobile payment',
    txnId: (o.payment && o.payment.trxId) || '', payStatus: (o.payment && o.payment.status) || '',
    status: o.status, statusLabel: STATUS_LABELS[o.status] || o.status,
    name: (o.customer && o.customer.name) || '', email: (o.customer && o.customer.email) || '',
    phone: (o.customer && o.customer.phone) || '', src: 'api', raw: o,
  };
}
