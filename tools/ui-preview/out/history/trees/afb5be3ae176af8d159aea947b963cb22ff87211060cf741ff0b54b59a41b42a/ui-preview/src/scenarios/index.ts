import type { Scenario, ScenarioContext } from './types';
import { clone, quiz, quizzes, questions, user, players, questionResults, result, files, controller, activity, loginSession } from '../mocks/data';

// Lazy glob imports keep the gallery lightweight and preserve original source filenames.
const pages = import.meta.glob('../../../frontend/src/routes/**/*.{svelte,svx,md}');
const components = import.meta.glob('../../../frontend/src/lib/dashboard/start_game.svelte');
const loader = (file:string): any => {
 const key = '../../../frontend/src/'+file;
 const found = pages[key] ?? components[key];
 if (!found) throw new Error('Missing scenario source: '+file);
 return found;
};
const groups = ['','Public & docs','Account','Dashboard & library','Quiz editor','Player','Host','Results','Practice & activities'];
function page(id:number,slug:string,title:string,route:string,data:any={},extra:Partial<Scenario>={}):Scenario {
 const source = `routes${route.split('?')[0]==='/'?'':route.split('?')[0]}/+page.svelte`;
 return {id,slug,title,group:groups[Math.floor(id/1000)],route,page:loader(source),props:()=>({data:clone(data)}),sources:[source],...extra};
}
function component(id:number,slug:string,title:string,file:string,props:any,extra:Partial<Scenario>={}):Scenario {
 return {id,slug,title,group:groups[Math.floor(id/1000)],component:loader(file),props:()=>clone(props),sources:[file],...extra};
}
const account = {layouts:[loader('routes/account/+layout.svelte')],signedIn:false};
const dashboardData = {quizzes,quiztivities:[activity]};
const fileData = {images:files,storage_usage:{used:12600,limit:100000000}};
const editorLimit = 'Rich text uses the real CKEditor. Uploads are local mock fixtures; publishing is simulated.';
const activityLimit = 'Real activity components; uploads and sharing have mock responses.';
const scenarios:Scenario[] = [
 page(1001,'landing','Welcome to ClassQuiz','/',{}, {signedIn:false}),
 page(1010,'explore','Explore quizzes','/explore',{results:quizzes}),
 page(1020,'search','Search quizzes','/search'),
 page(1030,'view.quiz','Quiz overview','/view/[quiz_id]',{quiz,logged_in:true},{route:'/view/geography',params:{quiz_id:'geography'}}),
 page(1040,'user.profile','Teacher profile','/user/[user_id]',{user,quizzes},{route:'/user/preview-teacher',params:{user_id:user.id}}),
 {id:1090,slug:'error.404',title:'Page not found',group:groups[1],route:'/missing',page:loader('routes/+error.svelte'),sources:['routes/+error.svelte'],limitations:'The external cat image is replaced by a local illustration.'},
 page(2001,'login.start','Sign in','/account/login',{verified:false},account),
 ...['select-method','password','totp','backup-code'].map((name,i)=>component(2002+i,'login.'+name,['Choose sign-in method','Enter password','Enter one-time code','Enter backup code'][i],`routes/account/login/${['select_method','password_component','totp_component','backup_component'][i]}.svelte`,{session_data:loginSession,step:i>1?2:1,selected_method:null,done:false},account)),
 page(2010,'register','Create an account','/account/register',{},account),
 page(2020,'password-reset','Forgot password','/account/reset-password',{},account),
 page(2021,'password-reset.confirm','Choose a new password','/account/password-reset',{token:'preview-reset'},account),
 page(2022,'oauth.error','OAuth sign-in error','/account/oauth-error',{error:'Access was not granted. Please try another sign-in method.'},account),
 page(2030,'settings','Account settings','/account/settings'),
 page(2031,'settings.security','Account security','/account/settings/security',{}, {limitations:'Security keys require real WebAuthn hardware and a backend; account data is mocked.'}),
 page(2032,'settings.avatar','Choose an avatar','/account/settings/avatar'),
 page(2040,'controllers.list','Your controllers','/account/controllers',{controllers:[controller]}),
 page(2041,'controllers.detail','Controller settings','/account/controllers/[controller_id]',{controller},{route:'/account/controllers/controller-1',params:{controller_id:controller.id},setup:()=>{document.cookie='latest_cqc_version=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';}}),
 page(2042,'controllers.add','Add a controller','/account/controllers/add',{username:user.username}),
 page(2043,'controllers.wait','Pair a controller','/account/controllers/add/wait',{id:controller.id,code:'1234'}),
 page(3001,'dashboard','Your quiz library','/dashboard',dashboardData),
 page(3002,'dashboard.empty','An empty library','/dashboard',{quizzes:[],quiztivities:[]}),
 component(3003,'dashboard.start-game-popup','Start a game','lib/dashboard/start_game.svelte',{quiz_id:quiz.id}),
 component(3004,'dashboard.analytics','Quiz analytics','routes/dashboard/Analytics.svelte',{quiz}),
 page(3010,'files','Legacy files route','/dashboard/files',{files},{limitations:'The real legacy route only renders empty containers; use #4020 for the current file library.'}),
 page(3020,'results.list','Saved game results','/results',{results:[result,{...result,id:'class-7b',note:'Class 7B · Geography'}]}),
 page(3021,'results.empty','No saved games yet','/results',{results:[]}),
 page(3030,'import','Import a quiz','/import'),
 page(3040,'create','Create a quiz','/create',{}, {limitations:editorLimit}),
 page(3050,'moderation','Moderation queue','/moderation',{quizzes,page:'1'}),
 ...questions.map((q,i)=>page(4001+i,'editor.'+q.type.toLowerCase(),q.type+' question editor','/edit',{quiz_id:quiz.id},{fetch:{'GET /api/v1/quiz/get/*':{...clone(quiz),questions:[clone(q)]}},run:async ctx=>{await ctx.click(q.question);},limitations:editorLimit})),
 page(4010,'editor.add-question-popup','Add a question','/edit',{quiz_id:quiz.id},{run:async ctx=>{await ctx.click('button.border-r.flex-col');},limitations:editorLimit}),
 page(4011,'editor.settings','Quiz settings','/edit',{quiz_id:quiz.id},{limitations:editorLimit}),
 page(4020,'editor.files','File library','/edit/files',fileData,{limitations:'File browsing and metadata are interactive; uploading bytes to a real server is unavailable.'}),
 page(4030,'editor.videos','Video editor','/edit/videos',{}, {limitations:'Video editing requires an input file. FFmpeg encoding and remote downloads are unavailable in the preview.'}),
 page(7001,'result.overview','Game overview','/results/[result_id]',{results:result},{route:'/results/class-7a',params:{result_id:result.id}}),
 page(7002,'result.players','Player results','/results/[result_id]',{results:result},{route:'/results/class-7a',params:{result_id:result.id},run:ctx=>ctx.click('.justify-around > div:nth-child(2) button').then(()=>{})}),
 page(7003,'result.questions','Question results','/results/[result_id]',{results:result},{route:'/results/class-7a',params:{result_id:result.id},run:ctx=>ctx.click('.justify-around > div:nth-child(3) button').then(()=>{})}),
 page(8001,'practice.title','Practice introduction','/practice?quiz_id=geography'),
 ...questions.filter(q=>!['VOTING','SLIDE'].includes(q.type)).map((q,i)=>page(8002+i,'practice.question.'+q.type.toLowerCase(),'Practice · '+q.type,'/practice?quiz_id=geography',{}, {fetch:{'GET /api/v1/quiz/get/public/*':{...clone(quiz),questions:[clone(q)]}},run:ctx=>ctx.click('button.justify-end').then(()=>{})})),
 page(8010,'quiztivity.create','Create an activity','/quiztivity/create',{}, {limitations:activityLimit}),
 page(8011,'quiztivity.edit','Edit an activity','/quiztivity/edit',{quiztivity:activity},{limitations:activityLimit}),
 ...activity.pages.map((p,i)=>page(8012+i,'quiztivity.play.'+p.type.toLowerCase(),'Activity · '+p.type,'/quiztivity/play',{quiztivity:{...clone(activity),pages:[p]}})),
 page(8020,'remote','Remote game controls','/remote?game_pin=12345678&game_id=preview-game',{}, {run:async ctx=>{ctx.socket.fire('registered_as_admin',{game:JSON.stringify(quiz)});await ctx.tick();ctx.socket.fire('control_visibility',{visible:true});},onEmit:(event,args,s)=>{if(event==='start_game')s.fire('start_game');if(event==='set_question_number')s.fire('set_question_number',{question_index:Number(args[0])});if(event==='get_question_results')s.fire('question_results',JSON.stringify(questionResults));}}),
 page(8030,'controller','ClassQuiz Controller','/controller')
];

const docs = ['','attribution','develop','import-from-kahoot','pow','privacy-policy','roadmap','self-host','tos'];
docs.forEach((name,i)=>scenarios.push(page(1100+i,'docs.'+(name||'index'),name?name.replaceAll('-',' '):'Documentation','/docs'+(name?'/'+name:''),{}, {layouts:[loader('routes/docs/+layout.svelte')]})));
// Include markdown documentation routes, retaining a stable sorted ID allocation.
Object.keys(pages).filter(p=>/routes\/docs\/.*\+page\.(md|svx)$/.test(p)).sort().forEach((p,i)=>{
 const route=p.split('/routes')[1].replace('/(markdown)','').replace(/\/\+page\.(md|svx)$/,'');
 scenarios.push({id:1120+i,slug:'docs.'+route.split('/').pop(),title:route.split('/').pop()!.replaceAll('-',' '),group:groups[1],route,page:pages[p] as any,layouts:[loader('routes/docs/+layout.svelte'),loader('routes/docs/(markdown)/+layout.svelte')],sources:[p.split('frontend/src/')[1]]});
});

async function joinPlayer(ctx:ScenarioContext,q?:any) {
 ctx.socket.fire('joined_game',clone(quiz)); await ctx.tick();
 if (q) {ctx.socket.fire('start_game'); await ctx.tick(); ctx.socket.fire('set_question_number',{question:clone(q),question_index:0}); await ctx.tick();}
}
const play = (id:number,slug:string,title:string,run?:Scenario['run'])=>page(id,slug,title,'/play',{game_pin:'12345678'},{run,onEmit:(event,args,s)=>{if(event==='join_game')s.fire('joined_game',clone(quiz));}});
scenarios.push(play(5001,'play.join','Join a game'),play(5002,'play.title','Waiting for the host',ctx=>joinPlayer(ctx)));
questions.forEach((q,i)=>scenarios.push({...play(5003+i,'play.question.'+q.type.toLowerCase(),'Player · '+q.type,ctx=>joinPlayer(ctx,q)),...(q.type==='SLIDE'?{allowBlank:true,limitations:'The real player component has no SLIDE branch and renders an empty screen. Slides are shown on the host (#6016).'}:{})}));
scenarios.push(play(5020,'play.answered-waiting','Answer submitted',async ctx=>{await joinPlayer(ctx,questions[0]);await ctx.click('#app button');}),play(5021,'play.results','Question leaderboard',async ctx=>{await joinPlayer(ctx,questions[0]);ctx.socket.fire('question_results',clone(questionResults));}),play(5030,'play.final','Final leaderboard',async ctx=>{await joinPlayer(ctx,questions[0]);ctx.socket.fire('question_results',clone(questionResults));await ctx.tick();ctx.socket.fire('final_results',[questionResults]);}));

function host(id:number,slug:string,title:string,q?:any,count=8,end?:string):Scenario {
 const game = clone({...quiz,questions:q?[q,...questions]:questions});
 return page(id,slug,title,'/admin?pin=12345678&token=preview-game&connect=1&cqc_code=1234',{game_pin:'12345678',game_token:'preview-game',auto_connect:true},{
  run:async ctx=>{ctx.socket.fire('registered_as_admin',{game:JSON.stringify(game)});await ctx.tick();for(const p of players.slice(0,count))ctx.socket.fire('player_joined',p);await ctx.tick();if(q){ctx.socket.fire('start_game');await ctx.tick();ctx.socket.fire('set_question_number',{question_index:0,question:q});await ctx.tick();if(end){ctx.socket.fire('question_results',clone(questionResults));await ctx.tick();if(end==='final')ctx.socket.fire('final_results',[questionResults]);}}},
  onEmit:(event,args,s)=>{if(event==='start_game')s.fire('start_game');if(event==='set_question_number')s.fire('set_question_number',{question_index:Number(args[0]),question:game.questions[Number(args[0])]});if(event==='show_solutions')s.fire('solutions',{});if(event==='get_question_results')s.fire('question_results',clone(questionResults));if(event==='get_final_results')s.fire('final_results',[questionResults]);}
 });
}
scenarios.push(host(6001,'host.lobby.empty','Waiting for players',undefined,0),host(6002,'host.lobby.players','A classroom is joining',undefined,24),host(6003,'host.lobby.full','A busy classroom',undefined,60));
questions.forEach((q,i)=>scenarios.push(host(6010+i,'host.question.'+q.type.toLowerCase(),'Host · '+q.type,q)));
scenarios.push(host(6020,'host.question-results','Host · question results',questions[0],8,'results'),host(6021,'host.voting-results','Host · voting results',questions[2],8,'results'),host(6030,'host.final','Host · final results',questions[0],8,'final'),host(6040,'host.controls','Host · game controls',questions[0]));

scenarios.sort((a,b)=>a.id-b.id);
for(const field of ['id','slug'] as const) if(new Set(scenarios.map(s=>s[field])).size!==scenarios.length) throw new Error('Duplicate scenario '+field);
export { scenarios };
export const findScenario = (key:string|number) => scenarios.find(s=>String(s.id)===String(key).replace(/^#/,'')||s.slug===key);
export const manifest = () => scenarios.map(({id,slug,title,group,route,sources,limitations,allowBlank})=>({id,slug,title,group,route,sources,limitations,allowBlank}));
