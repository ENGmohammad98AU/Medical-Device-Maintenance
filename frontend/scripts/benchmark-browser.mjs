// Real Chromium/WASM evaluation for CI. No provider API or customer records.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {resolve, extname, relative, isAbsolute, join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const root=resolve('dist');
const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  let path=resolve(root,'.'+pathname);
  const rel=relative(root,path);
  if(rel.startsWith('..')||isAbsolute(rel)){res.writeHead(403).end();return;}
  try {
    let data;
    try{data=await readFile(path);}catch{path=resolve(root,'index.html');data=await readFile(path);}
    const mime={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json','.css':'text/css'};
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'text/html'}).end(data);
  } catch{res.writeHead(500).end();}
});
await new Promise(r=>server.listen(4174,'127.0.0.1',r));
// A regular profile matches deployment. Incognito's smaller OPFS quota can be
// less than the 1.1 GB model even when the machine has sufficient free disk.
const profile=await mkdtemp(join(tmpdir(),'qwen17-browser-'));
const context=await chromium.launchPersistentContext(profile,{headless:true});
const browser=context.browser();
const page=context.pages()[0]||await context.newPage();
page.on('console',msg=>{if(msg.text().startsWith('INFERENCE_STAGE'))console.log(msg.text());});
page.on('pageerror',error=>console.error('Browser error:',error.message));
await mkdir('benchmark-results',{recursive:true});
const lowStorage=process.argv.includes('--low-storage');
if(lowStorage) {
  const cdp=await context.newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin',{origin:'http://127.0.0.1:4174',quotaSize:128*1024*1024});
}
const kinds=process.argv.includes('--skip-classification')?['support']:['classification','support'];
try {
  if(process.argv.includes('--compare-runtimes')) {
    const measured={};
    for(const runtime of ['baseline','fast']) {
      await page.goto(`http://127.0.0.1:4174/model-upgrade-test.html?runtime=${runtime}&cpu=1`,{waitUntil:'commit'});
      await page.locator('#workflow').click();
      await page.waitForFunction(()=>/اكتمل الاختبار|فشل الاختبار/.test(document.querySelector('#status').textContent),{},{timeout:30*60_000});
      const raw=await page.locator('#output').innerText();
      assert.match(await page.locator('#status').innerText(),/اكتمل الاختبار/,raw.slice(-2000));
      const result=JSON.parse(raw);
      result.browser=browser.version();result.measured_at=new Date().toISOString();
      result.note='Same browser/CPU, identical weights/prompts. Four alternating classification/reference requests. Load/download excluded; no full-result cache.';
      await writeFile(`benchmark-results/workflow-${runtime}.json`,JSON.stringify(result,null,2)+'\n');
      console.log('WORKFLOW_BENCHMARK_RESULT='+JSON.stringify(result));
      assert.equal(result.correct,result.total,'Reference decisions must be preserved');
      assert.equal(result.isolated,true);assert.ok(result.threads>=2);
      measured[runtime]=result;
    }
    const a=measured.baseline,b=measured.fast;
    assert.deepEqual(b.rows.map(r=>[r.name,r.classification.token,r.support.token]),a.rows.map(r=>[r.name,r.classification.token,r.support.token]),'Workflow decisions changed');
    const sum=rows=>rows.reduce((n,r)=>n+r.inference_ms,0);
    const comparison={baseline_runtime:a.runtime,candidate_runtime:b.runtime,threads:b.threads,browser:b.browser,
      baseline_total_ms:sum(a.rows),candidate_total_ms:sum(b.rows),
      baseline_warm_mean_ms:sum(a.rows.slice(1))/3,candidate_warm_mean_ms:sum(b.rows.slice(1))/3};
    comparison.speedup=comparison.baseline_total_ms/comparison.candidate_total_ms;
    comparison.reduction_percent=100*(1-1/comparison.speedup);
    await writeFile('benchmark-results/runtime-comparison.json',JSON.stringify(comparison,null,2)+'\n');
    console.log('RUNTIME_COMPARISON='+JSON.stringify(comparison));
    assert.ok(comparison.speedup>1,'Do not ship a slower runtime on the controlled CPU comparison');
    assert.ok(b.rows.slice(1).every(r=>r.classification.cached_tokens>0&&r.support.cached_tokens>0),'Both prompt slots must retain their cache');
    // Continue with the already-loaded candidate; these development accuracy
    // timings are warm and must not be compared with a historical cold run.
  } else await page.goto('http://127.0.0.1:4174/model-upgrade-test.html?cpu=1',{waitUntil:'commit'});
  for(const kind of kinds) {
    await page.locator('#'+kind).click();
    await page.waitForFunction(()=>/اكتمل الاختبار|فشل الاختبار/.test(document.querySelector('#status').textContent),{},{timeout:25*60_000});
    const raw=await page.locator('#output').innerText();
    assert.match(await page.locator('#status').innerText(),/اكتمل الاختبار/,raw.slice(-2000));
    const result=JSON.parse(raw);
    const config=JSON.parse(await readFile('src/llm/localModelConfig.json','utf8'));
    const dataPath=kind==='classification'?'src/llm/benchmarkCases.json':'src/llm/supportSmokeCases.json';
    const cases=JSON.parse(await readFile(dataPath,'utf8'));
    if(lowStorage)assert.equal(result.storage_mode,'temporary','Must bypass persistent model storage');
    assert.equal(result.revision,config.revision);assert.equal(result.total,cases.length);
    assert.equal(result.isolated,true,'Service worker must enable browser isolation');
    assert.ok(result.threads>=2,'Multi-thread CPU inference must be available in CI');
    assert.deepEqual(result.rows.map(r=>[r.name,r.expected]),cases.map(r=>[r.name,r.expected]));
    result.dataset_sha256=createHash('sha256').update(await readFile(dataPath)).digest('hex');
    result.manifest_sha256=createHash('sha256').update(await readFile('src/llm/localModelConfig.json')).digest('hex');
    result.browser=browser.version();result.measured_at=new Date().toISOString();
    result.accuracy=result.rows.filter(r=>r.predicted===r.expected).length/result.total;
    if(kind==='classification') {
      const labels=Object.values(config.categories);
      result.per_class=Object.fromEntries(labels.map(label=>{
        const tp=result.rows.filter(r=>r.expected===label&&r.predicted===label).length;
        const fp=result.rows.filter(r=>r.expected!==label&&r.predicted===label).length;
        const fn=result.rows.filter(r=>r.expected===label&&r.predicted!==label).length;
        const precision=tp+fp?tp/(tp+fp):0,recall=tp+fn?tp/(tp+fn):0;
        return [label,{tp,fp,fn,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0}];
      }));
      for(const [metric,key] of [['macro_precision','precision'],['macro_recall','recall'],['macro_f1','f1']])
        result[metric]=labels.reduce((sum,l)=>sum+result.per_class[l][key],0)/labels.length;
    }
    await writeFile(`benchmark-results/${kind}.json`,JSON.stringify(result,null,2)+'\n');
    console.log('BROWSER_BENCHMARK_RESULT='+JSON.stringify(result));
    if(kind==='classification')assert.ok(result.accuracy>=36/40,'Must retain the existing 1.7B development accuracy');
    else assert.equal(result.accuracy,1,'Reference-selection smoke cases must all pass');
  }
  // Exercise the production worker and UI too, not only the benchmark harness.
  await page.goto('http://127.0.0.1:4174/local-model',{waitUntil:'commit'});
  await page.getByRole('button',{name:'تشغيل النموذج مجانًا',exact:true}).click();
  await page.getByText(/اكتمل تشغيل النموذج على هذا المتصفح/).waitFor({timeout:35*60_000});
  await page.getByText(/قرار النموذج للطلب: المرجع B/).waitFor({timeout:5000});
  assert.equal(await page.getByText(/لم يكتمل اختيار المرجع|اختلف اختيار النموذج/).count(),0);
  // A repeated production request must preserve the decision and avoid WASM
  // inference. This timing measures session reuse, not fresh model performance.
  const firstDuration=await page.getByText(/المدة بما فيها التجهيز/).innerText();
  const repeatStarted=performance.now();
  await page.getByRole('button',{name:'تشغيل النموذج مجانًا',exact:true}).click();
  await page.getByText(/أُعيد استخدام نتيجة النموذج المطابقة/).waitFor({timeout:5000});
  await page.getByText(/قرار النموذج للطلب: المرجع B/).waitFor({timeout:5000});
  const repeatedDuration=await page.getByText(/المدة بما فيها التجهيز/).innerText();
  assert.match(repeatedDuration,/0\.0/);
  const reuse={kind:'session-result-reuse', first_duration_text:firstDuration,
    repeated_duration_text:repeatedDuration, repeat_ui_ms:Math.round(performance.now()-repeatStarted)};
  await writeFile('benchmark-results/session-reuse.json',JSON.stringify(reuse,null,2)+'\n');
  console.log('SESSION_REUSE_RESULT='+JSON.stringify(reuse));
  await page.screenshot({path:'benchmark-results/browser-success.png',fullPage:true});
} catch(error) {
  await writeFile('benchmark-results/failure.txt',String(error)+'\n'+await page.locator('body').innerText());
  await page.screenshot({path:'benchmark-results/browser-failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {
  await context.close();await new Promise(r=>server.close(r));
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}
