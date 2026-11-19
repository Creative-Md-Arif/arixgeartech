export const getSession = () => {
  try {
    return JSON.parse(localStorage.getItem("arixgear_session") || "null");
  } catch (e) {
    return null;
  }
};
export const setSession = (s) => {
  try {
    s
      ? localStorage.setItem("arixgear_session", JSON.stringify(s))
      : localStorage.removeItem("arixgear_session");
  } catch (e) {}
};
export const getOrders = () => {
  try {
    return JSON.parse(localStorage.getItem("arixgear_orders") || "[]");
  } catch (e) {
    return [];
  }
};
export const pushOrder = (order) => {
  try {
    const arr = JSON.parse(localStorage.getItem("arixgear_orders") || "[]");
    arr.unshift(order);
    localStorage.setItem("arixgear_orders", JSON.stringify(arr.slice(0, 25)));
  } catch (e) {}
};
