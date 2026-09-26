export type Theme = "light" | "dark";

export const THEME_KEY = "wk-theme";

/** Runs in <head> before the first paint, so a stored dark theme never flashes light. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
