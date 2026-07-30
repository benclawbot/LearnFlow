const TIMEOUT=7000,MAX_NOTE=2600,CONCURRENCY=3,MIN_SCORE=.34;
const BUDGETS={Quick:{queriesPerChapter:2,sourcesPerChapter:5,targetSources:3,enrichSources:1},Detailed:{queriesPerChapter:4,sourcesPerChapter:8,targetSources:5,enrichSources:2},Expert:{queriesPerChapter:6,sourcesPerChapter:10,targetSources:7,enrichSources:3}};
const GENERIC=new Set('a an and application applications analysis approach approaches code current for from in introduction making method methods of overview proper research software study the to tool tools using with'.split(' '));
const SOFTWARE=new Set('android api apk arm assembly binary bytecode compiler control data debug decompilation disassembly executable frida ghidra ida ios memory opcode program programming reverse runtime software source static symbol trace x86'.split(' '));
const UNRELATED=new Set('behavioural biology cell cognition cognitive mitochondria organelle psychology psychological therapy'.split(' '));

export const getResearchBudget=(depth='Detailed')=>BUDGETS[depth]||BUDGETS.Detailed;

export async function collectResearchPacks({topic='',selectedItems=[],options={}}={},runtime={}){
  const researchPlan={centralQuestion:topic,chapters:selectedItems.map((item,index)=>({id:`chapter-${index+1}`,title:item.label,purpose:`Investigate ${item.label} in the context of ${topic}.`,selectedTopics:[item.label],questions:[],queries:buildResearchQueries({topic,item})}))};
  const dossier=await collectDossierResearch({topic,selectedItems,researchPlan,options},runtime);
  return dossier.chapters.map((chapter,index)=>({title:selectedItems[index]?.label||chapter.title,path:selectedItems[index]?.path||[],queries:chapter.queries,fetchedAt:dossier.fetchedAt,coverage:chapter.coverage,confidence:chapter.confidence,sources:chapter.sources}));
}

export async function collectDossierResearch({topic='',selectedItems=[],researchPlan={},options={}}={},runtime={}){
  const fetchImpl=runtime.fetchImpl||globalThis.fetch;
  if(!fetchImpl)return{fetchedAt:new Date().toISOString(),overview:emptyPack('overview',topic),chapters:[],stats:{chapters:0,sourceCount:0,uniqueSourceCount:0}};
  const budget=getResearchBudget(options.depth),chapters=Array.isArray(researchPlan.chapters)?researchPlan.chapters:[];
  const overview={id:'overview',title:researchPlan.centralQuestion||topic,purpose:researchPlan.scopeSummary||`Establish context and state of knowledge for ${topic}.`,selectedTopics:uniq(selectedItems.map(i=>i.label)),questions:uniq([researchPlan.centralQuestion||topic,...(researchPlan.thesisAngles||[])]),queries:uniq([`${topic} overview`,`${topic} current state evidence`,`${topic} methods limitations`])};
  const packs=await mapConcurrent([overview,...chapters],runtime.concurrency||CONCURRENCY,chapter=>collectChapter({topic,chapter,selectedItems,fetchImpl,timeoutMs:runtime.timeoutMs||TIMEOUT,budget,jinaKey:runtime.env?.JINA_API_KEY||process.env.JINA_API_KEY||''}));
  return{fetchedAt:new Date().toISOString(),overview:packs[0]||emptyPack('overview',topic),chapters:packs.slice(1),stats:summarize(packs)};
}

export function buildResearchQueries({topic='',item={}}={}){
  const label=clean(item.label||item.title||''),path=dedupe(Array.isArray(item.path)?item.path:[]),ancestors=path.filter(p=>norm(p)!==norm(label)),context=ancestors.slice(-2).join(' '),root=clean(topic||path[0]||''),hint=domainHint([root,...path,label].join(' '));
  return dedupe([join([label,context]),join([label,hint]),join([label,context,'mechanisms workflow limitations']),join([label,root,'case study comparison'])]).filter(Boolean);
}

export function buildChapterQueries({topic='',chapter={},depth='Detailed'}={}){
  const budget=getResearchBudget(depth),selected=uniq(chapter.selectedTopics||[]),plan=uniq(chapter.queries||[]),generated=[join([chapter.title,topic,domainHint(`${topic} ${chapter.title} ${chapter.purpose||''}`)]),join([chapter.title,'mechanisms workflow limitations']),join([chapter.title,'systematic review evidence']),join([chapter.title,'case study tools comparison']),join([chapter.title,'best practices failure modes'])];
  const child=selected.filter(x=>norm(x)!==norm(chapter.title||'')).map(x=>join([x,chapter.title,topic]));
  const limit=plan.find(q=>/limit|risk|failure|tradeoff/i.test(q))||generated[4];
  return dedupe([plan[0]||generated[0],generated[1],child[0],limit,child[1],...plan.slice(1),...generated]).slice(0,budget.queriesPerChapter);
}

async function collectChapter({topic,chapter,fetchImpl,timeoutMs,budget,jinaKey}){
  const depth=budget===BUDGETS.Expert?'Expert':budget===BUDGETS.Quick?'Quick':'Detailed',queries=buildChapterQueries({topic,chapter,depth});
  const attempted=[],candidates=[];
  for(const query of queries){attempted.push(query);const results=await Promise.allSettled([wiki(query,fetchImpl,timeoutMs),ddg(query,fetchImpl,timeoutMs),ddgHtml(query,fetchImpl,timeoutMs),semantic(query,fetchImpl,timeoutMs),openAlex(query,fetchImpl,timeoutMs)]);candidates.push(...results.flatMap(r=>r.status==='fulfilled'?r.value:[]));const ranked=scoreAndFilterSources(candidates,{topic,chapter});if(ranked.length>=budget.targetSources&&avg(ranked)>=.58)break;}
  let ranked=scoreAndFilterSources(candidates,{topic,chapter});
  if(ranked.length<budget.targetSources){for(const query of [`${chapter.title} official documentation`,`${chapter.title} limitations failure modes`]){attempted.push(query);const results=await Promise.allSettled([ddgHtml(query,fetchImpl,timeoutMs),wiki(query,fetchImpl,timeoutMs),openAlex(query,fetchImpl,timeoutMs)]);candidates.push(...results.flatMap(r=>r.status==='fulfilled'?r.value:[]));}ranked=scoreAndFilterSources(candidates,{topic,chapter});}
  const top=ranked.slice(0,budget.sourcesPerChapter),enriched=await enrich(top,Math.min(budget.enrichSources,top.length),fetchImpl,timeoutMs,jinaKey),sources=enriched.map((s,i)=>({...s,id:`${slug(chapter.id||chapter.title||'chapter')}-s${i+1}`})),coverage=coverageFor(sources);
  return{id:clean(chapter.id||slug(chapter.title||'chapter')),title:clean(chapter.title||topic),purpose:clean(chapter.purpose||''),selectedTopics:uniq(chapter.selectedTopics||[]),questions:uniq(chapter.questions||[]),queries:attempted,coverage:coverage.level,confidence:coverage.confidence,sources};
}

export function scoreAndFilterSources(sources,{topic='',item=null,chapter=null}={}){const target=chapter||item||{};return uniqueSources(sources).map(s=>({...s,relevanceScore:scoreSource(s,{topic,item:target,chapter:target})})).filter(s=>s.relevanceScore>=MIN_SCORE).sort((a,b)=>b.relevanceScore-a.relevanceScore+quality(b)-quality(a));}

export function scoreSource(source,{topic='',item={},chapter=null}={}){
  const target=chapter||item||{},title=clean(target.title||target.label||''),selected=uniq(target.selectedTopics||[]),questions=uniq(target.questions||[]),targetTokens=meaningful([title,...selected,...questions].join(' ')),contextTokens=meaningful(`${topic} ${title} ${target.purpose||''}`),textValue=norm(`${source.title||''} ${source.note||''}`),tokens=new Set(tokenize(textValue)),distinct=targetTokens.filter(t=>!GENERIC.has(t)),hits=targetTokens.filter(t=>tokens.has(t)).length,contextHits=contextTokens.filter(t=>tokens.has(t)).length,phrase=[title,...selected].map(x=>norm(String(x).replace(/\banalysis\b/gi,''))).some(x=>x.length>=4&&textValue.includes(x));
  if(distinct.length&&!distinct.some(t=>tokens.has(t))&&!phrase)return 0;
  let score=(phrase?.38:0)+ratio(hits,targetTokens.length)*.38+Math.min(1,ratio(contextHits,Math.min(contextTokens.length,6)))*.14+quality(source)*.1;
  const contextSoftware=contextTokens.some(t=>SOFTWARE.has(t)),textSoftware=[...SOFTWARE].some(t=>tokens.has(t)),unrelated=[...UNRELATED].some(t=>tokens.has(t));if(contextSoftware&&unrelated&&!textSoftware)score-=.5;if(hits===0&&!phrase)score-=.2;return Math.max(0,Math.min(1,Number(score.toFixed(3))));
}

async function wiki(query,f,t){const search=await json(`https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=5&format=json&origin=*&srsearch=${encodeURIComponent(query)}`,f,t),hits=Array.isArray(search?.query?.search)?search.query.search:[],ids=hits.map(h=>h.pageid).filter(Boolean);let pages={};if(ids.length){const details=await json(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&explaintext=1&format=json&origin=*&pageids=${ids.join('|')}`,f,t);pages=details?.query?.pages||{};}return hits.map(h=>{const p=pages[h.pageid]||{},title=clean(p.title||h.title||'');return{title:title?`Wikipedia: ${title}`:'Wikipedia result',url:p.fullurl||(title?`https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ','_'))}`:'https://en.wikipedia.org'),publisher:'Wikipedia',sourceType:'encyclopedia',publishedAt:h.timestamp||'',note:truncate(p.extract||h.snippet||'',MAX_NOTE),query};}).filter(s=>s.note);}
async function ddg(query,f,t){const p=await json(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&no_redirect=1&q=${encodeURIComponent(query)}`,f,t),out=[];if(p?.AbstractText)out.push({title:p.Heading?`DuckDuckGo: ${p.Heading}`:'DuckDuckGo answer',url:p.AbstractURL||'https://duckduckgo.com',publisher:host(p.AbstractURL||'https://duckduckgo.com'),sourceType:'web summary',publishedAt:'',note:truncate(p.AbstractText,MAX_NOTE),query});for(const x of flatten(p?.RelatedTopics).slice(0,4))if(x?.Text)out.push({title:x.FirstURL?host(x.FirstURL):'DuckDuckGo result',url:x.FirstURL||'https://duckduckgo.com',publisher:host(x.FirstURL||'https://duckduckgo.com'),sourceType:'web article',publishedAt:'',note:truncate(x.Text,MAX_NOTE),query});return out;}
async function ddgHtml(query,f,t){const html=await text(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,f,t,{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'LearnFlow/3.0 deep research'}),out=[],re=/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;let m;while((m=re.exec(html))&&out.length<6){const url=decodeDdg(m[1]),title=clean(m[2]),note=truncate(m[3],MAX_NOTE);if(url&&title&&note)out.push({title,url,publisher:host(url),sourceType:webType(url,title),publishedAt:'',note,query});}return out;}
async function semantic(query,f,t){const p=await json(`https://api.semanticscholar.org/graph/v1/paper/search?limit=5&fields=title,year,abstract,url,venue&query=${encodeURIComponent(query)}`,f,t);return(Array.isArray(p?.data)?p.data:[]).map(x=>({title:`${x.title||'Semantic Scholar paper'}${x.year?` (${x.year})`:''}`,url:x.url||'https://www.semanticscholar.org',publisher:x.venue||'Semantic Scholar',sourceType:'research paper',publishedAt:x.year?String(x.year):'',note:truncate(`${x.venue?`${x.venue}: `:''}${x.abstract||''}`,MAX_NOTE),query})).filter(s=>s.note);}
async function openAlex(query,f,t){const p=await json(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=5`,f,t);return(Array.isArray(p?.results)?p.results:[]).map(x=>{const loc=x.primary_location||{};return{title:`${x.display_name||'OpenAlex work'}${x.publication_year?` (${x.publication_year})`:''}`,url:x.doi||loc.landing_page_url||x.id||'https://openalex.org',publisher:loc.source?.display_name||'OpenAlex',sourceType:'research paper',publishedAt:x.publication_date||(x.publication_year?String(x.publication_year):''),note:truncate(invert(x.abstract_inverted_index)||x.display_name||'',MAX_NOTE),query};}).filter(s=>s.note);}
async function enrich(sources,count,f,t,key){const out=sources.map(s=>({...s})),items=out.map((s,i)=>({s,i})).filter(({s})=>!['research paper','encyclopedia'].includes(s.sourceType)&&/^https?:\/\//i.test(s.url)).slice(0,count);await mapConcurrent(items,2,async({s,i})=>{const headers={Accept:'text/plain','User-Agent':'LearnFlow/3.0 deep research'};if(key)headers.Authorization=`Bearer ${key}`;const page=await text(`https://r.jina.ai/http://${s.url.replace(/^https?:\/\//i,'')}`,f,Math.max(t,9000),headers);if(clean(page).length>clean(s.note).length+200)out[i]={...s,note:truncate(page,MAX_NOTE),enriched:true};});return out;}
async function json(url,f,t){const raw=await text(url,f,t,{Accept:'application/json','User-Agent':'LearnFlow/3.0 source-grounded deep research'});try{return raw?JSON.parse(raw):{};}catch{return{};}}
async function text(url,f,t,headers={}){const c=new AbortController(),timer=setTimeout(()=>c.abort(),t);try{const r=await f(url,{headers,signal:c.signal});if(!r.ok)return'';if(typeof r.text==='function')return await r.text();if(typeof r.json==='function')return JSON.stringify(await r.json());return'';}catch{return'';}finally{clearTimeout(timer);}}

const coverageFor=s=>{if(!s.length)return{level:'insufficient',confidence:0};const confidence=Number(avg(s).toFixed(2));return{level:s.length>=5&&confidence>=.54?'good':'partial',confidence};};
const avg=s=>s.length?s.slice(0,5).reduce((n,x)=>n+Number(x.relevanceScore||0),0)/Math.min(5,s.length):0;
const quality=s=>s.sourceType==='official documentation'?1:s.sourceType==='research paper'?.96:s.sourceType==='standards or specification'?.94:s.sourceType==='encyclopedia'?.7:s.sourceType==='web summary'?.55:.62;
const webType=(url,title)=>/\.(gov|edu)$/.test(host(url))||/docs|documentation|developer|manual|reference/i.test(`${host(url)} ${title}`)?'official documentation':/ietf\.org|w3\.org|iso\.org|standards/i.test(`${host(url)} ${title}`)?'standards or specification':'web article';
function uniqueSources(sources){const seen=new Set(),out=[];for(const s of sources){const u=canonical(s.url),note=clean(s.note||''),title=clean(s.title||''),key=u||norm(title);if(!key||!note||seen.has(key))continue;seen.add(key);out.push({...s,url:s.url||'',title,note});}return out;}
function summarize(packs){const urls=new Set();let count=0;for(const p of packs)for(const s of p.sources||[]){count++;const u=canonical(s.url);if(u)urls.add(u);}return{chapters:Math.max(0,packs.length-1),sourceCount:count,uniqueSourceCount:urls.size};}
const emptyPack=(id,title)=>({id,title,purpose:'',selectedTopics:[],questions:[],queries:[],coverage:'insufficient',confidence:0,sources:[]});
function canonical(v){try{const u=new URL(String(v||'').trim());u.hash='';for(const k of[...u.searchParams.keys()])if(/^(utm_|ref$|source$)/i.test(k))u.searchParams.delete(k);return u.toString();}catch{return'';}}
function decodeDdg(v){try{const u=new URL(v,'https://duckduckgo.com');return u.searchParams.get('uddg')||u.href;}catch{return v;}}
const flatten=a=>Array.isArray(a)?a.flatMap(x=>Array.isArray(x.Topics)?flatten(x.Topics):x):[];
function invert(idx){if(!idx||typeof idx!=='object')return'';const words=[];for(const[w,pos]of Object.entries(idx))for(const i of pos||[])words[i]=w;return words.filter(Boolean).join(' ');}
const domainHint=v=>tokenize(v).some(x=>SOFTWARE.has(x))?'software engineering technical':'evidence mechanisms implications';
const meaningful=v=>[...new Set(tokenize(v).filter(x=>x.length>2&&!GENERIC.has(x)))];
const tokenize=v=>norm(v).split(' ').filter(Boolean).map(stem);
const stem=t=>t.length>5&&t.endsWith('ies')?`${t.slice(0,-3)}y`:t.length>4&&t.endsWith('s')&&!t.endsWith('ss')?t.slice(0,-1):t;
const norm=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const clean=v=>String(v||'').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const truncate=(v,n)=>{const x=clean(v);return x.length<=n?x:`${x.slice(0,n-1).trim()}…`;};
const join=a=>a.map(clean).filter(Boolean).join(' ');
function dedupe(a){const seen=new Set();return a.filter(v=>{const x=clean(v),k=norm(x);if(!k||seen.has(k))return false;seen.add(k);return true;}).map(clean);}
const uniq=a=>dedupe((Array.isArray(a)?a:[a]).map(String));
const ratio=(a,b)=>b?a/b:0;
const slug=v=>norm(v).replaceAll(' ','-').slice(0,48)||'topic';
function host(v){try{return new URL(v).hostname.replace(/^www\./,'');}catch{return'Web result';}}
async function mapConcurrent(items,n,fn){if(!items.length)return[];const out=new Array(items.length);let next=0;const workers=Array.from({length:Math.min(Math.max(n,1),items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}});await Promise.all(workers);return out;}
