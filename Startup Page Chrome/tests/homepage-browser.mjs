import assert from "node:assert/strict";

export async function homepageChecks({
  page,
  context,
  start,
  openSettings,
  section,
  choose,
  save,
  shot,
  check,
}) {
  const get = (selector) => page.locator(selector);
  const settings = async () => {
    await openSettings();
    await section("Homepage");
    await get("#homepage-fields:not([disabled])").waitFor();
  };
  const noOverlaps = async () => {
    await page.waitForFunction(() => {
      const rect = (el) => el.getBoundingClientRect();
      const boxes = [...document.querySelectorAll(".widget:not([hidden])")].map(
        rect,
      );
      const blockers = [
        ...document.querySelectorAll(
          "header.bar, .hero, #search, .favorites, footer.bar",
        ),
      ]
        .filter((el) => el.getClientRects().length)
        .map(rect);
      const separate = (a, b) =>
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom;
      return boxes.every(
        (box, i) =>
          box.width > 0 &&
          box.left >= 0 &&
          box.right <= document.documentElement.clientWidth + 0.5 &&
          [...blockers, ...boxes.slice(0, i)].every((b) => separate(box, b)),
      );
    });
  };
  await check(
    "opt-in local widgets, free placement, reminders and cross-tab persistence",
    async () => {
      assert.equal(await get("#widgets").isVisible(), false);
      await settings();
      await page.getByLabel("To-do list", { exact: true }).check();
      await get("#homepage-fields")
        .getByLabel("Notes", { exact: true })
        .check();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await get("#widgets").isVisible(), false);
      await settings();
      await page.getByLabel("To-do list", { exact: true }).check();
      await get("#homepage-fields")
        .getByLabel("Notes", { exact: true })
        .check();
      await save();
      await get("#notes-widget").waitFor();
      await noOverlaps();
      await get("#home-notes").fill("Sketch the album cover.\nTry ink first.");
      await get("[name=task]").fill("Return library book");
      await get("[name=due]").fill("2020-01-02");
      await get("#reminder-form button").click();
      await get(".reminder-row time")
        .getByText(/Overdue/)
        .waitFor();
      await get(".reminder-row input").check();
      await get(".reminder-row input:checked").waitFor();
      assert.equal(await get("#query").inputValue(), "");
      await get("#notes-widget .move-widget").focus();
      const before = await get("#notes-widget").boundingBox();
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction(
        (y) =>
          document.querySelector("#notes-widget").getBoundingClientRect().y >
          y + 5,
        before.y,
      );
      const handle = await get("#notes-widget .move-widget").boundingBox();
      const x = handle.x + handle.width / 2,
        y = handle.y + handle.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 2, y - 85, { steps: 6 });
      await page.mouse.up();
      await page.waitForFunction(
        (y) =>
          Math.abs(
            document.querySelector("#notes-widget").getBoundingClientRect().y -
              y,
          ) > 40,
        before.y,
      );
      const after = await get("#notes-widget").boundingBox();
      await noOverlaps();
      await start();
      await get("#notes-widget").waitFor();
      await noOverlaps();
      assert.ok(
        Math.abs((await get("#notes-widget").boundingBox()).y - after.y) < 2,
      );
      assert.match(await get("#home-notes").inputValue(), /ink first/);
      assert.equal(await get(".reminder-row input").isChecked(), true);
      const other = await context.newPage();
      try {
        await start(other);
        await other
          .locator("#home-notes")
          .fill("Walk the ridge trail before sunrise.");
        await page.waitForFunction(
          () =>
            document.querySelector("#home-notes").value ===
            "Walk the ridge trail before sunrise.",
        );
        await Promise.all(
          [page, other].map(async (p, i) => {
            await p
              .locator("[name=task]")
              .fill(["Pack a sketchbook", "Pick up coffee"][i]);
            await p.locator("#reminder-form button").click();
          }),
        );
        await page.waitForFunction(
          () => document.querySelectorAll(".reminder-row").length === 3,
        );
        await page
          .getByRole("button", { name: "Delete reminder: Pick up coffee" })
          .click();
        await other.waitForFunction(
          () => document.querySelectorAll(".reminder-row").length === 2,
        );
        assert.ok(
          !JSON.stringify(
            await page.evaluate(() => chrome.storage.sync.get(null)),
          ).includes("library book"),
        );
      } finally {
        await other.close();
      }
      await page.setViewportSize({ width: 320, height: 568 });
      await noOverlaps();
      await shot("homepage-widgets-narrow");
      await get("#home-notes").scrollIntoViewIfNeeded();
      assert.equal(await get("#home-notes").isVisible(), true);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => scrollTo(0, 0));
      await noOverlaps();
    },
  );

  await check(
    "local wallpaper stays behind the borderless homepage and restores the branded searches",
    async () => {
      const png = await page.evaluate(() => {
        const c = document.createElement("canvas");
        c.width = 960;
        c.height = 600;
        const ctx = c.getContext("2d");
        const sky = ctx.createLinearGradient(0, 0, 400, 600);
        sky.addColorStop(0, "#748ea9");
        sky.addColorStop(0.48, "#eed8b6");
        sky.addColorStop(1, "#d5937c");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, 960, 600);
        ctx.fillStyle = "#f7e5b8";
        ctx.beginPath();
        ctx.arc(690, 150, 58, 0, 2 * Math.PI);
        ctx.fill();
        for (let n = 0; n < 4; n++) {
          ctx.fillStyle = ["#ad9ca5", "#797c91", "#455f69", "#284953"][n];
          ctx.beginPath();
          ctx.moveTo(0, 600);
          for (let x = 0; x <= 960; x += 12)
            ctx.lineTo(
              x,
              260 +
                65 * n +
                Math.sin(x / 160 + n) * 60 +
                Math.cos(x / 99 + 2 * n) * 28,
            );
          ctx.lineTo(960, 600);
          ctx.fill();
        }
        return c.toDataURL("image/png").split(",")[1];
      });
      const file = {
        name: "ridge.png",
        mimeType: "image/png",
        buffer: Buffer.from(png, "base64"),
      };
      await settings();
      await get("[name=homeImage]").setInputFiles(file);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await get("#home-wallpaper").isVisible(), false);
      await settings();
      await get("[name=homeImage]").setInputFiles(file);
      await save();
      await get("#home-wallpaper").waitFor();
      await noOverlaps();
      const frost = (el) => getComputedStyle(el).backdropFilter;
      for (const selector of [
        ".hero",
        "#search-form",
        ".favorites",
        ".widget",
        "header.bar",
        "footer.bar",
      ]) {
        assert.deepEqual(await get(selector).first().evaluate(el => {
          const style = getComputedStyle(el);
          return [style.borderWidth, style.backgroundColor, style.backdropFilter];
        }), ["0px", "rgba(0, 0, 0, 0)", "none"], selector);
      }
      await shot("homepage-wallpaper-dark");
      await openSettings();
      await section("Appearance");
      await choose("colorScheme", "light");
      await save();
      await noOverlaps();
      await shot("homepage-wallpaper-light");
      for (const [term, word] of [
        ["spoti", "SPOTIFY"],
        ["quiet corners", "GOOGLE"],
      ]) {
        await get("#query").fill(term);
        await get("#brand-backdrop:not([hidden])").waitFor();
        assert.match(
          await get(".brand-plane > div").first().innerText(),
          new RegExp(word),
        );
        assert.equal(await get("#home-wallpaper").isVisible(), false);
        assert.equal(await get("#widgets").isVisible(), false);
        assert.equal(await get("#search-form").evaluate(frost), "none");
      }
      await get("#query").fill("");
      await start();
      await get("#home-wallpaper").waitFor();
      await settings();
      await get("#remove-wallpaper").click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await get("#home-wallpaper").isVisible(), true);
      await settings();
      await get("[name=homeImage]").setInputFiles({
        name: "bad.png",
        mimeType: "image/png",
        buffer: Buffer.from("invalid"),
      });
      await page
        .getByRole("button", { name: "Save settings", exact: true })
        .click();
      await get("#settings-status")
        .getByText(/readable/)
        .waitFor();
      await get("#remove-wallpaper").click();
      await page.getByLabel("To-do list", { exact: true }).uncheck();
      await get("#homepage-fields")
        .getByLabel("Notes", { exact: true })
        .uncheck();
      await section("Appearance");
      await choose("colorScheme", "dark");
      await save();
      await get("#home-wallpaper").waitFor({ state: "hidden" });
      await get("#widgets").waitFor({ state: "hidden" });
      assert.equal(await get(".hero").evaluate(frost), "none");
    },
  );
}
