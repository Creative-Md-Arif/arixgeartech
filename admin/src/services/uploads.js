/* ArixGear ADMIN services — image upload endpoint (single file → Cloudinary/local) */
import { api } from './http.js';

/* POST /api/admin/uploads — multipart image → { url } */
export const uploadOne = (file) => {
  const form = new FormData();
  form.append('image', file);
  return api('/admin/uploads', { method: 'POST', form });
};
