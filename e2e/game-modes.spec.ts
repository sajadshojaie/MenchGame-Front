import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window { __testDie: number }
}

async function deterministicDice(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("manch-muted", "1");
    window.__testDie = 6;
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint32Array) => {
        for (let i = 0; i < array.length; i++) array[i] = window.__testDie - 1;
        return array;
      },
    });
  });
}

async function setDie(page: Page, face: number) {
  await page.evaluate((value) => { window.__testDie = value; }, face);
}

async function startLocal(page: Page, mode: "منچ" | "مار و پله", bot = false) {
  await deterministicDice(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "آفلاین", exact: true }).click();
  await page.getByRole("button", { name: mode, exact: false }).filter({ has: page.locator("span", { hasText: mode }) }).first().click();
  await page.getByRole("textbox", { name: "نام شما" }).fill("آزمایشگر");
  await page.getByRole("button", { name: "۲", exact: true }).click();
  if (!bot) await page.getByRole("button", { name: "ربات", exact: true }).click();
  await page.getByRole("button", { name: "شروع بازی", exact: true }).click();
  await expect(page.locator(".dice-btn")).toBeEnabled();
}

for (const mode of ["منچ", "مار و پله"] as const) {
  test(`${mode}: human tokens stay still after rolling until clicked`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.install();
    await startLocal(page, mode);
    await page.locator(".dice-btn").click();
    await page.clock.runFor(2100);

    const pawn = page.locator(".board-fit .token-btn").first();
    await expect(pawn).toBeEnabled();
    if (mode === "مار و پله") await expect(pawn).toHaveAttribute("aria-label", "آزمایشگر، منتظر شش");
    await pawn.click();
    await page.clock.runFor(1000);
    await expect(page.locator(".dice-btn")).toBeEnabled();
    const position = await pawn.getAttribute("style");

    await setDie(page, mode === "مار و پله" ? 2 : 1);
    await page.locator(".dice-btn").click();
    await page.clock.runFor(2100);
    await expect(pawn).toBeEnabled();
    expect(await pawn.getAttribute("style")).toBe(position);
    await pawn.click();
    await page.clock.runFor(2500);
    expect(await pawn.getAttribute("style")).not.toBe(position);
    if (mode === "مار و پله") {
      await expect(pawn).toHaveAttribute("aria-label", "آزمایشگر، خانه ۲۴");
      await expect(page.getByText(/از نردبان بالا رفت/)).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });

  test(`${mode}: bots still roll and move without a human click`, async ({ page }) => {
    await page.clock.install();
    await startLocal(page, mode, true);
    await page.locator(".dice-btn").click();
    await page.clock.runFor(1000);
    await page.locator(".board-fit .token-btn").first().click();
    await page.clock.runFor(1000);
    await setDie(page, 1);
    await page.locator(".dice-btn").click();
    await page.clock.runFor(1000);
    await page.locator(".board-fit .token-btn").first().click();
    await setDie(page, 6);
    await page.clock.runFor(5000);
    if (mode === "مار و پله") {
      await expect(page.locator(".board-fit .token-btn").nth(1)).toHaveAttribute("aria-label", /خانه/);
    } else {
      // The bot may choose any of its four tokens to leave the yard.
      await expect(page.locator('.board-fit .token-btn[aria-label^="سبز"] .token-pad')).toHaveCount(1);
    }
  });
}

test("Snakes renders on mobile and can be entered by clicking its token", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install();
  await startLocal(page, "مار و پله");
  await expect(page.getByRole("img", { name: "صفحه مار و پله، از خانه ۱ تا ۱۰۰" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  await page.locator(".dice-btn").click();
  await page.clock.runFor(2000);
  await page.getByRole("button", { name: "آزمایشگر، منتظر شش" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByRole("button", { name: "آزمایشگر، خانه ۱", exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("snakes-mobile.png") });
});

test("Snakes captures after a ladder, keeps the victim until impact and uses the Ludo report", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await startLocal(page, "مار و پله");
  const pawns = page.locator(".board-fit .token-btn");
  const hostPawn = pawns.nth(0);
  const guestPawn = pawns.nth(1);
  const rollAndClick = async (die: number) => {
    await setDie(page, die);
    await expect(page.locator(".dice-btn")).toBeEnabled();
    await page.locator(".dice-btn").click();
    await page.clock.runFor(1000);
    await page.locator(".board-fit .token-legal").click();
    await page.clock.runFor(2500);
  };
  await rollAndClick(6);
  await rollAndClick(2);
  await rollAndClick(6);
  await expect(hostPawn).toHaveAttribute("aria-label", "آزمایشگر، خانه ۲۴");
  await expect(guestPawn).toHaveAttribute("aria-label", "رویا، خانه ۱");
  await expect(page.getByText(/برای ورود به خانهٔ ۱|تاس آخر باید دقیق باشد|از نردبان بالا رفت/)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("snakes-desktop.png") });
  const before = await hostPawn.evaluate((element) => ({
    x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top),
  }));

  await setDie(page, 2);
  await page.locator(".dice-btn").click();
  await page.clock.runFor(1000);
  await guestPawn.click();
  await page.clock.runFor(1200);
  const beforeImpact = await hostPawn.evaluate((element) => ({
    x: parseFloat((element as HTMLElement).style.left), y: parseFloat((element as HTMLElement).style.top),
  }));
  expect(beforeImpact.x).toBeCloseTo(before.x, 1);
  expect(Math.abs(beforeImpact.y - before.y)).toBeLessThanOrEqual(0.6);
  await page.clock.runFor(1500);
  await expect(hostPawn).toHaveAttribute("aria-label", "آزمایشگر، منتظر شش");
  await expect(guestPawn).toHaveAttribute("aria-label", "رویا، خانه ۲۴");
  expect(await hostPawn.evaluate((element) => parseFloat((element as HTMLElement).style.top))).toBeCloseTo(96.6, 1);

  await page.getByRole("button", { name: "گزارش لحظه‌ای بازی" }).click();
  const report = page.getByRole("dialog", { name: "گزارش لحظه‌ای بازی" });
  await expect(report.getByRole("columnheader")).toHaveText(["بازیکن زننده", "بازیکنی که مهره‌اش زده شده", "تعداد"]);
  await expect(report.getByRole("row").filter({ hasText: "رویا" }).getByRole("cell")).toHaveText(["رویا", "آزمایشگر", "۱"]);
  await expect(report.getByText("موقعیت مهره‌ها")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("online mode changes, manual moves and reconnection sync between two browsers", async ({ page, browser }) => {
  // Separate browser storage is essential for independent room membership.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  try {
    await deterministicDice(page);
    await deterministicDice(guestPage);
    await page.goto("/");
    await page.getByRole("textbox", { name: "نام شما" }).fill("میزبان آزمایش");
    await page.getByRole("button", { name: /مار و پله/ }).click();
    await page.getByRole("button", { name: "۲", exact: true }).click();
    await page.getByRole("button", { name: "ساخت اتاق", exact: true }).click();
    await expect(page.getByText("تنظیمات بازی", { exact: true })).toBeVisible();
    const code = new URL(page.url()).searchParams.get("room");
    expect(code).toBeTruthy();

    await guestPage.goto(`http://127.0.0.1:4173/?room=${code}`);
    await guestPage.getByRole("textbox", { name: "نام شما" }).fill("مهمان آزمایش");
    await guestPage.getByRole("button", { name: "ورود به اتاق", exact: true }).click();
    await expect(page.getByText("مهمان آزمایش", { exact: true })).toBeVisible();
    await expect(guestPage.getByRole("button", { name: /مار و پله/ })).toHaveAttribute("aria-pressed", "true");
    await expect(guestPage.getByRole("button", { name: /مار و پله/ })).toBeDisabled();

    await page.getByRole("button", { name: /^منچ / }).click();
    await expect(guestPage.getByRole("button", { name: /^منچ / })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /مار و پله/ }).click();
    await expect(guestPage.getByRole("button", { name: /مار و پله/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "شروع بازی", exact: true }).click();
    await expect(page.locator(".board-fit .token-btn")).toHaveCount(2);
    await expect(guestPage.locator(".board-fit .token-btn")).toHaveCount(2);

    await page.locator(".dice-btn").click();
    const hostPawn = page.getByRole("button", { name: "میزبان آزمایش، منتظر شش" });
    await expect(hostPawn).toBeEnabled();
    await page.waitForTimeout(1800);
    await expect(hostPawn).toBeVisible();
    await expect(guestPage.getByRole("button", { name: "میزبان آزمایش، منتظر شش" })).toBeVisible();
    await hostPawn.click();
    await expect(guestPage.getByRole("button", { name: "میزبان آزمایش، خانه ۱", exact: true })).toBeVisible();

    await guestPage.reload();
    await expect(guestPage.getByRole("button", { name: "میزبان آزمایش، خانه ۱", exact: true })).toBeVisible();
    await expect(guestPage.locator(".board-fit .token-btn")).toHaveCount(2);
    await expect(guestPage.getByRole("img", { name: "صفحه مار و پله، از خانه ۱ تا ۱۰۰" })).toBeVisible();
  } finally {
    await guestContext.close();
  }
});
