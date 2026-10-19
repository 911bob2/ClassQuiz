// Real frontend and socket admission. Only the third-party browser SDK is mocked;
// native HTTP verification still traverses the isolated local provider service.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchBrowser } from '../ui-preview/lib/browser.mjs';

const base = 'http://127.0.0.1:18088';
const results = new URL('../stresstest/lab/results/', import.meta.url);
const fixture = JSON.parse(await fs.readFile(new URL('rust-browser-fixture.json', results), 'utf8'));
const browser = await launchBrowser();
const errors = [], passed = [];
try {
    const hc = await browser.newContext();
    await hc.addCookies([{ name: 'access_token', value: fixture.cookie, url: base, httpOnly: true, sameSite: 'Lax' }]);
    const host = await hc.newPage();
    host.on('pageerror', e => errors.push(e.message));
    host.on('dialog', d => d.accept());
    const caps = await (await host.request.get(base+'/api/v1/quiz/realtime/capabilities')).json();
    assert(caps.captcha_lab && caps.rust_captcha.site_key === 'lab-site-key');
    const provider = caps.rust_captcha.provider;
    await host.goto(base+'/dashboard');
    await host.locator('[data-ui=library-start]').first().click();
    await host.locator('[data-ui=rust-engine-toggle]').check();
    const toggle = host.locator('[data-ui=captcha-toggle]');
    assert.equal(await toggle.isDisabled(),false);
    await toggle.check();
    await host.locator('[data-ui=start-game-submit]').click();
    await host.waitForURL(/\/admin\?/);
    const pin = new URL(host.url()).searchParams.get('pin');
    await host.locator('[data-ui=host-lobby]').waitFor();
    passed.push('Rust host option exposes configured captcha and creates a protected room');

    const pc = await browser.newContext({viewport:{width:390,height:844}});
    let scripts = 0;
    await pc.route(/https:\/\/(js\.hcaptcha\.com\/1\/api\.js|www\.google\.com\/recaptcha\/api\.js)/, async route => {
        scripts++;
        if(scripts===1) return route.abort('failed');
        return route.fulfill({contentType:'application/javascript', body:`
            window.__captchaCalls=0;
            function proof(){window.__captchaCalls++;return new Promise(resolve=>setTimeout(()=>resolve((window.__captchaCalls===1?'fail:':'good:')+crypto.randomUUID()),100));}
            window.hcaptcha={render:(el,opts)=>{if(opts.sitekey!=='lab-site-key'||opts.size!=='invisible')throw Error('wrong widget config');return 7},reset:()=>{},remove:()=>{},execute:async()=>({response:await proof()})};
            window.grecaptcha={ready:cb=>cb(),execute:(key,opts)=>{if(key!=='lab-site-key'||opts.action!=='classquiz_join')throw Error('wrong google config');return proof()}};
        `});
    });
    const player = await pc.newPage();
    player.on('pageerror', e => errors.push(e.message));
    player.on('dialog', d => d.accept());
    await player.goto(base+'/play?pin='+pin);
    await player.locator('#join-username').fill('Captcha Browser');
    const join = () => player.locator('form').last().getByRole('button', {name:/join/i});
    await join().click();
    await player.getByText('Verification could not load. Please retry.',{exact:true}).waitFor();
    assert.equal(await join().isEnabled(),true);
    await join().click();
    await player.getByText('Verification was not accepted. Please retry.',{exact:true}).waitFor();
    assert.equal(await join().isEnabled(),true);
    await new Promise(resolve=>setTimeout(resolve,1100));
    await join().click();
    await host.getByText('Captcha Browser',{exact:true}).waitFor();
    assert.equal(scripts,2,'failed SDK loads can retry; successful loads are shared');
    assert.equal(await player.evaluate(()=>window.__captchaCalls),2);
    passed.push('SDK load failure and rejected token show retryable inline errors; valid retry joins without reload');
    await player.reload();
    await player.waitForTimeout(1000);
    assert.equal(scripts,2,'authenticated reconnect must not load or execute captcha SDK');
    await host.locator('[data-ui=host-start-game]').click();
    await host.locator('[data-ui=host-next-question]').click();
    await player.locator('[data-ui=player-question]').waitFor();
    await player.locator('[data-ui=player-question] button').first().click();
    await host.locator('[data-ui=host-show-results]').click();
    await host.locator('[data-ui=native-host-results]').waitFor();
    assert.equal(await host.locator('[data-ui=native-host-results] tbody tr').count(),1);
    passed.push('page refresh resumes without captcha; answer and personal results still work');
    assert.equal(errors.length,0,errors.join('\n'));
    const report={provider,passed};
    await fs.writeFile(new URL('captcha-browser-'+provider+'.json',results),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    await pc.close();
    await hc.close();
} finally {await browser.close();}
