import { expect, test, type Page } from '@playwright/test'

// All tests run against the production build in demo mode (localStorage
// data). Each test gets a fresh demo database by clearing storage.

async function openDemo(page: Page) {
  await page.goto('/#/login?demo=1')
  await page.evaluate(() => localStorage.removeItem('tiffin-demo'))
  await page.reload()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
}

test('start screen offers demo mode entry', async ({ page }) => {
  // With config.js filled the app boots to Login; without it, to the
  // not-configured screen. Both offer a Try Demo button.
  await page.goto('/')
  await page.getByTestId('try-demo').click()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
})

test('dashboard shows counts, expiring, dues and WhatsApp links', async ({ page }) => {
  await openDemo(page)
  await expect(page.getByTestId('lunch-count')).not.toHaveText('0')
  await expect(page.getByTestId('dinner-count')).not.toHaveText('0')

  const expiring = page.getByTestId('expiring-panel')
  await expect(expiring.locator('.row').first()).toBeVisible()

  // Dues panel lists Pankaj with his pending amount and a dues WhatsApp link.
  const dues = page.getByTestId('dues-panel')
  await expect(dues).toContainText('Pankaj Biller')
  await expect(dues).toContainText('₹1,550')
  const waHref = await dues.getByTestId('whatsapp-link').first().getAttribute('href')
  expect(waHref).toContain('https://wa.me/917620781567?text=')
  expect(waHref).toContain(encodeURIComponent('Pankaj Biller'))
})

test('attendance marking persists across reload', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/attendance')
  await page.getByTestId('meal-lunch').click()
  const rows = page.getByTestId('att-row')
  await expect(rows.first()).toBeVisible()

  await page.getByTestId('mark-present').nth(0).click()
  await page.getByTestId('mark-present').nth(1).click()
  await page.getByTestId('mark-absent').nth(2).click()
  await expect(page.getByTestId('att-counter')).toContainText('2 present · 3/')

  await page.reload()
  await page.getByTestId('meal-lunch').click()
  await expect(page.getByTestId('att-counter')).toContainText('2 present · 3/')
})

test('skip day extends effective end and hides customer from that day sheet', async ({ page }) => {
  await openDemo(page)

  // Sonali Pawar: lunch subscriber, expiring soon.
  await page.goto('/#/customers')
  await page.getByTestId('customer-search').fill('Sonali')
  await page.getByTestId('customer-row').filter({ hasText: 'Sonali Pawar' }).click()
  await expect(page.getByTestId('customer-name')).toHaveText('Sonali Pawar')

  const endBefore = await page.getByTestId('effective-end').textContent()
  await page.getByTestId('add-skip').click()
  // Skip today (default date in the modal).
  await page.getByTestId('save-skip').click()
  await expect(page.getByTestId('effective-end')).not.toHaveText(endBefore!)
  await expect(page.getByTestId('current-subscription')).toContainText('(+1 skip)')

  // She should now appear greyed as a skip day on today's lunch sheet.
  await page.goto('/#/attendance')
  await page.getByTestId('meal-lunch').click()
  const sonaliRow = page.getByTestId('att-row').filter({ hasText: 'Sonali Pawar' })
  await expect(sonaliRow).toHaveClass(/skipped/)
  await expect(sonaliRow).toContainText('Skip day')
})

test('partial payment updates dues on customer page and dashboard', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/customers')
  await page.getByTestId('customer-search').fill('Sarthak')
  await page.getByTestId('customer-row').filter({ hasText: 'Sarthak Deshkari' }).click()
  await expect(page.getByTestId('due-amount')).toContainText('₹750')

  await page.getByTestId('add-payment').click()
  await page.getByTestId('payment-amount').fill('500')
  await page.getByTestId('save-payment').click()
  await expect(page.getByTestId('due-amount')).toContainText('₹250')

  await page.goto('/#/')
  const dues = page.getByTestId('dues-panel')
  await expect(dues).toContainText('Sarthak Deshkari')
  await expect(dues).toContainText('₹250')
})

test('renew from dashboard prefills plan and start date after old end', async ({ page }) => {
  await openDemo(page)
  const expiring = page.getByTestId('expiring-panel')
  const firstRow = expiring.locator('.row').first()
  const rowText = await firstRow.locator('.name').textContent()
  await firstRow.getByRole('button', { name: 'Renew' }).click()

  await expect(page.getByRole('heading', { name: 'Renew subscription' })).toBeVisible()
  await expect(page.locator('form')).toContainText(rowText!.trim())
  // Save the renewal and confirm a new current subscription exists.
  await page.getByTestId('save-subscription').click()
  await expect(page.getByTestId('current-subscription')).toBeVisible()
})

test('new customer with partial initial payment shows up with due', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/customers')
  await page.getByTestId('fab-new').click()

  await page.getByTestId('new-name').fill('Test Walk-in')
  await page.getByTestId('new-phone').fill('9123456789')
  await page.getByTestId('initial-payment').fill('1000')
  await page.getByTestId('save-subscription').click()

  await expect(page.getByTestId('customer-name')).toHaveText('Test Walk-in')
  await expect(page.getByTestId('due-amount')).toContainText('₹750')
})

test('reports show revenue for the current month', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/reports')
  await expect(page.getByTestId('total-revenue')).not.toHaveText('₹0')
  const table = page.getByTestId('report-table')
  await expect(table).toContainText('Kothrud Branch')
  await expect(table).toContainText('Baner Branch')
})

test('location filter narrows dashboard and attendance', async ({ page }) => {
  await openDemo(page)
  const allLunch = Number(await page.getByTestId('lunch-count').textContent())
  await page.getByRole('button', { name: 'Kothrud Branch' }).click()
  const kothrudLunch = Number(await page.getByTestId('lunch-count').textContent())
  expect(kothrudLunch).toBeLessThan(allLunch)
  await page.goto('/#/attendance')
  await expect(page.getByRole('button', { name: 'Kothrud Branch' })).toHaveClass(/active/)
})

test('attendance search filters the tap list', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/attendance')
  await page.getByTestId('meal-lunch').click()
  const before = await page.getByTestId('att-row').count()
  expect(before).toBeGreaterThan(1)
  await page.getByTestId('att-search').fill('Sonali')
  await expect(page.getByTestId('att-row')).toHaveCount(1)
  await expect(page.getByTestId('att-row')).toContainText('Sonali Pawar')
})

test('edit customer updates name and phone', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/customers')
  await page.getByTestId('customer-search').fill('Gayatri')
  await page.getByTestId('customer-row').filter({ hasText: 'Gayatri' }).click()
  await page.getByTestId('edit-customer').click()
  await page.getByTestId('edit-name').fill('Gayatri K.')
  await page.getByTestId('edit-phone').fill('9000012345')
  await page.getByTestId('save-customer').click()
  await expect(page.getByTestId('customer-name')).toHaveText('Gayatri K.')
  await expect(page.locator('.page')).toContainText('9000012345')
})

test('location can be renamed in settings', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/settings')
  await page.getByTestId('location-row').filter({ hasText: 'Kothrud Branch' }).click()
  await page.getByTestId('location-name-input').fill('Kothrud Main')
  await page.getByTestId('save-location').click()
  await expect(page.getByTestId('location-row').filter({ hasText: 'Kothrud Main' })).toBeVisible()
})

test('message modal offers renewal, dues, welcome and custom options', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/customers')
  await page.getByTestId('customer-search').fill('Pankaj')
  await page.getByTestId('customer-row').filter({ hasText: 'Pankaj' }).click()
  await page.getByTestId('open-messages').click()
  await expect(page.getByText('Renewal reminder')).toBeVisible()
  await expect(page.getByText('Dues reminder')).toBeVisible()
  await expect(page.getByText('Welcome / confirmation')).toBeVisible()
  const links = page.getByTestId('whatsapp-link')
  await expect(links.first()).toHaveAttribute('href', /wa\.me\/917620781567/)
  await page.locator('#custom-msg').fill('Custom hello')
  await expect(page.getByRole('link', { name: 'Send custom message' })).toHaveAttribute(
    'href',
    /Custom%20hello/,
  )
})

test('reports show today attendance summary and dues outstanding', async ({ page }) => {
  await openDemo(page)
  await page.goto('/#/attendance')
  await page.getByTestId('meal-lunch').click()
  await page.getByTestId('mark-present').first().click()
  await page.goto('/#/reports')
  const att = page.getByTestId('att-summary')
  await expect(att).toContainText('Lunch')
  await expect(att).toContainText('1 present')
  const dues = page.getByTestId('dues-summary')
  await expect(dues).toContainText('owe')
})
