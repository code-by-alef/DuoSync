const baseSelect=document.getElementById('baseTab');
const overlaySelect=document.getElementById('overlayTab');
const baseVideo=document.getElementById('baseVideo');
const overlayVideo=document.getElementById('overlayVideo');
const overlayBox=document.getElementById('overlayBox');
const empty=document.getElementById('empty');
const status=document.getElementById('status');
const startButton=document.getElementById('start');
const directButton=document.getElementById('direct');
const stopButton=document.getElementById('stop');
const showOverlay=document.getElementById('showOverlay');
const muteOverlay=document.getElementById('muteOverlay');
const syncNowButton=document.getElementById('syncNow');
const baseSyncTimeInput=document.getElementById('baseSyncTime');
const overlaySyncTimeInput=document.getElementById('overlaySyncTime');
const keepSyncedInput=document.getElementById('keepSynced');
const stage=document.getElementById('stage');
const fullscreenButton=document.getElementById('fullscreen');
const playerControls=document.getElementById('playerControls');
const playerPlayButton=document.getElementById('playerPlay');
const exitFullscreenButton=document.getElementById('exitFullscreen');
const seekBackButton=document.getElementById('seekBack');
const seekForwardButton=document.getElementById('seekForward');
const speedSelect=document.getElementById('speed');
const baseVolume=document.getElementById('baseVolume');
const overlayVolume=document.getElementById('overlayVolume');
const overlayOpacity=document.getElementById('overlayOpacity');
const controlSpeedLabel=document.getElementById('controlSpeedLabel');
const fitMode=document.getElementById('fitMode'); const fitModeMenu=document.getElementById('fitModeMenu');
const settingsToggle=document.getElementById('settingsToggle'); const settingsMenu=document.getElementById('settingsMenu');
const playGlyph=document.getElementById('playGlyph'); const pauseGlyph=document.getElementById('pauseGlyph');
let controlsHideTimer=null; let spaceBoost=false; let chosenSpeed=1; let sourcePaused=true;
let tabs=[]; let streams=[]; let syncTimer=null; let syncBusy=false;
const isWebUrl=url=>/^https?:\/\//i.test(url||'');
async function refreshTabs(){
  tabs=(await chrome.tabs.query({})).filter(t=>isWebUrl(t.url));
  for(const select of [baseSelect,overlaySelect]){
    const previous=select.value;select.replaceChildren();
    tabs.forEach(tab=>{const option=document.createElement('option');option.value=String(tab.id);let host='';try{host=new URL(tab.url).hostname}catch{}option.textContent=`${tab.title||tab.url} — ${host}`;select.append(option)});
    if(tabs.some(t=>String(t.id)===previous))select.value=previous;
  }
  if(tabs.length>1&&baseSelect.value===overlaySelect.value)overlaySelect.selectedIndex=1;
  status.textContent=`${tabs.length} HTTP(S) tabs found. Select the two tabs that are already playing videos.`;
}
async function requestStreamId(tabId){
  const response=await chrome.runtime.sendMessage({type:'GET_CAPTURE_ID',targetTabId:tabId});
  if(!response?.ok)throw new Error(response?.error||'The browser did not provide a capture ID.');
  return response.streamId;
}
async function streamFromId(streamId){
  return navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId}},video:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:streamId,maxWidth:1280,maxHeight:720,maxFrameRate:24}}});
}
async function tryDirectVideo(){
  const a=Number(baseSelect.value),b=Number(overlaySelect.value);
  if(!Number.isInteger(a)||!Number.isInteger(b)||a===b){status.textContent='Choose two different tabs.';return}
  directButton.disabled=true;status.textContent='Inspecionando os players das duas abas…';
  try{
    const inspect=async tabId=>{
      // Inspect every frame the extension is allowed to access. Cross-origin frames may be
      // inaccessible; failures are reported rather than silently treated as no video.
      const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>{
        const vids=[...document.querySelectorAll('video')];
        const v=vids.sort((x,y)=>(y.videoWidth*y.videoHeight)-(x.videoWidth*x.videoHeight))[0];
        return {frameUrl:location.href, videoCount:vids.length, video:v?{src:v.currentSrc||v.src||'',paused:v.paused,readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,kind:(v.currentSrc||v.src||'').startsWith('blob:')?'blob':(v.currentSrc||v.src||'').startsWith('mediasource:')?'mediasource':(v.currentSrc||v.src||'').split('?')[0].split('.').pop().toLowerCase()}:null};
      }});
      const frames=(results||[]).map(r=>r.result).filter(Boolean);
      const videos=frames.filter(f=>f.video).sort((x,y)=>(y.video.width*y.video.height)-(x.video.width*x.video.height));
      return {video:videos[0]?.video||null, videoCount:frames.reduce((n,f)=>n+f.videoCount,0), frames:frames.length, frameVideos:videos.length};
    };
    const [infoA,infoB]=await Promise.all([inspect(a),inspect(b)]);
    if(!infoA.video||!infoB.video){status.textContent=`Could not find an accessible video on every site. Base: ${infoA.videoCount} video(s) in ${infoA.frames} frame(s); overlay: ${infoB.videoCount} video(s) in ${infoB.frames} frame(s). Some frames may be protected or inaccessible. The fallback service worker is registered; try it.`;return}
    const sourceA=infoA.video.src, sourceB=infoB.video.src;
    if(!sourceA||!sourceB||sourceA.startsWith('blob:')||sourceB.startsWith('blob:')||sourceA.startsWith('mediasource:')||sourceB.startsWith('mediasource:')){
      status.textContent=`Players found (${infoA.video.width}×${infoA.video.height} and ${infoB.video.width}×${infoB.video.height}), but at least one source is blob/MediaSource or does not expose a direct URL. Frames checked: ${infoA.frames} and ${infoB.frames}. Try the tabCapture fallback.`;return;
    }
    // Direct URL playback is only a viability test; cross-origin/CORS or HLS can still prevent playback.
    baseVideo.src=sourceA;overlayVideo.src=sourceB;baseVideo.srcObject=null;overlayVideo.srcObject=null;
    baseVideo.muted=false;overlayVideo.muted=muteOverlay.checked;
    baseVideo.style.display='block';overlayBox.style.display=showOverlay.checked?'block':'none';empty.style.display='none';
    await Promise.all([baseVideo.play().catch(()=>{}),overlayVideo.play().catch(()=>{})]);
    stopButton.disabled=false;status.textContent='Fontes diretas encontradas. Verifique se ambos reproduzem; se houver erro de origem, HLS ou CORS, use o fallback tabCapture.';
  }catch(err){status.textContent=`Could not access the player directly: ${err?.message||err}. This may be a page restriction; try the tabCapture fallback.`}
  finally{directButton.disabled=false}
}
async function inspectSourceTab(tabId, action='state', value=null){
  const results=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:(command,arg)=>{
    const videos=[...document.querySelectorAll('video')];
    const v=videos.sort((x,y)=>(y.videoWidth*y.videoHeight)-(x.videoWidth*x.videoHeight))[0];
    if(!v)return {found:false,href:location.href};
    try{
      if(command==='seek' && Number.isFinite(arg) && Number.isFinite(v.duration)) v.currentTime=Math.max(0,Math.min(arg,Number.isFinite(v.duration)?Math.max(0,v.duration-0.15):arg));
      if(command==='seek-relative' && Number.isFinite(arg)) v.currentTime=Math.max(0,Math.min(Number.isFinite(v.duration)?Math.max(0,v.duration-0.15):Infinity,v.currentTime+arg));
      if(command==='play') { const p=v.play(); if(p&&p.catch)p.catch(()=>{}); }
      if(command==='pause') v.pause();
      if(command==='speed' && Number.isFinite(arg)) v.playbackRate=arg;
    }catch(e){return {found:true,error:String(e),time:v.currentTime,paused:v.paused,area:v.videoWidth*v.videoHeight};}
    return {found:true,time:v.currentTime,paused:v.paused,ended:v.ended,playbackRate:v.playbackRate,readyState:v.readyState,duration:Number.isFinite(v.duration)?v.duration:null,area:v.videoWidth*v.videoHeight,href:location.href};
  },args:[action,value]});
  const found=(results||[]).map(r=>r.result).filter(r=>r&&r.found).sort((x,y)=>(y.area||0)-(x.area||0));
  if(!found.length)throw new Error(`No accessible video element in tab ${tabId}.`);
  if(found[0].error)throw new Error(found[0].error);
  return found[0];
}
function selectedTabIds(){return {base:Number(baseSelect.value),overlay:Number(overlaySelect.value)}}
function parseTimecode(raw){
  const value=String(raw||'').trim();
  // Accept mm:ss or hh:mm:ss; seconds may be decimal.
  const parts=value.split(':');
  if(parts.length<2||parts.length>3||parts.some(part=>part.trim()===''))return null;
  if(!parts.every(part=>/^\d+(?:\.\d+)?$/.test(part.trim())))return null;
  const nums=parts.map(Number);
  if(nums.slice(1).some(n=>n>=60))return null;
  return parts.length===2?nums[0]*60+nums[1]:nums[0]*3600+nums[1]*60+nums[2];
}
async function syncSources(automatic=false){
  if(syncBusy)return; const {base,overlay}=selectedTabIds();
  if(!Number.isInteger(base)||!Number.isInteger(overlay)||base===overlay)return;
  const baseTarget=parseTimecode(baseSyncTimeInput.value);
  const overlayTarget=parseTimecode(overlaySyncTimeInput.value);
  if(baseTarget===null||overlayTarget===null){if(!automatic)status.textContent='Informe os dois tempos no formato mm:ss (ex.: 2:20 and 4:43).';return}
  syncBusy=true;
  try{
    const [a,b]=await Promise.all([inspectSourceTab(base,'state'),inspectSourceTab(overlay,'state')]);
    const offset=overlayTarget-baseTarget;
    const target=Math.max(0,a.time+offset);
    if(!automatic){
      await Promise.all([inspectSourceTab(base,'seek',baseTarget),inspectSourceTab(overlay,'seek',overlayTarget)]);
    }else if(!a.ended && !b.ended && Math.abs(b.time-target)>1.1){
      await inspectSourceTab(overlay,'seek',target);
    }
    // When either source has ended, do not let auto-sync rewind or pause the longer video.
    if(!automatic && a.paused!==b.paused) await inspectSourceTab(overlay,a.paused?'pause':'play');
    if(!automatic) status.textContent=`Sync points set: base at ${baseSyncTimeInput.value} (${baseTarget.toFixed(1)} s) and overlay at ${overlaySyncTimeInput.value} (${overlayTarget.toFixed(1)} s). Automatic synchronization will maintain this offset.`;
  }catch(err){if(!automatic)status.textContent=`Could not synchronize the source players: ${err.message||err}. Some players may block seeking or playback.`}
  finally{syncBusy=false}
}
async function toggleSourcePlayback(){
  const {base,overlay}=selectedTabIds();
  try{
    const state=await inspectSourceTab(base,'state');
    const action=state.paused?'play':'pause';
    await Promise.all([inspectSourceTab(base,action),inspectSourceTab(overlay,action)]);
    sourcePaused=action==='pause';
    updatePlayerButton();
    showCenterFeedback(sourcePaused);
    showControls();
  }catch(err){status.textContent=`Could not control both players: ${err.message||err}`}
}
function updateSyncTimer(){
  if(syncTimer){clearInterval(syncTimer);syncTimer=null}
  if(keepSyncedInput.checked && streams.length>=2)syncTimer=setInterval(()=>syncSources(true),1500);
}
async function startCapture(){
  const a=Number(baseSelect.value),b=Number(overlaySelect.value);
  if(!Number.isInteger(a)||!Number.isInteger(b)||a===b){status.textContent='Choose two different tabs.';return}
  startButton.disabled=true;
  stopAll();
  status.textContent='Checking authorization for both tabs…';
  try{
    const auth=await chrome.runtime.sendMessage({type:'GET_AUTHORIZED_TABS'});
    const authorized=new Set(auth?.tabIds||[]);
    const missing=[{id:a,label:'Base'},{id:b,label:'Sobreposto'}].filter(x=>!authorized.has(x.id));
    if(missing.length) throw new Error(`Authorize the following tab(s) first: ${missing.map(x=>x.label).join(' and ')}: open each tab, click the DuoSync Final icon, and choose “Authorize this tab for capture”.`);

    // Show the two output slots before capture starts, so a successful second stream
    // cannot remain hidden behind the empty state or a stale overlay display style.
    empty.style.display='none';
    baseVideo.style.display='block';
    overlayBox.style.display=showOverlay.checked?'block':'none';
    overlayVideo.style.display='block';
    baseVideo.srcObject=null; overlayVideo.srcObject=null;
    baseVideo.muted=false; overlayVideo.muted=muteOverlay.checked;

    status.textContent='Capturing base tab…';
    const idA=await requestStreamId(a);
    const streamA=await streamFromId(idA);
    streams.push(streamA);
    baseVideo.srcObject=streamA;
    baseVideo.muted=false;
    await baseVideo.play();
    await new Promise(resolve=>{
      if(baseVideo.readyState>=1) return resolve();
      const done=()=>{baseVideo.removeEventListener('loadedmetadata',done);baseVideo.removeEventListener('error',done);resolve()};
      baseVideo.addEventListener('loadedmetadata',done,{once:true});baseVideo.addEventListener('error',done,{once:true});
      setTimeout(done,2500);
    });

    status.textContent='Base tab active. Capturing overlay tab…';
    const idB=await requestStreamId(b);
    const streamB=await streamFromId(idB);
    streams.push(streamB);
    overlayVideo.srcObject=streamB;
    overlayVideo.muted=muteOverlay.checked;
    try { await overlayVideo.play(); } catch (playErr) {
      // If unmuted autoplay is blocked, start the video muted and let the user enable audio.
      overlayVideo.muted=true; muteOverlay.checked=true;
      await overlayVideo.play();
      status.textContent='The browser blocked autoplay with audio; the overlay started muted. Uncheck “Mute overlay audio” to hear it.';
    }
    await new Promise(resolve=>{
      if(overlayVideo.readyState>=1) return resolve();
      const done=()=>{overlayVideo.removeEventListener('loadedmetadata',done);overlayVideo.removeEventListener('error',done);resolve()};
      overlayVideo.addEventListener('loadedmetadata',done,{once:true});overlayVideo.addEventListener('error',done,{once:true});
      setTimeout(done,2500);
    });
    stopButton.disabled=false; syncNowButton.disabled=false; updateSyncTimer();
    updatePlayerButton(); applyVolumes(); applySpeed(chosenSpeed);
    status.textContent=`Capture active: base ${baseVideo.videoWidth}×${baseVideo.videoHeight} (${streamA.getAudioTracks().length} audio track(s)); overlay ${overlayVideo.videoWidth}×${overlayVideo.videoHeight} (${streamB.getAudioTracks().length} audio track(s)). Overlay audio ${overlayVideo.muted?'muted':'enabled'}. Use “Sync now” to align the original players.`;
  }catch(err){
    const message=err?.message||String(err);
    // Preserve a working base stream if the overlay stream alone fails, and report
    // exactly which stage was reached to avoid masking a successful first capture.
    const baseOk=!!baseVideo.srcObject;
    const overlayOk=!!overlayVideo.srcObject;
    stopButton.disabled=!(baseOk||overlayOk); syncNowButton.disabled=!(baseOk&&overlayOk);
    if(!baseOk&&!overlayOk){baseVideo.style.display='none';overlayBox.style.display='none';empty.style.display='grid'}
    const failedStage=baseOk&&!overlayOk?'the overlay tab':!baseOk?'the base tab':'the playback stage';
    status.textContent=`Failure in ${failedStage}: ${message}. Current state — base: ${baseOk?'stream attached':'no stream'} ; overlay: ${overlayOk?'stream attached':'no stream'}.`;
  }finally{startButton.disabled=false}
}
function stopAll(){
  if(syncTimer){clearInterval(syncTimer);syncTimer=null}
  syncNowButton.disabled=true;
  for(const stream of streams){for(const track of stream.getTracks())track.stop()};streams=[];
  for(const video of [baseVideo,overlayVideo]){video.pause();video.srcObject=null;video.removeAttribute('src');video.load();video.style.display='none'}
  overlayBox.style.display='none';empty.style.display='grid';stopButton.disabled=true;
}
document.getElementById('refresh').addEventListener('click',refreshTabs);
function applyVolumes(){baseVideo.volume=Number(baseVolume.value);overlayVideo.volume=Number(overlayVolume.value)}
function applyOverlayOpacity(){overlayBox.style.opacity=String(Number(overlayOpacity.value))}
async function applySpeed(rate){controlSpeedLabel.textContent=`${rate.toLocaleString('en',{maximumFractionDigits:2})}×`;if(speedSelect.value!==String(rate))speedSelect.value=String(rate);const {base,overlay}=selectedTabIds();const tasks=[];if(Number.isInteger(base))tasks.push(inspectSourceTab(base,'speed',rate));if(Number.isInteger(overlay)&&overlay!==base)tasks.push(inspectSourceTab(overlay,'speed',rate));await Promise.allSettled(tasks)}
function updatePlayerButton(){const paused=sourcePaused;playGlyph.hidden=!paused;pauseGlyph.hidden=paused;playerPlayButton.classList.toggle('is-paused',paused);playerPlayButton.classList.toggle('is-playing',!paused);playerPlayButton.setAttribute('aria-label',paused?'Play':'Pause');playerPlayButton.title=paused?'Play (K / Space)':'Pause (K / Space)'}
function showCenterFeedback(paused){const el=document.getElementById('centerFeedback');if(!el)return;el.innerHTML=paused?`<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></svg>`:`<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>`;el.dataset.action=paused?'pause':'play';el.classList.remove('show');void el.offsetWidth;el.classList.add('show');clearTimeout(el._hideTimer);el._hideTimer=setTimeout(()=>el.classList.remove('show'),720)}
async function seekBoth(delta){const {base,overlay}=selectedTabIds();await Promise.allSettled([inspectSourceTab(base,'seek-relative',delta),inspectSourceTab(overlay,'seek-relative',delta)]);status.textContent=delta<0?'Going back 10 seconds.':'Going forward 10 seconds.'}
function showControls(){stage.classList.remove('idle-playing');stage.classList.add('controls-active');playerControls.classList.add('visible');if(controlsHideTimer)clearTimeout(controlsHideTimer);if(!baseVideo.paused){controlsHideTimer=setTimeout(()=>{stage.classList.remove('controls-active');stage.classList.add('idle-playing');playerControls.classList.remove('visible')},2200)}}
stage.addEventListener('mousemove',showControls);stage.addEventListener('pointermove',showControls);stage.addEventListener('mouseleave',()=>{if(!baseVideo.paused){stage.classList.remove('controls-active');stage.classList.add('idle-playing');playerControls.classList.remove('visible')}});
playerPlayButton.addEventListener('click',toggleSourcePlayback);seekBackButton.addEventListener('click',()=>seekBoth(-10));seekForwardButton.addEventListener('click',()=>seekBoth(10));exitFullscreenButton.addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})});speedSelect.addEventListener('change',()=>{chosenSpeed=Number(speedSelect.value);applySpeed(chosenSpeed)});baseVolume.addEventListener('input',applyVolumes);overlayVolume.addEventListener('input',applyVolumes);overlayOpacity.addEventListener('input',applyOverlayOpacity);
baseVideo.addEventListener('play',()=>{sourcePaused=false;updatePlayerButton();showControls()});baseVideo.addEventListener('pause',()=>{sourcePaused=true;updatePlayerButton();stage.classList.remove('idle-playing');stage.classList.add('controls-active');playerControls.classList.add('visible')});
stage.addEventListener('click',e=>{if(e.target===stage||e.target===baseVideo||e.target===empty){if(baseVideo.srcObject||baseVideo.currentSrc)toggleSourcePlayback()}});
startButton.addEventListener('click',startCapture);
directButton.addEventListener('click',tryDirectVideo);
stopButton.addEventListener('click',()=>{stopAll();status.textContent='Capture stopped.'});
showOverlay.addEventListener('change',()=>overlayBox.style.display=streams.length&&showOverlay.checked?'block':'none');
muteOverlay.addEventListener('change',()=>{overlayVideo.muted=muteOverlay.checked; if(!muteOverlay.checked && overlayVideo.srcObject){overlayVideo.play().catch(()=>{status.textContent='Audio enabled, but the browser blocked playback. Click the video or Play to enable audio.'})}});
syncNowButton.addEventListener('click',()=>syncSources(false));
keepSyncedInput.addEventListener('change',updateSyncTimer);
let drag=null;
overlayVideo.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,left:overlayBox.offsetLeft,top:overlayBox.offsetTop,moved:false};overlayVideo.setPointerCapture(e.pointerId)});
overlayVideo.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;if(!drag.moved)return;overlayBox.style.left=Math.max(0,Math.min(stage.clientWidth-overlayBox.offsetWidth,drag.left+dx))+'px';overlayBox.style.top=Math.max(0,Math.min(stage.clientHeight-overlayBox.offsetHeight,drag.top+dy))+'px';overlayBox.style.right='auto'});
overlayVideo.addEventListener('pointerup',()=>drag=null);overlayVideo.addEventListener('pointercancel',()=>drag=null);
fullscreenButton.addEventListener('click',async()=>{try{if(document.fullscreenElement){await document.exitFullscreen()}else{await stage.requestFullscreen()} }catch(err){status.textContent=`Could not enter fullscreen: ${err.message||err}`}});
document.addEventListener('fullscreenchange',()=>{const active=document.fullscreenElement===stage;fullscreenButton.textContent=active?'Exit fullscreen':'Fullscreen';exitFullscreenButton.style.display=active?'inline-flex':'none';showControls()});
exitFullscreenButton.style.display='none';
const statusObserver=new MutationObserver(()=>{if(!status.textContent.trim())return;status.classList.add('visible');clearTimeout(status._hideTimer);status._hideTimer=setTimeout(()=>status.classList.remove('visible'),4200)});statusObserver.observe(status,{childList:true,characterData:true,subtree:true});
let resize=null;const resizeHandle=document.getElementById('resizeHandle');resizeHandle.addEventListener('pointerdown',e=>{e.preventDefault();resize={x:e.clientX,y:e.clientY,w:overlayBox.offsetWidth,h:overlayBox.offsetHeight};resizeHandle.setPointerCapture(e.pointerId)});resizeHandle.addEventListener('pointermove',e=>{if(!resize)return;overlayBox.style.width=Math.max(240,resize.w+e.clientX-resize.x)+'px';overlayBox.style.height=Math.max(160,resize.h+e.clientY-resize.y)+'px'});resizeHandle.addEventListener('pointerup',()=>resize=null);resizeHandle.addEventListener('pointercancel',()=>resize=null);
document.addEventListener('keydown',async e=>{if(e.ctrlKey||e.altKey||e.metaKey||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;const key=e.key.toLowerCase();if(key===' '){e.preventDefault();if(!spaceBoost){spaceBoost=true;await applySpeed(2)}return}if(key==='k'){e.preventDefault();toggleSourcePlayback()}else if(key==='j'){e.preventDefault();seekBoth(-10)}else if(key==='l'){e.preventDefault();seekBoth(10)}});
document.addEventListener('keyup',async e=>{if(e.key===' '&&spaceBoost){spaceBoost=false;await applySpeed(chosenSpeed)}});window.addEventListener('blur',async()=>{if(spaceBoost){spaceBoost=false;await applySpeed(chosenSpeed)}});
function applyFit(mode){if(!['contain','cover','fill'].includes(mode))mode='cover';fitMode.value=mode;fitModeMenu.value=mode;overlayVideo.style.objectFit=mode;}
fitMode.addEventListener('change',()=>applyFit(fitMode.value));fitModeMenu.addEventListener('change',()=>applyFit(fitModeMenu.value));
settingsToggle.addEventListener('click',()=>{const open=settingsMenu.hidden;settingsMenu.hidden=!open;settingsToggle.setAttribute('aria-expanded',String(open));});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.gearWrap')){settingsMenu.hidden=true;settingsToggle.setAttribute('aria-expanded','false')}});
applyFit('cover');applyVolumes();applyOverlayOpacity();updatePlayerButton();refreshTabs();