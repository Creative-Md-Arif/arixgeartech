/* ArixGear ADMIN — toast context + drawer/modal context (React port of admin.js overlays) */
import { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);
const DrawerCtx = createContext(null);
const ModalCtx = createContext(null);

export function OverlayProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [drawer, setDrawer] = useState(null);   /* { title, body, actions } */
  const [modal, setModal] = useState(null);     /* JSX node */

  const toast = useCallback((msg, type = '') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const openDrawer = useCallback((title, body, actions, size = 'default') => setDrawer({ title, body, actions, size }), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const openModal = useCallback((node) => setModal(node), []);
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <ToastCtx.Provider value={toast}>
      <DrawerCtx.Provider value={{ drawer: drawer || {}, openDrawer, closeDrawer }}>
        <ModalCtx.Provider value={{ openModal, closeModal }}>
          {children}
          <div id="toasts" className="fixed bottom-5 right-5 z-[3000] flex w-[min(360px,90vw)] flex-col gap-2">
            {toasts.map((t) => (
              <div key={t.id} className={'animate-slideUp rounded-lg border-l-2 p-3.5 shadow-xl ' + (t.type === 'err' ? 'border-red bg-panel2 text-red' : t.type === 'ok' ? 'border-green bg-panel2 text-green' : 'border-acc bg-panel2 text-txt')}>
                {t.msg}
              </div>
            ))}
          </div>
          {drawer && drawer.title !== undefined && (
            <>
              <div className="fixed inset-0 z-[2000] bg-black/70 backdrop-blur-sm" onClick={closeDrawer} id="scrim" />
              <aside className={'fixed right-0 top-0 z-[2100] flex h-full ' + (drawer.size === 'wide' ? 'w-[min(960px,100vw)]' : 'w-[min(560px,100vw)]') + ' flex-col border-l border-line bg-panel animate-drawerIn'} id="drawer">
                <div className="dw-head flex items-center gap-3 border-b border-line p-4">
                  <h2 className="flex-1 text-[17px]" id="dwTitle">{drawer.title}</h2>
                  <button className="btn-ghost rounded-lg border border-line2 px-3 py-1.5 text-[12px]" id="dwClose" onClick={closeDrawer}>✕</button>
                </div>
                <div className="dw-body flex-1 overflow-y-auto p-4" id="dwBody">{drawer.body}</div>
                {drawer.actions ? <div className="dw-actions flex gap-2 border-t border-line p-4" id="dwActions">{drawer.actions}</div> : null}
              </aside>
            </>
          )}
          {modal && (
            <div className="fixed inset-0 z-[2500] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" id="modalWrap" onClick={(e) => { if (e.target.id === 'modalWrap') closeModal(); }}>
              <div className="max-h-[90vh] w-[min(680px,96vw)] overflow-y-auto rounded-xl border border-line bg-panel p-5" id="modalBox">{modal}</div>
            </div>
          )}
        </ModalCtx.Provider>
      </DrawerCtx.Provider>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
export const useDrawer = () => useContext(DrawerCtx);
export const useModal = () => useContext(ModalCtx);
