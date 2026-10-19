// Real browser integration plus the repository's isolated UI regression screen.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchBrowser, renderPage } from '../ui-preview/lib/browser.mjs';

const base = 'http://127.0.0.1:18088';
const results = new URL('../stresstest/lab/results/', import.meta.url);
const fixture = JSON.parse(await fs.readFile(new URL('rust-browser-fixture.json', results), 'utf8'));
const browser = await launchBrowser();
const checks = [];
const errors = [];
const polling = process.argv.includes('--polling');
async function fallback(context) {
    if (polling) await context.addInitScript(() => { Object.defineProperty(window, 'WebSocket', {value:undefined,configurable:true}); });
}
try {
    const preview = await renderPage(browser, 'http://127.0.0.1:9999', { id: 3003 }, { viewport: 'mobile' });
    assert.equal(preview.failure, '');
    await preview.page.clock.resume();
    await preview.page.locator('[data-ui=rust-engine-toggle]').check();
    assert.equal(await preview.page.locator('[data-ui=large-audience-toggle]').isChecked(), true);
    assert.equal(await preview.page.locator('[data-ui=large-audience-toggle]').isDisabled(), true);
    assert.equal(await preview.page.locator('[data-ui=rust-learn-more]').getAttribute('href'), '/docs/large-audiences');
    await preview.page.locator('[data-ui=start-game-submit]').click();
    const requests = await preview.page.evaluate(() => window.__UIP__.fetchLog.map(r => r.url));
    assert(requests.some(url => url.includes('rust_experimental=true')));
    checks.push('mobile hosting setting enables optimized results and links to built-in docs');
    await preview.context.close();

    const hostContext = await browser.newContext();
    await fallback(hostContext);
    await hostContext.addCookies([{ name: 'access_token', value: fixture.cookie, url: base, httpOnly: true, sameSite: 'Lax' }]);
    const host = await hostContext.newPage();
    let openedWebSockets=0;
    host.on('websocket',()=>{openedWebSockets++;});
    host.on('pageerror', e => errors.push(e.message));
    host.on('dialog', d => d.accept());
    // A just-recreated frontend can briefly leave nginx with the previous IP.
    // Retry only gateway warm-up failures, before interacting with the app.
    for (let attempt=0;attempt<10;attempt++) {
        const response=await host.goto(base+'/dashboard');
        if(response?.ok() || ![502,503,504].includes(response?.status())) break;
        await new Promise(resolve=>setTimeout(resolve,1000));
    }
    try { await host.locator('[data-ui=library-start]').first().click({timeout:10000}); }
    catch(error) { console.error('Dashboard diagnostics:',host.url(),await host.locator('body').innerText(),errors); throw error; }
    await host.locator('[data-ui=rust-engine-toggle]').check();
    await host.locator('[data-ui=start-game-submit]').click();
    await host.waitForURL(/\/admin\?/);
    const pin = new URL(host.url()).searchParams.get('pin');
    await host.locator('[data-ui=host-lobby]').waitFor();
    const playerContexts = [], players = [];
    for (const name of ['Browser Alpha', 'Browser Beta']) {
        const context = await browser.newContext({ viewport: { width:390, height:844 } });
        await fallback(context);
        playerContexts.push(context);
        const player = await context.newPage();
        player.on('pageerror', e => errors.push(e.message));
        player.on('dialog', d => d.accept());
        await player.goto(base+'/play?pin='+pin);
        await player.locator('#join-username').fill(name);
        await player.locator('form').last().getByRole('button', { name: /join/i }).click();
        await host.getByText(name, { exact: true }).waitFor();
        players.push(player);
    }
    checks.push('real browser creates native room and joins through the selected endpoint');
    await host.locator('[data-ui=host-start-game]').click();
    await host.locator('[data-ui=host-next-question]').click();
    await players[0].locator('[data-ui=player-question]').waitFor();
    await players[0].locator('[data-ui=player-question] button').first().click();
    await players[0].waitForFunction(() => !Object.keys(sessionStorage).some(k => k.startsWith('quiz-pending:')));
    const killed = await (await host.request.post(base+'/__bench/kill_rust')).json();
    assert(killed.killed);
    await host.getByText(/Reconnecting to the quiz/).waitFor();
    await host.getByText(/Reconnecting to the quiz/).waitFor({state:'hidden',timeout:45000});
    await players[0].locator('[data-ui=player-question]').waitFor({timeout:45000});
    // The unanswered second player can still submit on the recovered round.
    await players[1].locator('[data-ui=player-question] button').first().click();
    await host.locator('[data-ui=host-show-results]').click({timeout:10000});
    await host.locator('[data-ui=native-host-results]').waitFor();
    assert.equal(await host.locator('[data-ui=native-host-results] tbody tr').count(),2);
    checks.push('SIGKILL automatically reconnects both browsers and restores host controls and submitted state');
    await host.locator('[data-ui=host-final-results]').click();
    await host.locator('[data-ui=host-save-results]').click();
    await host.getByText('Results saved', {exact:true}).waitFor();
    await host.locator('[data-ui=host-request-export]').click();
    await host.locator('[data-ui=host-download-export]').waitFor();
    await host.screenshot({path:new URL('rust-host-final.png',results).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
    await host.reload();
    await host.locator('[data-ui=native-host-results]').waitFor();
    assert.equal(await host.locator('[data-ui=native-host-results] tbody tr').count(),2);
    checks.push('finals, save, export and final-screen refresh work in the real host UI');
    await host.goto(base+'/docs/large-audiences');
    await host.getByRole('heading',{name:/TL;DR/}).waitFor();
    await host.locator('[data-ui=docs-nav]').waitFor();
    assert.equal(errors.length,0,errors.join('\n'));
    checks.push('built-in docs render within their normal navigation with no browser runtime errors');
    if(polling) {assert.equal(openedWebSockets,0);checks.push('entire flow and final-screen recovery pass without WebSockets');}
    for(const context of playerContexts) await context.close();
    await hostContext.close();
    const report={passed:checks};
    await fs.writeFile(new URL(polling?'rust-browser-polling-checks.json':'rust-browser-checks.json',results),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
} finally { await browser.close(); }
