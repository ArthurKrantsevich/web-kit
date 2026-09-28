import { expect, type Page } from "@playwright/test";

/**
 * Waits until a tool page has hydrated. Paste appears only then; the password generator has no Paste, and its first
 * password appears only then (passwords are never in the server's HTML).
 */
export async function hydrated(page: Page, tool: string): Promise<void> {
  if (tool === "password-generator") await expect(page.locator(".wk-password__item").first()).toBeVisible();
  else await expect(page.getByRole("button", { name: /^Paste/ }).first()).toBeVisible();
}
