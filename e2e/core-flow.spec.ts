import { test, expect, type Browser, type Page } from "@playwright/test";

async function signIn(browser: Browser, who: "Ava" | "Ben" | "Admin"): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: who, exact: true }).click();
  await page.waitForURL(who === "Admin" ? "**/admin" : "**/discover");
  return page;
}

async function inviteBen(ava: Page, category: string) {
  await ava.goto(`/discover?category=${category}`);
  await ava.locator('a[href^="/dates/"]').first().click();
  await ava.getByRole("button", { name: "Invite Ben to this date" }).click();
  await expect(ava.getByText("Invited · awaiting their answer")).toBeVisible();
}

async function acceptLatestInvite(ben: Page) {
  await ben.goto("/my-dates?tab=invitations");
  await ben.getByRole("link", { name: /Ava, \d+/ }).first().click();
  await ben.getByRole("button", { name: "Yes, I'm in" }).click();
  await ben.waitForURL(/\/matches\/[\w-]+\/commit/);
  return ben.url().split("/matches/")[1].split("/")[0];
}

async function confirmAndPay(page: Page, matchId: string, card = "Visa ending 4242") {
  await page.goto(`/matches/${matchId}/commit`);
  if (await page.getByRole("button", { name: "Confirm details" }).isVisible()) {
    await page.getByLabel(/I agree to this exact date/).check();
    await page.getByRole("button", { name: "Confirm details" }).click();
  }
  await page.getByLabel(card).check();
  await page.getByRole("button", { name: /^Commit \$/ }).click();
}

test.describe.serial("ONCE: match to meet", () => {
  let browser: Browser;
  let ava: Page;
  let ben: Page;
  let matchId: string;

  test.beforeAll(async ({ browser: b }) => {
    browser = b;
    ava = await signIn(browser, "Ava");
    ben = await signIn(browser, "Ben");
  });

  test("landing page explains the product and payments before signup", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Less texting\. More chemistry\./ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Find my date" }).first()).toBeVisible();
    await expect(page.getByText("Fifty-fifty. Fully transparent.")).toBeVisible();
  });

  test("Ava discovers a demo-labelled date and invites Ben", async () => {
    await expect(ava.getByRole("heading", { name: /Dates worth/ })).toBeVisible();
    await expect(ava.getByText("Demo").first()).toBeVisible();
    await inviteBen(ava, "coffee");
  });

  test("Ben accepts; a declined card doesn't confirm anything", async () => {
    matchId = await acceptLatestInvite(ben);
    await expect(ben.getByText("Your half")).toBeVisible();
    await expect(ben.getByText("$12").first()).toBeVisible();
    await confirmAndPay(ben, matchId, "Visa ending 0002");
    await expect(ben.getByText("Your card was declined.")).toBeVisible();
    await ben.goto(`/matches/${matchId}`);
    await expect(ben.getByRole("heading", { name: "Almost a date." })).toBeVisible();
  });

  test("both commit, and both see the same confirmed itinerary", async () => {
    await confirmAndPay(ben, matchId);
    await ben.waitForURL(/committed=1/);
    await expect(ben.getByRole("heading", { name: "Almost a date." })).toBeVisible();

    await confirmAndPay(ava, matchId);
    await ava.waitForURL(/committed=1/);
    await expect(ava.getByRole("heading", { name: "It's a date." })).toBeVisible();
    const avaCode = await ava.locator("span.font-mono").first().textContent();
    await expect(ava.getByText("Marginalia Books & Coffee")).toBeVisible();

    await ben.reload();
    await expect(ben.getByRole("heading", { name: "It's a date." })).toBeVisible();
    await expect(ben.locator("span.font-mono").first()).toHaveText(avaCode!);
    await ben.goto("/notifications");
    await expect(ben.getByText("It's a date").first()).toBeVisible();
  });

  test("after the date, independent check-ins lead to a second date", async () => {
    await ben.goto(`/matches/${matchId}`);
    await ben.getByRole("button", { name: "Simulate: the date happened" }).click();
    await ben.waitForURL(/check-in/);
    for (const page of [ben, ava]) {
      await page.goto(`/matches/${matchId}/check-in`);
      for (const group of await page.locator("fieldset").all()) {
        const yes = group.getByText("Yes", { exact: true });
        if (await yes.count()) await yes.click();
        else await group.getByText("5", { exact: true }).click();
      }
      await page.getByRole("button", { name: "Submit check-in" }).click();
      await page.waitForURL(/checked=1/);
    }
    await expect(ava.getByText("You both said yes.")).toBeVisible();
    await ava.getByRole("link", { name: "Plan a second date" }).click();
    await ava.getByRole("button", { name: "Invite Ben" }).first().click();
    await ava.waitForURL(/invited=1/);
    await expect(ava.getByText("Second date invitation sent")).toBeVisible();
  });

  test("cancelling a confirmed date refunds per policy", async () => {
    // Ben accepts the second-date invitation, both commit, then Ava cancels before the deadline.
    const second = await acceptLatestInvite(ben);
    await confirmAndPay(ben, second);
    await confirmAndPay(ava, second);
    await expect(ava.getByRole("heading", { name: "It's a date." })).toBeVisible();
    await ava.goto(`/matches/${second}/cancel`);
    await expect(ava.getByText("You'll get back")).toBeVisible();
    await expect(ava.getByText(/Ben gets back/)).toBeVisible();
    await ava.getByRole("button", { name: "Cancel date" }).click();
    await expect(ava.getByRole("heading", { name: "This date was cancelled." })).toBeVisible();
    await expect(ava.getByText(/of your \$\d+ was refunded/)).toBeVisible();
    await ben.goto(`/matches/${second}`);
    await expect(ben.getByText(/of your \$\d+ was refunded/)).toBeVisible();
  });

  test("there is no chat or contact-exchange feature anywhere", async () => {
    for (const path of ["/discover", "/my-dates", `/matches/${matchId}`, "/profile"]) {
      await ava.goto(path);
      await expect(ava.getByRole("link", { name: /chat|message|inbox/i })).toHaveCount(0);
      await expect(ava.locator('input[type="tel"], textarea[name="message"]')).toHaveCount(0);
    }
  });

  test("non-admins can't reach the admin dashboard; admins can", async () => {
    const res = await ava.goto("/admin");
    expect(res?.status()).toBe(404);
    const admin = await signIn(browser, "Admin");
    await expect(admin.getByRole("heading", { name: "Outcomes" })).toBeVisible();
    await admin.goto("/admin/payments");
    await expect(admin.getByText("TEST").first()).toBeVisible();
  });

  test("Ben can report and block Ava; she disappears from his suggestions", async () => {
    await ben.goto(`/matches/${matchId}`);
    await ben.getByRole("link", { name: "Report or block Ava" }).click();
    await ben.getByRole("button", { name: "Block Ava" }).click();
    await ben.waitForURL(/blocked=1/);
    await ben.goto("/discover?category=coffee");
    await ben.locator('a[href^="/dates/"]').first().click();
    await expect(ben.getByRole("button", { name: "Invite Ava to this date" })).toHaveCount(0);
  });

  test("data persists across reloads and new sessions", async () => {
    const again = await signIn(browser, "Ava");
    await again.goto("/my-dates?tab=history");
    await expect(again.getByText("Coffee & a bookstore").first()).toBeVisible();
  });
});
