import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T15:00:00Z') })
  await page.goto('/')
})

test('counts focus, preserves remaining time on reload, and saves an early session', async ({ page }) => {
  await expect(page.getByRole('timer')).toHaveText('60:00')
  await expect(page).toHaveTitle('Focus')
  const icon = await page.locator('link[rel=icon]').getAttribute('href')
  expect((await page.request.get(icon!)).headers()['content-type']).toContain('image/png')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.fastForward(300_000)
  await expect(page).toHaveTitle('55:00')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText('55:00')
  await page.clock.fastForward(120_000)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Paused while away' })).toBeVisible()
  await expect(page).toHaveTitle('55:00 - Focus paused')
  await page.clock.fastForward(3600_000)
  await expect(page.getByRole('timer')).toHaveText('55:00')
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'End Session', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'End Session', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'End Session' }).click()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Metrics' }).click()
  await expect(page.getByRole('heading', { name: 'Your Week' })).toBeVisible()
  await expect(page.locator('.chart button')).toHaveCount(7)
  await page.getByRole('button', { name: /^Mon,/ }).click()
  await expect(page.getByText(/Extra time includes manual pauses/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Focus session.*focused/ })).toBeVisible()
  await expect(page.locator('.totals')).toContainText('Extra time2m')
  await page.locator('.entry').click()
  await expect(page.getByRole('heading', { name: 'Session timeline' })).toBeVisible()
  await expect(page.getByText('System interruption', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => window.innerWidth),
  )
})

test('counts break up across reload and switches to the next focus with Start', async ({ page }) => {
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.fastForward(3600_000)
  await expect(page.getByRole('heading', { name: 'Break', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/^00:0/)
  await page.clock.fastForward(90 * 60_000 + 56_000)
  await page.reload()
  await expect(page.getByRole('timer')).toHaveText(/^01:30:5[6-9]$/)
  await expect(page).toHaveTitle(/^01:30:5[6-9] - Break$/)
  await expect(page.getByText(/^\+01:15:5[6-9] extra$/)).toBeVisible()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('60:00')
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Metrics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Time breakdown by day' })).toBeVisible()
  const monday = page.getByRole('button', { name: /^Mon,.*1h 15m focus and included breaks, 1h 15m extra time$/ })
  await expect(monday).toBeVisible()
  await expect(monday.locator('.bar > span')).toHaveCount(2)
  await monday.focus()
  await expect(page.getByRole('tooltip')).toContainText('Included break 00:15:00')
  await expect(page.locator('.totals')).toContainText('Break time15m')
  await expect(page.locator('.totals')).toContainText('Extra time1h 15m')
})

test('locks at local cutoff and unlocks the next morning', async ({ page }) => {
  await page.clock.fastForward(10 * 3600_000 + 20 * 60_000)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.clock.fastForward(10 * 60_000)
  await expect(page.getByRole('heading', { name: 'Finished for today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled()
  await page.clock.fastForward(12 * 3600_000)
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled()
})

test('applies settings and exports stored activity as JSON', async ({ page }) => {
  await page.evaluate(() => {
    Reflect.set(window, 'previewNotes', 0)
    const start = OscillatorNode.prototype.start
    OscillatorNode.prototype.start = function (when) {
      start.call(this, when)
      Reflect.set(window, 'previewNotes', Reflect.get(window, 'previewNotes') + 1)
    }
  })
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Focus target (minutes)').fill('25')
  await page.getByLabel('Included break (minutes)').fill('5')
  await page.getByLabel('Timer alert sound').selectOption('bell')
  await expect(page.getByLabel('Play each alert sound')).toHaveValue('1')
  await page.getByLabel('Play each alert sound').selectOption('5')
  await page.getByRole('button', { name: 'Preview sound' }).click()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'previewNotes'))).toBe(10)
  await page.getByRole('button', { name: 'Save settings' }).click()
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Focus', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText('25:00')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export activity as JSON' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('focus-tracker.json')
  const stream = await file.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(backup.settings).toMatchObject({ target: 25 * 60_000, allowance: 5 * 60_000, sound: 'bell', soundPlays: 5 })
  expect(backup.blocks).toHaveLength(1)
  expect(backup.events.map((event: { type: string }) => event.type)).toEqual(['settings_changed', 'start'])
})

test('notifies once at focus completion and once at the break allowance', async ({ page }) => {
  await page.addInitScript(() => {
    const alerts: string[] = []
    Object.assign(window, { focusAlerts: alerts })
    class TestNotification {
      static permission = 'default'
      static async requestPermission() {
        TestNotification.permission = 'granted'
        return 'granted'
      }
      constructor(title: string) { alerts.push(title) }
    }
    Object.defineProperty(window, 'Notification', { value: TestNotification })
  })
  await page.reload()
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Notify me when focus or the break allowance ends' })).toBeChecked()
  await page.getByLabel('Menu').click()
  await page.getByRole('button', { name: 'Focus', exact: true }).click()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  expect(await page.evaluate(() => Notification.permission)).toBe('granted')
  await page.clock.fastForward(3600_000)
  await expect(page.getByRole('heading', { name: 'Break', exact: true })).toBeVisible()
  await page.clock.fastForward(60_000)
  expect(await page.evaluate(() => Reflect.get(window, 'focusAlerts'))).toEqual(['Focus time is up'])
  await page.clock.fastForward(14 * 60_000)
  await expect(page.getByRole('timer')).toHaveText(/^15:0/)
  await page.clock.fastForward(60_000)
  await expect(page.getByRole('timer')).toHaveText(/^16:0/)
  expect(await page.evaluate(() => Reflect.get(window, 'focusAlerts'))).toEqual(['Focus time is up', 'Break allowance ended'])
  await page.reload()
  await expect(page.getByRole('timer')).toHaveText(/^16:0/)
  expect(await page.evaluate(() => Reflect.get(window, 'focusAlerts'))).toEqual([])
})
