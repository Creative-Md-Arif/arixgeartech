/* Storefront theme hooks remain local after the admin theme API was removed. */
export function setUserTheme() {}
export function getActiveTheme() { return { homepage: { sections: {} } }; }
export async function loadPublishedTheme() { return getActiveTheme(); }
export function listenForThemeUpdates() {}
