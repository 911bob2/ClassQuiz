import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
import sharp from 'sharp';

const root = 'C:/Users/Denis/Documents/AntiGravity/ClassQuiz';
const skill = 'C:/Users/Denis/.codex/plugins/cache/openai-primary-runtime/presentations/26.921.10847/skills/presentations';
const build = path.join(root, 'presentation/.build');
const out = path.join(root, 'presentation/output');
const python = 'C:/Users/Denis/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const { finalizePresentation } = await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const ppt = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const C = { magenta:'#E20074', ink:'#202124', muted:'#5C626B', white:'#FFFFFF', light:'#F3F3F5', pink:'#FFE7F2' };
const FONT = 'Arial';
const revision = '711bdde7a7dcd2d217cfc75dbbbb2592a78582d3';
const base = `https://github.com/mawoka-myblock/ClassQuiz/blob/${revision}/`;
const refs = {
 project: 'https://github.com/mawoka-myblock/ClassQuiz',
 readme: base+'README.md',
 license: 'https://www.mozilla.org/en-US/MPL/2.0/',
 faq: 'https://www.mozilla.org/en-US/MPL/2.0/FAQ/',
 hosting:'https://classquiz.de/docs/self-host',
 oidc:'https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc',
 claims:'https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference',
 custom:base+'classquiz/oauth/custom.py',
 oauth:base+'classquiz/oauth/init_oauth.py',
 css:base+'frontend/src/app.css',
 layout:base+'frontend/src/routes/+layout.svelte',
 compose:base+'docker-compose.yml',
 packages:base+'frontend/package.json'
};
const content=[];
function text(s, name, value, x, y, w, h, size=28, color=C.ink, bold=false){
 const t=s.shapes.add({geometry:'textbox',name,position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 t.text=value;
 t.text.style={typeface:FONT,fontSize:size,color,bold,autoFit:'none',wrap:'square',insets:{left:0,right:0,top:0,bottom:0},verticalAlignment:'top'};
 return t;
}
function slide(title, bg=C.white){
 const s=ppt.slides.add(); s.background.fill=bg;
 const inverse=bg!==C.white && bg!==C.light;
 if(title) text(s,'title',title,70,52,1140,100,46,inverse?C.white:C.ink,true);
 text(s,'page',String(ppt.slides.items.length).padStart(2,'0'),1170,663,45,24,17,inverse?'#FFFFFF':C.muted);
 return s;
}
function para(s,name,heading,body,x,y,w,{color=C.ink,headingColor=C.magenta,size=27}={}){
 text(s,name+' heading',heading,x,y,w,44,30,headingColor,true);
 text(s,name+' body',body,x,y+51,w,135,size,color);
}
async function img(s,rel,x,y,w,h,alt){
 const p=path.join(root,rel);
 const bytes=await sharp(await fs.readFile(p)).png().toBuffer();
 s.images.add({blob:bytes,contentType:'image/png',position:{left:x,top:y,width:w,height:h},fit:'contain',alt});
}
function notes(s,{title,time,onSlide,say,sources=[],extra=''}){
 const n=`${time ? 'Suggested time: '+time+' seconds\n\n':''}${say}${extra?'\n\nDetail for questions\n'+extra:''}\n\nSources and attribution\n${sources.join('\n')}\n\nCode review scope: local checkout at ${revision}, including existing local changes. Checked 29 September 2026.`;
 s.speakerNotes.textFrame.setText(n);
 content.push({title,time,onSlide,say,sources,extra});
}

// 1. Minimal cover, with explicit open-source positioning.
{
 const s=slide(null,C.magenta);
 text(s,'title','ClassQuiz',70,127,980,122,94,C.white,true);
 text(s,'subtitle','An open-source quiz platform\nfor our company events',74,280,990,150,48,C.white);
 text(s,'context','Hackathon proposal for Deutsche Telekom',74,526,1040,44,28,C.white);
 text(s,'credit','Created by Mawoka and the ClassQuiz contributors',74,588,1030,42,23,C.white);
 notes(s,{title:'ClassQuiz',time:20,onSlide:['An open-source quiz platform for our company events','Hackathon proposal for Deutsche Telekom','Created by Mawoka and the ClassQuiz contributors'],say:'I would like to propose ClassQuiz for our internal events. It is an existing open-source project, created by Mawoka and its contributors. I found it while looking for a tool that fits our need, and we made some small interface changes for our use.',sources:[refs.project,refs.readme]});
}
// 2. Business need and honest contribution.
{
 const s=slide('The need and my contribution');
 para(s,'need','Our event need','We do not have Kahoot available.\n\nOur current alternative has been unreliable.',70,184,510);
 para(s,'contribution','What I brought to the hackathon','Found a suitable open-source project.\n\nWe simplified the UI, including removing “Why choose ClassQuiz”.',674,184,520);
 text(s,'proposal','The proposal is to evaluate ClassQuiz for an internal pilot.',70,526,1080,96,34,C.magenta,true);
 notes(s,{title:'The need and my contribution',time:35,onSlide:['We do not have Kahoot available.','Our current alternative has been unreliable.','Found a suitable open-source project.','We simplified the UI, including removing “Why choose ClassQuiz”.','The proposal is to evaluate ClassQuiz for an internal pilot.'],say:'At events, a quiz gives people an easy way to participate. We do not have Kahoot available, and our current internal alternative has been unreliable. My contribution is finding an existing solution that appears to cover the need, then helping make it more suitable for us. We removed some promotional clutter. The underlying quiz platform and its features belong to the original project.',sources:['Business need and contribution: presenter’s account in this conversation.','UI changes: local frontend/src/routes/+page.svelte and existing Git diff.',refs.project]});
}
// 3. Product workflow and a genuine source screenshot.
{
 const s=slide('A familiar live quiz experience');
 para(s,'host','1  Prepare','The host creates a quiz\nand starts a session.',70,175,350,{size:25});
 para(s,'join','2  Join','Participants open a browser\nand enter the game PIN.',70,320,350,{size:25});
 para(s,'play','3  Play','Answer questions and\nsee the results together.',70,465,350,{size:25});
 await img(s,'frontend/src/lib/assets/landing_new/select_org.webp',446,172,765,390,'Original ClassQuiz screenshot showing a live multiple-choice question');
 const demoLink=text(s,'demo link','Live demo: https://quiz.911bob.dev',446,570,755,44,30,C.magenta,true);
 demoLink.text.get('https://quiz.911bob.dev').link={uri:'https://quiz.911bob.dev',isExternal:true};
 text(s,'demo limits','Demo setup: no 2FA configured, no SMTP/email verification.',446,622,755,30,20,C.muted);
 notes(s,{title:'A familiar live quiz experience',time:50,onSlide:['1 Prepare: the host creates a quiz and starts a session.','2 Join: participants open a browser and enter the game PIN.','3 Play: answer questions and see the results together.'],say:'The flow is familiar. A host prepares a quiz and opens a session. Participants join through their browser with a game PIN, then answer questions while the host runs the event. ClassQuiz already provides a quiz editor, live play and results. This is an original project screenshot showing that experience. For a live demonstration, I would use a short quiz with our own content and show joining, one question and the result.',extra:'Optional demo: replace this explanation with a rehearsed 45–60 second demonstration. Have the quiz and host session ready before presenting. Keep this slide as the fallback. Do not claim large-event capacity or reliability from a short demo. Standard PIN-based participation is separate from host/account SSO.',sources:[refs.readme,base+'frontend/src/lib/play/join.svelte',base+'frontend/src/lib/assets/landing_new/select_org.webp']});
}
// 4. MPL scope, clearly distinguishing private use and distribution.
{
 const s=slide('MPL 2.0 permits company use');
 text(s,'permission','We can use, self-host and modify ClassQuiz\nfor internal company events.',70,164,1090,120,38,C.magenta,true);
 para(s,'internal','Within the organization','Internal modifications do not have to be published publicly.',70,328,506);
 para(s,'external','If we distribute it outside','Provide the covered source, including changes, to recipients under MPL terms.',674,328,514);
 text(s,'notice','Preserve license and copyright notices. Hosting and support still have a cost.',70,584,1100,58,24,C.muted);
 notes(s,{title:'MPL 2.0 permits company use',time:40,onSlide:['We can use, self-host and modify ClassQuiz for internal company events.','Within the organization: internal modifications do not have to be published publicly.','If we distribute it outside: provide the covered source, including changes, to recipients under MPL terms.','Preserve license and copyright notices. Hosting and support still have a cost.'],say:'ClassQuiz uses the Mozilla Public License 2.0. Mozilla explicitly allows companies to use the software and make private modifications. For use inside the organization, those changes do not need public release. If we distribute covered software outside the organization, source-sharing and notice obligations apply. This makes internal deployment possible without buying a ClassQuiz software license, while infrastructure and maintenance still need resources.',extra:'MPL is file-level copyleft. New independent files are not automatically MPL-covered. Server execution alone is not distribution, but browser-delivered HTML, CSS and JavaScript count as delivered code. External guests or a publicly accessible deployment therefore need a distribution review. Ask the company’s open-source/legal process to confirm organizational boundaries, dependencies and any external rollout. MPL does not provide trademark rights or an enterprise support commitment. Removing promotional UI is permitted, but retain source license notices. This summarizes the cited terms, not a company legal approval.',sources:[base+'LICENSE',refs.license,refs.faq+'#using-and-distributing-software-under-the-license',refs.faq+'#other-common-questions']});
}
// 5. Integration caveat visible in the main narrative.
{
 const s=slide('Entra ID sign-in needs integration work',C.ink);
 text(s,'route','The foundation exists: OpenID Connect',70,173,1100,70,37,C.white,true);
 para(s,'standard','Custom OpenID login','ClassQuiz supports it. Microsoft Entra ID uses the same standard for SSO.',70,300,512,{color:C.white,headingColor:'#FF69B4',size:27});
 para(s,'work','Adaptation and testing','This version assumes identity fields that Entra does not always guarantee.',675,300,511,{color:C.white,headingColor:'#FF69B4',size:27});
 text(s,'sso definition','SSO means using the company sign-in. It still needs IT configuration and validation.',70,564,1100,78,28,C.white);
 notes(s,{title:'Entra ID sign-in needs integration work',time:45,onSlide:['The foundation exists: OpenID Connect.','ClassQuiz supports custom OpenID login.','Microsoft Entra ID supports the same sign-in standard, including SSO.','This version needs adaptation and testing.','SSO means using the company sign-in. It still needs IT configuration and validation.'],say:'There is a useful foundation for company login. ClassQuiz has a configurable OpenID Connect integration, and Entra ID supports that standard for single sign-on. However, I would not describe this version as having ready-to-use Entra support. Its login code makes some assumptions about the identity data it receives. A developer needs to adapt those assumptions and test the flow with our tenant. IT would also register the application and decide who can access it.',extra:'Code inspection, not a tenant test: Userinfo.sub is a uuid.UUID and later uses .hex, whereas Microsoft documents sub as an opaque string. The model also requires email_verified, email and other fields, plus a refresh_token in the outer response. These are not all guaranteed by a default Entra OIDC response. Configure a tenant-specific app and validate stable identity mapping, missing claims, registration/account linking and sessions. Do not replace validation with blindly trusted email values. Entra SSO for quiz creators does not automatically restrict PIN-based participant access or every route. No internal Entra access was available for validation.',sources:[refs.hosting,refs.custom,refs.oauth,refs.oidc,refs.claims]});
}
// 6. Native, editable technology table.
{
 const s=slide('The technology in plain language');
 const values=[
 ['Part','What it does','Technology'],
 ['Browser interface','Shows the quiz editor and\nparticipant screens','SvelteKit / TypeScript\nTailwind CSS'],
 ['Quiz engine','Runs the game and exchanges\nlive answers','Python / FastAPI\nSocket.IO'],
 ['Data services','Save quizzes and accounts, hold\nsession state and search content','PostgreSQL / Valkey\nMeilisearch'],
 ['Hosting','Runs the services and serves\nimages over a secure connection','Docker Compose\nFile or S3 storage / HTTPS']
 ];
 const tb=s.tables.add({rows:5,columns:3,left:70,top:171,width:1140,height:405,columnWidths:[250,490,400],values});
 tb.borders.assign({fill:'#FFFFFF',width:0});
 for(let r=0;r<5;r++)for(let c=0;c<3;c++){
  const cell=tb.getCell(r,c);cell.fill=r===0?C.ink:(r%2?C.light:C.white);
  cell.text.style={typeface:FONT,fontSize:r===0?25:24,bold:r===0 || c===0,color:r===0?C.white:C.ink,verticalAlignment:'middle',insets:{left:14,right:14,top:12,bottom:12}};
 }
 text(s,'hosting implication','IT operates a group of services on approved company infrastructure.',70,606,1090,49,26,C.magenta,true);
 notes(s,{title:'The technology in plain language',time:35,onSlide:values.map(r=>r.join(' — ')).concat(['IT operates a group of services on approved company infrastructure.']),say:'You can think of it as a website with a game engine behind it. SvelteKit builds the screens people use. Python and FastAPI run the application, with Socket.IO keeping the quiz live. Separate services store the quizzes, hold session state and support search. Docker Compose packages the services so IT can run them together on suitable company infrastructure. Participants only need a browser.',extra:'Repository evidence: frontend/package.json, Pipfile, classquiz code and docker-compose.yml. The current local deployment uses PostgreSQL, Valkey (Redis-compatible), Meilisearch, a background worker, SeaweedFS S3-compatible storage and an Nginx gateway. Upstream also supports local file storage and uses Caddy in its example stack. Do not imply that the prototype topology is the only supported corporate architecture, or that Docker makes production operations automatic.',sources:[refs.readme,refs.packages,base+'Pipfile',refs.compose,'Local deploy/compose.yaml (prototype-specific configuration).']});
}
// 7. Real current styling, and measured scope for theming.
{
 const s=slide('A Telekom theme is feasible');
 await img(s,'frontend/src/lib/assets/landing_new/edit_org.webp',70,180,650,330,'Original ClassQuiz editor screenshot showing the existing green styling');
 text(s,'caption','Original project styling',70,532,650,36,21,C.muted);
 para(s,'easy','Basic recolor','A modest frontend task. Shared Svelte components and Tailwind/CSS styles provide a starting point.',780,177,429,{size:25});
 para(s,'finish','Complete theme','Review every screen. Some colors live in individual components. Check dark mode and contrast too.',780,385,429,{size:25});
 text(s,'meaningful colors','Magenta for branding. Keep answer and status colors meaningful.',70,612,1080,44,27,C.magenta,true);
 notes(s,{title:'A Telekom theme is feasible',time:40,onSlide:['A basic recolor is a modest frontend task.','Shared Svelte components and Tailwind/CSS styles provide a starting point.','A complete theme needs a screen review.','Some colors live in individual components. Check dark mode and contrast too.','Magenta for branding. Keep answer and status colors meaningful.'],say:'A magenta theme looks achievable. The frontend uses reusable Svelte components and shared CSS, so a developer can change the main backgrounds, navigation and buttons without rebuilding the quiz engine. It is more specific than editing a single HTML page: some colors are also set inside individual screens. A consistent result means checking the editor, host view and participant view, including dark mode. The answer colors should still help people distinguish choices and results.',extra:'Effort is an engineering assessment, not a time estimate or completed theme. Shared styles are in frontend/src/app.css, layout colors in frontend/src/routes/+layout.svelte, and shared components under frontend/src/lib. Direct utility classes and literal colors are scattered across components. The current Tailwind 4 setup uses CSS imports and utilities, so do not promise that editing the legacy tailwind.config.cjs alone will theme the app. Establish semantic brand styles, replace decorative hard-coded colors, then rebuild and review. The presentation uses a magenta-inspired design, not an official Deutsche Telekom template or an approved app rebrand.',sources:[refs.css,refs.layout,refs.packages,base+'frontend/src/lib/navbar.svelte',base+'frontend/src/lib/assets/landing_new/edit_org.webp']});
}
// 8. Deployment requirements and ownership.
{
 const s=slide('Company deployment needs an IT owner');
 para(s,'infrastructure','Infrastructure and data','Hosting, DNS/HTTPS, database, live-session and search services, S3 storage.',70,181,490);
 para(s,'identity','Identity and access','Entra application setup, integration fixes and access rules.',674,181,510);
 para(s,'operations','Operations','Secrets, backups, monitoring, updates and SMTP if email features are needed.',70,385,490);
 para(s,'pilot','Pilot validation','Test a realistic event size, reconnects and recovery.',674,385,510);
 text(s,'dependency','I need an IT partner with access to company hosting, DNS and Entra ID.',70,604,1115,52,28,C.magenta,true);
 notes(s,{title:'Company deployment needs an IT owner',time:40,onSlide:['Infrastructure: approved hosting, an internal address and HTTPS.','Identity and access: Entra application setup, integration fixes and access rules.','Operations: backups, updates, monitoring and someone to support events.','Pilot validation: test a realistic event size, reconnects and recovery.','I need an IT partner with access to company hosting, DNS and Entra ID.'],say:'The next step needs an IT owner. I do not have access to our internal hosting, DNS or Entra configuration. Someone with those permissions needs to choose the hosting, set up the address and secure connection, finish the identity integration and own ongoing operations. Because reliability is why we are looking for an alternative, the pilot needs to test the event size we actually expect, including reconnects and recovery. A working demo alone does not establish production reliability.',extra:'Docker Compose is a useful starting point. Production preparation remains a moderate integration and operations task, with effort depending on internal approvals and infrastructure. The local prototype notes do not configure external OAuth or scheduled backups. Do not imply company deployment, Entra testing or capacity testing has already happened. Keep exact public prototype addresses and credentials out of the presentation.',sources:[refs.hosting,refs.compose,'Presenter’s access constraints in this conversation.','Local deploy/README.md and deploy/compose.yaml.']});
}
// 9. Decision-focused ending.
{
 const s=slide('Proposal: one internal pilot',C.magenta);
 text(s,'pilot aim','Use one real event to decide\nwhether ClassQuiz fits.',70,181,1120,152,55,C.white,true);
 text(s,'ask','An IT partner and approved hosting\nA short quiz with a representative group\nA review of reliability and hosting effort',74,398,1100,151,31,C.white);
 text(s,'close','Build on the existing project, with clear ownership for company use.',74,604,1090,53,26,C.white);
 notes(s,{title:'Proposal: one internal pilot',time:25,onSlide:['Use one real event to decide whether ClassQuiz fits.','An IT partner and approved hosting','A short quiz with a representative group','A review of reliability and hosting effort','Build on the existing project, with clear ownership for company use.'],say:'My proposal is one internal pilot with an IT partner. We can try a short quiz with a representative group, check whether hosting is practical and see how the tool behaves during the event. If the pilot meets our needs, we can decide whether to adopt it more broadly. The value is using an existing project to solve a company problem, with clear ownership for the work that remains.',sources:['Proposed next step, not an approved plan.']});
}
// 10. Optional appendix for technical questions.
{
 const s=slide('Appendix: Entra integration details');
 para(s,'configure','Configuration already exists','Custom provider settings, discovery URL, client ID/secret and a login callback.',70,172,515,{size:25});
 para(s,'adapt','Developer review required','Subject ID format, missing identity fields, account linking and token response validation.',674,172,518,{size:25});
 para(s,'entra','IT must configure the tenant','Register the app, allow the redirect URI and apply appropriate access policy.',70,390,515,{size:25});
 para(s,'test','Acceptance checks','First sign-in and repeat sign-in, logout, denied access and player access boundaries.',674,390,518,{size:25});
 notes(s,{title:'Appendix: Entra integration details',time:null,onSlide:['Configuration already exists: custom provider settings, discovery URL, client ID/secret and a login callback.','Developer review required: subject ID format, missing identity fields, account linking and token response validation.','IT must configure the tenant: register the app, allow the redirect URI and apply appropriate access policy.','Acceptance checks: first sign-in and repeat sign-in, logout, denied access and player access boundaries.'],say:'Use only for questions. The integration path exists, but tenant compatibility has not been demonstrated.',extra:'Settings: CUSTOM_OPENID_PROVIDER__CLIENT_ID, CUSTOM_OPENID_PROVIDER__CLIENT_SECRET, CUSTOM_OPENID_PROVIDER__SERVER_METADATA_URL and CUSTOM_OPENID_PROVIDER__SCOPES. Default scopes: openid email profile. Frontend: VITE_CUSTOM_OAUTH_NAME. Callback: https://<company-host>/api/v1/users/oauth/custom/auth. A tenant-specific Microsoft v2 discovery URL is https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration. Current Python models require sub as uuid.UUID, email_verified and refresh_token. Microsoft documents sub as a string and email as not guaranteed. A standard response can fail validation. A developer must choose safe claim mapping and account lifecycle behavior. Do not assume automatic role provisioning, tenant restriction or single logout from generic OIDC support.',sources:[refs.hosting,refs.custom,refs.oauth,base+'classquiz/config.py',refs.oidc,refs.claims]});
}
// 11. Optional appendix separating permission, effort and proof.
{
 const s=slide('Appendix: likely questions');
 para(s,'free','Is it free for company use?','The MPL grants use rights without a royalty. Hosting and maintenance still cost time and money.',70,171,517,{size:25});
 para(s,'source','Must we publish our changes?','Internal changes can stay private. External distribution triggers obligations for MPL-covered code.',674,171,517,{size:25});
 para(s,'reliable','Is reliability proven for us?','No company-scale result yet. The pilot should establish our event capacity and recovery needs.',70,389,517,{size:25});
 para(s,'brand','How much work is the branding?','A basic recolor is relatively small. Consistent branding across all screens requires review.',674,389,517,{size:25});
 notes(s,{title:'Appendix: likely questions',time:null,onSlide:['Is it free for company use? The MPL grants use rights without a royalty. Hosting and maintenance still cost time and money.','Do we have to publish every change? Internal changes can stay private. External distribution triggers obligations for MPL-covered code.','Is it already proven reliable for us? No company-scale result yet. The pilot should establish our event capacity and recovery needs.','How much work is the branding? A basic recolor is relatively small. Consistent branding across all screens requires review.'],say:'Use these answers if questions come up after the pitch.',extra:'License scope: keep source notices and track local patches. External browser-delivered assets count as distribution. Independent files need not automatically become MPL-licensed. Company legal/open-source review should cover relevant entities, dependencies and external access. No total deployment cost, developer-day estimate or tested player capacity is available. Source revision and existing local deployment changes are documented in the walkthrough.',sources:[refs.license,refs.faq,refs.css,refs.layout,'Reliability and effort statements are explicit limitations/assessments, not measured results.']});
}

// Complete deployment handoff, kept outside the timed pitch.
{
 const s=slide('Appendix: company deployment checklist');
 const values=[
 ['Area','What the company team needs to provide'],
 ['Hosting and network','Approved VM or container platform, DNS, TLS/HTTPS,\nreverse proxy with WebSocket support and network rules'],
 ['Application and data','Frontend, API and worker, PostgreSQL, Valkey, Meilisearch,\npersistent data and S3-compatible storage with a bucket'],
 ['Identity and email','Entra integration and access policy, MFA policy, secrets,\nSMTP/sender setup if verification or password reset is used'],
 ['Operations','Backups and restore tests, monitoring/logs, patching,\nrelease/rollback process and a named support owner'],
 ['Company acceptance','Privacy/retention and open-source review, brand checks,\nrealistic event capacity, reconnect and recovery testing']
 ];
 const tb=s.tables.add({rows:6,columns:2,left:70,top:170,width:1140,height:430,columnWidths:[295,845],values});
 tb.borders.assign({fill:'#FFFFFF',width:0});
 for(let r=0;r<6;r++)for(let c=0;c<2;c++){
  const cell=tb.getCell(r,c);cell.fill=r===0?C.ink:(r%2?C.light:C.white);
  cell.text.style={typeface:FONT,fontSize:24,bold:r===0||c===0,color:r===0?C.white:C.ink,verticalAlignment:'middle',insets:{left:14,right:14,top:10,bottom:10}};
 }
 text(s,'optional integrations','IT selects optional external integrations and verifies supported service versions.',70,625,1090,36,23,C.muted);
 notes(s,{title:'Appendix: company deployment checklist',time:null,onSlide:values.map(v=>v.join(' — ')),say:'This is the handoff checklist for the company developer or platform team. Authentication and storage are only part of the deployment.',extra:'Core services: frontend, API, worker, PostgreSQL, Redis-compatible Valkey, Meilisearch, and persistent media storage. The company can supply managed equivalents where compatible. S3 requires an endpoint, bucket, credentials with appropriate permissions, connectivity, and a browser-accessible media URL. The local prototype has an additional S3 public-URL patch that is separate from the minimal UI fork and must be evaluated if that storage topology is reused. Configure DNS, TLS, reverse proxy routing for the app/API/Socket.IO, upload size limits and timeouts. Store application signing keys and database/storage/identity credentials outside Git. Define access for hosts and participants, including any guest policy. Add SMTP and an approved sender only if local account email verification, password resets or notifications are needed. Authenticator-based TOTP does not require SMTP. Evaluate version support and dependency updates, perform database migrations, establish backup/restore and release rollback, and assign support ownership. Optional integrations such as CAPTCHA, image search and analytics are choices, not mandatory requirements for basic quiz play.',sources:[refs.hosting,refs.compose,base+'classquiz/config.py',base+'classquiz/routers/users/twofa.py','Local deploy/README.md and deploy/compose.yaml.','Deployment requirements also include engineering recommendations for an internally operated service.']});
}
// Update the timed narrative with the presenter's running demonstration.
content[2].onSlide.push('Live demo: https://quiz.911bob.dev','Demo setup: no 2FA configured, no SMTP/email verification.');
content[2].say='I already have a demonstration running at quiz.911bob.dev. The host prepares a quiz, participants join in a browser using a game PIN, and everyone sees the results. The current demo has no 2FA configured and no SMTP service or email verification. Those are demo choices. A company developer would configure the authentication and services we want for a corporate deployment. This original ClassQuiz screenshot shows the play experience, and I can demonstrate the running site.';
content[2].extra+=' The presenter reports no 2FA configured in the demonstration. SMTP is absent and email verification is skipped in the local deployment configuration. Do not state that SMTP is required for 2FA: ClassQuiz includes authenticator-based TOTP, which does not use SMTP. The public demo is not a company deployment.';
content[2].sources.push('https://quiz.911bob.dev',base+'classquiz/routers/users/twofa.py','Demo 2FA configuration: presenter’s statement. SMTP/email-verification configuration: local deploy/README.md and deploy/compose.yaml.');
content[7].onSlide=['Infrastructure and data: hosting, DNS/HTTPS, database, live-session and search services, S3 storage.','Identity and access: Entra application setup, integration fixes and access rules.','Operations: secrets, backups, monitoring, updates and SMTP if email features are needed.','Pilot validation: test a realistic event size, reconnects and recovery.','I need an IT partner with access to company hosting, DNS and Entra ID.'];
content[7].say='The demo is already available, but company deployment needs a developer or platform team with internal permissions. Beyond authentication and an S3 storage endpoint, they need hosting, DNS and HTTPS, the database and supporting services. They also need to manage secrets, backups, monitoring and updates. Email features would need SMTP. Before wider use, we should test the event size we expect, including reconnects and recovery, and name someone to support it.';
content[7].extra=content[7].extra.replace('Keep exact public prototype addresses and credentials out of the presentation.','The public demo address is included at the presenter’s request. Credentials and private infrastructure details remain excluded. See the final appendix for the full deployment checklist.');
for(const i of [2,7]){
 const c=content[i];
 ppt.slides.items[i].speakerNotes.textFrame.setText(`Suggested time: ${c.time} seconds\n\n${c.say}\n\nDetails for questions\n${c.extra}\n\nSources\n${c.sources.join('\n')}\n\nReviewed 29 September 2026.`);
}

await fs.mkdir(out,{recursive:true});
await fs.mkdir(path.join(build,'previews'),{recursive:true});
await fs.writeFile(path.join(build,'content.json'),JSON.stringify(content,null,2));
const candidatePath=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(ppt)).save(candidatePath);
console.log('Candidate exported');
for(let i=0;i<ppt.slides.items.length;i++){
 const preview=await ppt.export({slide:ppt.slides.items[i],format:'png',scale:1});
 await fs.writeFile(path.join(build,'previews',`slide-${i+1}.png`),new Uint8Array(await preview.arrayBuffer()));
}
console.log('Previews rendered');
const result=await finalizePresentation({
 workspaceDir:root,candidatePath,finalPath:path.join(out,'ClassQuiz-hackathon-v2.pptx'),
 pythonExecutable:python,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','6','--require-native-table-slide','12'],
 requiredNativeTableOwnerSlides:[6,12],requiredNativeChartOwnerSlides:[],
 fontPolicy:{basis:'design',families:[FONT]},verifyArtifactToolImport:true,
 receiptPath:path.join(build,'validation-v2.json')
});
console.log(JSON.stringify(result,null,2));
let md='# ClassQuiz: hackathon presentation walkthrough\n\n';
md+='Present slides 1–9 in about 5½ minutes, or around 6 minutes with brief pauses. Slides 10–12 are optional Q&A and deployment material. Notes are also embedded in the PowerPoint. The deck uses an original magenta-inspired design, not an official Deutsche Telekom template.\n\nLive demo: [quiz.911bob.dev](https://quiz.911bob.dev). The presenter reports no 2FA configured. SMTP and email verification are absent in the demo setup. Authenticator-based TOTP itself does not require SMTP.\n\n';
md+='## The key fact checks\n\n';
md+='- **MPL 2.0:** permits company use, self-hosting and private modification. External distribution creates source and notice obligations for covered code. Browser-delivered code matters here.\n';
md+='- **Entra ID:** generic OpenID Connect support exists, but the inspected code needs compatibility work and a real tenant test. Do not claim direct, out-of-the-box Entra support.\n';
md+='- **Technology:** SvelteKit/TypeScript and Tailwind in the browser-facing app, Python/FastAPI and Socket.IO for quiz logic, with PostgreSQL, Valkey and Meilisearch services. Docker Compose supports deployment.\n';
md+='- **Theming:** reusable components and shared styles help. A basic recolor looks modest, but a full theme requires changes across screens and accessibility checks. This is an assessment, not a measured estimate.\n\n';
for(let i=0;i<content.length;i++){
 const c=content[i];md+=`## ${i+1}. ${c.title}${c.time?' ('+c.time+' seconds)':''}\n\n**On the slide**\n\n${c.onSlide.map(v=>'- '+v).join('\n')}\n\n**What to say**\n\n${c.say}\n\n`;
 if(c.extra)md+=`**Details for questions**\n\n${c.extra}\n\n`;
 md+=`**Evidence**\n\n${c.sources.map((v,j)=>v.startsWith('https://')?`- [Source ${j+1}](${v})`:'- '+v).join('\n')}\n\n`;
}
md+='## Presenter preparation\n\nChoose a short quiz that contains no confidential data. Rehearse host and participant views. If you demonstrate live, prepare the session first and keep slide 3 available as a fallback. Decide what event size you would want the IT team to test. End with the request for an IT partner and one pilot, rather than a promise of a finished corporate service.\n\n';
md+=`## Review scope\n\nFacts checked on 29 September 2026 against local revision ${revision}, existing local changes, Mozilla’s MPL text/FAQ, ClassQuiz self-hosting documentation and Microsoft’s OIDC/claim documentation. Existing local changes include deployment/storage work as well as UI edits. The pitch focuses on the contribution described by the presenter, and does not claim authorship of the underlying platform or that company deployment is complete. No internal Entra tenant, production load test or company approval was available.\n`;
await fs.writeFile(path.join(out,'Slide-walkthrough.md'),md);
console.log('Walkthrough written');
