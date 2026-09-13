// pnpm dev, then SQUIG_TEST_URL=http://localhost:3000 node scripts/ui/alignment-browser.mjs
import { chromium, expect } from "@playwright/test"
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on("pageerror", (error) => errors.push(error.message))
try {
  await page.goto(process.env.SQUIG_TEST_URL ?? "http://localhost:3000")
  await page.waitForFunction(() => !!window.squig)
  await page.evaluate(() => {
    window.squig.add([
      { id: "a", x: 300, y: 250, w: 160, h: 160, groupIds: ["g"] },
      { id: "b", x: 330, y: 280, w: 40, h: 30, groupIds: ["g"] },
      { id: "c", x: 600, y: 450, w: 200, h: 180, groupIds: ["h"] },
      { id: "d", x: 650, y: 490, w: 40, h: 30, groupIds: ["h"] },
    ].map((n, i) => ({ ...n, type: "shape", shape: "rect", fill: "light", seed: i + 1 })))
    window.squig.select([])
  })

  const positions = () => page.evaluate(() => Object.fromEntries(Object.entries(window.squig.doc().nodes).map(([id, n]) => [id, [n.x, n.y]])))
  await page.mouse.click(420, 370)
  await expect(page.getByRole("button", { name: "Align horizontal centres", exact: true })).toHaveCount(0)
  await page.keyboard.down("Shift")
  await page.mouse.click(760, 590)
  await page.keyboard.up("Shift")
  await page.getByRole("button", { name: "Align horizontal centres", exact: true }).first().click()
  expect(await positions()).toEqual({ a: [470, 250], b: [500, 280], c: [450, 450], d: [500, 490] })
  await expect(page.getByRole("button", { name: "Distribute needs 3 or more" }).first()).toBeDisabled()
  await page.screenshot({ path: "/tmp/squig-align-groups.png" })
  await page.keyboard.press("Meta+z")
  expect(await positions()).toEqual({ a: [300, 250], b: [330, 280], c: [600, 450], d: [650, 490] })
  await page.keyboard.down("Meta")
  await page.mouse.click(350, 295)
  await page.keyboard.up("Meta")
  await page.getByRole("button", { name: "Align horizontal centres in group", exact: true }).first().click()
  expect((await positions()).b).toEqual([360, 280])
  await page.screenshot({ path: "/tmp/squig-align-child.png" })
  await page.keyboard.press("Meta+z")
  // Deep additive selection across groups aligns the leaves, leaving their backgrounds still.
  await page.keyboard.down("Meta")
  await page.keyboard.down("Shift")
  await page.mouse.click(670, 505)
  await page.keyboard.up("Shift")
  await page.keyboard.up("Meta")
  await page.getByRole("button", { name: "Align horizontal centres", exact: true }).first().click()
  expect(await positions()).toEqual({ a: [300, 250], b: [490, 280], c: [600, 450], d: [490, 490] })
  await page.keyboard.press("Meta+z")
  // Selecting all siblings explicitly must remain different from selecting their group.
  await page.evaluate(() => window.squig.select(["a", "b"]))
  await page.getByRole("button", { name: "Align left", exact: true }).first().click()
  expect((await positions()).b).toEqual([300, 280])
  await page.keyboard.press("Meta+z")
  await page.evaluate(() => window.squig.select([]))
  await page.mouse.move(260, 200)
  await page.mouse.down()
  await page.mouse.move(850, 680, { steps: 8 })
  await page.mouse.up()
  await page.getByRole("button", { name: "Align right", exact: true }).first().click()
  expect(await positions()).toEqual({ a: [640, 250], b: [670, 280], c: [600, 450], d: [650, 490] })
  console.log("Group clicks, deep additive selection, child controls, sibling selection, marquee and undo passed")

} finally {
  await browser.close()
}
expect(errors).toEqual([])
