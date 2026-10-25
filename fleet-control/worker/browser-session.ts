import type { BrowserContext } from "playwright";

export type SavedBrowserState = Awaited<ReturnType<BrowserContext["storageState"]>> & { session?: Record<string, string> };

export async function captureXiaohuiSession(context: BrowserContext): Promise<SavedBrowserState> {
  const page = context.pages().find(p => new URL(p.url()).origin === "https://www.led-cloud.com");
  if (!page) throw new Error("No Xiaohui page available for session capture.");
  const session = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  return {...await context.storageState(), session};
}

// Xiaohui's published client stores the same three auth fields in hd_token and
// sessionStorage. Playwright storageState preserves cookies, but not sessionStorage.
// Restore only this site's already-authorized session; never log token values.
export async function restoreXiaohuiSession(context: BrowserContext, state: SavedBrowserState) {
  const cookie = state.cookies.find(c => c.name === "hd_token" &&
    ["www.led-cloud.com", ".led-cloud.com", "led-cloud.com"].includes(c.domain));
  if (!cookie) throw new Error("Saved Xiaohui session has no authentication cookie.");
  const parts = decodeURIComponent(cookie.value).split("&");
  if (parts.length !== 3 || parts.some(p => !p || p === "undefined"))
    throw new Error("Saved Xiaohui session is incomplete; sign in again.");
  await context.addInitScript(({fields}) => {
    if (location.origin !== "https://www.led-cloud.com") return;
    for (const [key, value] of Object.entries(fields)) {
      if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, value);
    }
  }, {fields: state.session ?? {access_token: parts[0], refresh_token: parts[1], token_type: parts[2], loginMode: "password"}});
}
