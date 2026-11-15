/* ArixGear core — session / orders persistence (same keys as the vanilla build) */
export const getSession = () => { try { return JSON.parse(localStorage.getItem('forged_session') || 'null'); } catch (e) { return null; } };
export const setSession = (s) => { try { s ? localStorage.setItem('forged_session', JSON.stringify(s)) : localStorage.removeItem('forged_session'); } catch (e) {} };
export const getOrders = () => { try { return JSON.parse(localStorage.getItem('forged_orders') || '[]'); } catch (e) { return []; } };
export const pushOrder = (order) => {
  try {
    const arr = JSON.parse(localStorage.getItem('forged_orders') || '[]');
    arr.unshift(order); localStorage.setItem('forged_orders', JSON.stringify(arr.slice(0, 25)));
  } catch (e) {}
};
