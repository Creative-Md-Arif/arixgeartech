/* ArixGear services — contact messages + newsletter signup (stored in ContactMessage) */
import { api } from './http.js';

/* POST /api/messages — contact form */
export const sendMessage = (body, signal) => api('/messages', { method: 'POST', body, signal });

/* POST /api/newsletter — newsletter signup → welcome coupon ARIX10 (Task 49).
   Falls back to the legacy /messages topic=newsletter row when the endpoint
   is missing (old backend) so the form never dead-ends. */
export function subscribe(email, signal) {
  return api('/newsletter', { method: 'POST', body: { email }, signal })
    .catch((err) => { if (err && err.status === 404) return api('/messages', { method: 'POST', body: { name: 'Newsletter', email, topic: 'newsletter', message: 'Newsletter signup — ' + email }, signal }); throw err; });
}

/* Task 37 — customer inbox: messages from ArixGear + own replies */
export const listMine = () => api('/messages/mine');
export const markMineRead = () => api('/messages/mine/read', { method: 'POST' });
