"use strict";
(()=>{
 const engineOrigin="https://peter-pu-billiards-engine.vercel.app";
 const channel="break-room-v1",el=id=>document.getElementById(id);
 const lobby=el("lobby"),arena=el("arena"),frame=el("game-frame");
 const gameNames={eightball:"8-ball pool",nineball:"9-ball pool"};
 let game="eightball",opponent="hotseat",bot="TheFarJaw";
 let current=null,gameReady=false,canShoot=false,overhead=false,shotCount=0,player=0;
 let power=65,spin={x:0,y:0};
 let ended=false,latestReplayUrl="",requestedReplay="last",botOwner=0;
 let replayReady=false,replayBusy=false,replaySpeed=1,replayPosition={index:0,total:0,canPrevious:false,canNext:false};
 let lastGroups=[0,0],lastEightTargets=[false,false];
 let replayNavHold=false,replayHoldTimer=null,replayRun=0;
 let replayExporting=false,savedVideoUrl=null,videoMime="video/webm";
 function clearSavedVideo(){if(savedVideoUrl){URL.revokeObjectURL(savedVideoUrl);savedVideoUrl=null}el("save-replay-video").textContent="↓ Save video"}
 function downloadSavedVideo(){if(!savedVideoUrl)return;const a=document.createElement("a");a.href=savedVideoUrl;const date=new Date().toISOString().replace(/[:.]/g,"-");a.download="break-room-"+(current?.game||"pool")+"-"+requestedReplay+"-"+date+(videoMime.startsWith("video/mp4")?".mp4":".webm");document.body.append(a);a.click();a.remove()}
 function holdReplayNavigation(){replayNavHold=true;clearTimeout(replayHoldTimer);replayHoldTimer=setTimeout(()=>{replayNavHold=false;updateReplayControls()},380)}
 function text(id,value){el(id).textContent=value}

 function updateGroups(groups=[],turn=0,eightTargets=lastEightTargets){
   lastGroups=groups.slice(0,2);lastEightTargets=[eightTargets?.[0]===true,eightTargets?.[1]===true];
   if(!current||current.game!=="eightball"){el("group-bar").hidden=true;return}
   el("group-bar").hidden=false;
   const assigned=groups.some(n=>n===1||n===2);
   const role={0:"OPEN TABLE",1:"SOLIDS · 1–7",2:"STRIPES · 9–15"};
   const labels=current.opponent==="bot"?["YOU","BOT"]:["PLAYER 1","PLAYER 2"];
   for(let i=0;i<2;i++){
     const type=[0,1,2].includes(Number(groups[i]))?Number(groups[i]):0;
     text("group-name-"+i,labels[i]);
     const onEight=type!==0&&lastEightTargets[i]===true;
     text("group-role-"+i,onEight?"8-BALL · FINAL TARGET":role[type]);
     const ball=el("group-ball-"+i);
     ball.classList.toggle("solids",type===1&&!onEight);
     ball.classList.toggle("stripes",type===2&&!onEight);
     ball.classList.toggle("eight",onEight);
     ball.textContent=onEight?"8":"";
     el("group-player-"+i).classList.toggle("current",turn===i);
     el("group-turn-"+i).hidden=turn!==i;
   }
   text("group-hint",assigned?"Solids and stripes are assigned":"Open table · groups not assigned");
 }

 function chooseButtons(selector,dataName,value){document.querySelectorAll(selector).forEach(b=>{const active=b.dataset[dataName]===value;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))})}
 function chooseGame(value){if(!gameNames[value])return;game=value;chooseButtons("[data-game]","game",game)}
 function chooseOpponent(value){if(!["hotseat","bot"].includes(value))return;opponent=value;chooseButtons("[data-opponent]","opponent",value);el("bot-select").hidden=value!=="bot"}
 document.querySelectorAll("[data-game]").forEach(b=>b.addEventListener("click",()=>chooseGame(b.dataset.game)));
 document.querySelectorAll("[data-opponent]").forEach(b=>b.addEventListener("click",()=>chooseOpponent(b.dataset.opponent)));
 el("bot-level").addEventListener("change",e=>{bot=e.target.value});
 const gameUrl=()=>{
   const url=new URL(engineOrigin+"/engine.html");
   url.searchParams.set("ruletype",game);
   url.searchParams.set("lod","4");
   url.searchParams.set("practice","false");
   if(opponent==="bot")url.searchParams.set("bot",bot);
   else url.searchParams.set("hotseat","true");
   return url.href
 };
 function command(name,args={}){if(!gameReady||!frame.contentWindow)return;frame.contentWindow.postMessage({channel,kind:"command",command:name,...args},engineOrigin)}
 function matchStart(){
   gameReady=false;canShoot=false;overhead=false;player=0;botOwner=0;shotCount=0;ended=false;
   el("match-result").hidden=true;el("replay-shot").disabled=true;el("replay-match").disabled=true;closeReplay();
   current={game,opponent,bot};
   updateGroups([0,0],0,[false,false]);
   lobby.hidden=true;arena.hidden=false;
   text("match-title",gameNames[game]);
   text("match-opponent",opponent==="bot"?"VS COMPUTER":"LOCAL 1V1");
   text("turn-indicator","Loading match");
   text("shot-phase","LOADING");
   text("shoot-label","Take shot");
   text("feedback-text","Setting up your table...");
   text("last-shot","No shots yet");
   text("stage-message","Drag on the 3D table to aim");
   el("loading-layer").hidden=false;
   el("shoot-button").disabled=true;
   el("camera-button").textContent="Overhead view";
   el("power-control").value=65;power=65;text("power-value","65%");
   selectPowerPreset();
   setSpin(0,0,false);
   frame.src=gameUrl();
   document.body.classList.add("in-game");
 }
 function returnLobby(){
   // Destroy the iframe session. No engine route or upstream lobby survives.
   gameReady=false;canShoot=false;closeReplay();frame.src="about:blank";
   arena.hidden=true;lobby.hidden=false;current=null;
   document.body.classList.remove("in-game");
   el("shoot-button").disabled=true;
 }
 el("begin").addEventListener("click",matchStart);
 el("return-lobby").addEventListener("click",returnLobby);
 el("restart-button").addEventListener("click",matchStart);

 // Replay uses a second isolated physics frame, preserving the live table and
 // shot setup. The command returns a recorded shot or compressed full match.
 const replayFrame=el("replay-frame");
 function replayCommand(command,args={}){
   if(!replayReady||!replayFrame.contentWindow)return;
   replayFrame.contentWindow.postMessage({channel,kind:"command",command,...args},engineOrigin);
 }
 function showSpeed(rate){
   replaySpeed=rate;
   document.querySelectorAll("[data-replay-speed]").forEach(btn=>{
     const selected=Number(btn.dataset.replaySpeed)===rate;
     btn.classList.toggle("active",selected);
     btn.setAttribute("aria-pressed",String(selected));
   });
 }
 function updateReplayControls(){
   const actionable=replayReady&&!replayBusy&&!replayNavHold&&!replayExporting;
   el("save-replay-video").disabled=replayExporting;
   document.querySelectorAll("[data-replay-speed]").forEach(b=>b.disabled=replayExporting);
   el("watch-again").disabled=replayExporting;
   el("replay-next").disabled=!actionable||!replayPosition.canNext;
   el("replay-previous").disabled=!actionable||!replayPosition.canPrevious;
 }
 function closeReplay(){
   replayExporting=false;clearSavedVideo();
   clearTimeout(replayHoldTimer);replayNavHold=false;
   replayBusy=false;replayReady=false;el("replay-next").disabled=true;el("replay-previous").disabled=true;
   el("replay-overlay").hidden=true;
   replayFrame.src="about:blank";latestReplayUrl="";
 }
 function requestReplay(scope){
   if(!gameReady||shotCount===0)return;
   requestedReplay=scope;
   text("replay-message","Preparing replay...");
   command("replay",{scope});
 }
 function showReplay(scope,data){
   if(!current||typeof data!=="string"||data.length===0)return;
   const url=new URL(engineOrigin+"/engine.html");
   url.searchParams.set("ruletype",current.game);
   url.searchParams.set("lod","3");
   url.searchParams.set("state",data);
   latestReplayUrl=url.href;
   replayExporting=false;clearSavedVideo();
   replayReady=false;replayBusy=false;el("replay-next").disabled=true;el("replay-previous").disabled=true;replayPosition={index:0,total:0,canPrevious:false,canNext:false};text("replay-position","Preparing replay");showSpeed(1);
   text("replay-title",scope==="last"?"Last shot":"Match replay");
   text("replay-message",scope==="last"?"One shot, replayed with full physics.":"The match from the opening break.");
   el("replay-loading").hidden=false;
   el("replay-overlay").hidden=false;
   replayFrame.src=latestReplayUrl;
 }
 // Loading screen stays visible until the replay physics engine reports ready.
 document.querySelectorAll("[data-replay-speed]").forEach(b=>b.addEventListener("click",()=>{
   const rate=Number(b.dataset.replaySpeed);
   if(![1,2,4].includes(rate))return;
   showSpeed(rate);
   replayCommand("replay-speed",{rate});
 }));
 el("save-replay-video").addEventListener("click",()=>{
   if(savedVideoUrl){downloadSavedVideo();return}
   if(!latestReplayUrl||!current||replayExporting)return;
   replayExporting=true;replayReady=false;replayBusy=false;clearSavedVideo();showSpeed(1);updateReplayControls();
   el("save-replay-video").textContent="Recording…";
   text("replay-message","Recording replay from the beginning at 1× speed. Keep this page open.");
   text("replay-position","Starting recording");
   el("replay-loading").hidden=false;
   const url=new URL(latestReplayUrl);url.searchParams.set("record","1");url.searchParams.set("run",String(++replayRun));
   replayFrame.src=url.href;
 });
 el("replay-previous").addEventListener("click",()=>{
   if(!replayReady||replayBusy||!replayPosition.canPrevious)return;
   replayBusy=true;holdReplayNavigation();updateReplayControls();
   replayCommand("replay-previous");
   text("replay-message","Returning to the previous shot...");
 });
 el("replay-next").addEventListener("click",()=>{
   if(!replayReady||replayBusy||!replayPosition.canNext)return;
   replayBusy=true;holdReplayNavigation();updateReplayControls();
   replayCommand("replay-next");
   text("replay-message","Advancing to the next shot...");
 });
 el("replay-shot").addEventListener("click",()=>requestReplay("last"));
 el("replay-match").addEventListener("click",()=>requestReplay("match"));
 el("result-replay").addEventListener("click",()=>requestReplay("match"));
 el("close-replay").addEventListener("click",closeReplay);
 el("resume-match").addEventListener("click",closeReplay);
 el("watch-again").addEventListener("click",()=>{if(latestReplayUrl&&!replayExporting){ replayReady=false;replayBusy=false;el("replay-next").disabled=true;el("replay-previous").disabled=true;replayPosition={index:0,total:0,canPrevious:false,canNext:false};text("replay-position","Preparing replay");el("replay-loading").hidden=false;const url=new URL(latestReplayUrl);url.searchParams.set("run",String(++replayRun));replayFrame.src=url.href}});
 el("replay-overlay").addEventListener("keydown",e=>{if(e.key==="Escape"){closeReplay();el("replay-match").focus()}});
 function endMatch(detail){
   if(!current||current.game!=="eightball"||ended)return;
   ended=true;canShoot=false;el("shoot-button").disabled=true;
   const loser=Number(detail?.loser)||0,winner=loser===0?1:0;
   const winnerText=current.opponent==="bot"?(winner===0?"YOU WIN":"BOT WINS"):"PLAYER "+(winner+1)+" WINS";
   text("result-title",winnerText);
   text("result-subtitle",loser===0?(current.opponent==="bot"?"You pocketed the 8-ball.":"Player 1 pocketed the 8-ball."):(current.opponent==="bot"?"The bot pocketed the 8-ball.":"Player 2 pocketed the 8-ball."));
   el("match-result").hidden=false;
   text("turn-indicator","Match finished");
   text("shot-phase","FINISHED");
   text("feedback-text","8-ball potted. Shooter loses. Watch the replay or start a new match.");
   el("replay-match").disabled=shotCount===0;
 }
 function setActivePlayer(index){
   if(!current||ended||index!==0&&index!==1||player===index)return;
   player=index;
   if(current.game==="eightball")updateGroups(lastGroups,player);
   text("turn-indicator",current.opponent==="bot"?(player===1?"Bot's turn":"Your turn"):"Player "+(player+1));
 }
 function cameraToggle(){overhead=!overhead;command("camera",{overhead});el("camera-button").textContent=overhead?"3D view":"Overhead view";text("stage-message",overhead?"Drag on the table to aim from above":"Drag on the 3D table to aim")}
 el("camera-button").addEventListener("click",cameraToggle);
 el("fullscreen-button").addEventListener("click",async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await arena.requestFullscreen()}catch(e){}});
 frame.addEventListener("load",()=>{
   if(!current)return;
   // A successful iframe load is not engine readiness. Wait for the adapter handshake.
   frame.contentWindow?.postMessage({channel,kind:"command",command:"ping"},engineOrigin);
 });
 function selectPowerPreset(){document.querySelectorAll("[data-power]").forEach(b=>b.classList.toggle("active",Math.abs(Number(b.dataset.power)-power)<6))}
 function setPower(next,send=true){power=Math.max(5,Math.min(100,Math.round(Number(next)||5)));el("power-control").value=String(power);text("power-value",power+"%");selectPowerPreset();if(send)command("power",{value:power/100})}
 el("power-control").addEventListener("input",e=>setPower(e.target.value));
 document.querySelectorAll("[data-power]").forEach(b=>b.addEventListener("click",()=>setPower(Number(b.dataset.power))));
 document.querySelectorAll("[data-nudge]").forEach(b=>b.addEventListener("click",()=>command("nudge",{delta:Number(b.dataset.nudge)})));
 const spinPad=el("spin-pad"),marker=el("spin-marker");
 function spinLabel(){const v=spin.y>.12?"Follow":spin.y<-.12?"Draw":"Centre";const h=spin.x>.12?" · right":spin.x<-.12?" · left":"";return v+h}
 function setSpin(x,y,send=true){
   spin={x:Math.max(-.52,Math.min(.52,Number(x)||0)),y:Math.max(-.52,Math.min(.52,Number(y)||0))};
   const norm=Math.hypot(spin.x,spin.y);if(norm>.55){spin.x*=.55/norm;spin.y*=.55/norm}
   marker.style.left=(50+spin.x*65)+"%";marker.style.top=(50-spin.y*65)+"%";
   text("spin-status",spinLabel());
   spinPad.setAttribute("aria-valuenow",String(Math.round(spin.y*100)));
   if(send)command("spin",spin);
 }
 function spinFromPointer(e){const r=spinPad.getBoundingClientRect();setSpin((e.clientX-r.left-r.width/2)/(r.width*.55),(r.top+r.height/2-e.clientY)/(r.height*.55))}
 let pointer=null;
 spinPad.addEventListener("pointerdown",e=>{pointer=e.pointerId;spinPad.setPointerCapture(e.pointerId);spinFromPointer(e);e.preventDefault()});
 spinPad.addEventListener("pointermove",e=>{if(pointer===e.pointerId)spinFromPointer(e)});
 const pointerEnd=e=>{if(e.pointerId===pointer)pointer=null};
 spinPad.addEventListener("pointerup",pointerEnd);spinPad.addEventListener("pointercancel",pointerEnd);
 spinPad.addEventListener("keydown",e=>{const d=.05;if(e.key==="ArrowUp")setSpin(spin.x,spin.y+d);else if(e.key==="ArrowDown")setSpin(spin.x,spin.y-d);else if(e.key==="ArrowLeft")setSpin(spin.x-d,spin.y);else if(e.key==="ArrowRight")setSpin(spin.x+d,spin.y);else return;e.preventDefault()});
 document.querySelectorAll("[data-spin]").forEach(b=>b.addEventListener("click",()=>{const [x,y]=b.dataset.spin.split(",").map(Number);setSpin(x,y)}));
 el("reset-spin").addEventListener("click",()=>setSpin(0,0));
 el("shoot-button").addEventListener("click",()=>{if(!canShoot)return;command("shoot");canShoot=false;el("shoot-button").disabled=true;text("feedback-text","Shot taken. Watching the balls...");});
 window.addEventListener("message",e=>{
   if(!current||e.origin!==engineOrigin||e.data?.channel!==channel)return;
   if(e.source===replayFrame.contentWindow){
     const payload=e.data;
     if(payload.kind==="video-start"){
       text("replay-message","Recording at 1× speed. Keep the replay open until it finishes.");
     }
     if(payload.kind==="video-finalizing")text("replay-message","Finalizing your video...");
     if(payload.kind==="video-complete"){
       replayExporting=false;updateReplayControls();
       const blob=payload.blob;
       if(blob instanceof Blob&&blob.size>1024){
         clearSavedVideo();videoMime=blob.type||payload.mimeType||"video/webm";
         savedVideoUrl=URL.createObjectURL(blob);
         el("save-replay-video").textContent="↓ Download again";
         text("replay-message","Video ready ("+(blob.size/1048576).toFixed(1)+" MB). Downloading. Use Download again if needed.");
         downloadSavedVideo();
       }else{
         el("save-replay-video").textContent="↓ Retry recording";
         text("replay-message","The recording was empty. Try again.");
       }
     }
     if(payload.kind==="video-error"){
       replayExporting=false;updateReplayControls();
       el("save-replay-video").textContent="↓ Retry recording";
       text("replay-message",String(payload.message||"Unable to record this replay in your browser."));
       el("replay-loading").hidden=true;
     }
     if(payload.kind==="state"){
       if(payload.state?.phase==="Replay"&&!replayReady){
         el("replay-loading").hidden=true;
         replayReady=true;
         updateReplayControls();
         replayCommand("replay-speed",{rate:replaySpeed});
       }else if(payload.state?.phase==="End"){
         replayReady=false;el("replay-next").disabled=true;el("replay-previous").disabled=true;
         text("replay-message","Replay complete. Play it again or return to your match.");
       }
     }
     if(payload.kind==="replay-position"){
       const position=payload.detail||{};
       replayPosition={
         index:Math.max(0,Number(position.index)||0),
         total:Math.max(0,Number(position.total)||0),
         canPrevious:position.canPrevious===true,
         canNext:position.canNext===true
       };
       if(typeof position.busy==="boolean")replayBusy=position.busy;
       updateReplayControls();
       text("replay-position",(replayExporting?"Recording shot ":"Shot ")+replayPosition.index+" of "+replayPosition.total);
     }
     if(payload.kind==="replay-navigation"){
       replayBusy=payload.detail?.busy===true;
       updateReplayControls();
       if(!replayBusy)text("replay-message","Replay ready. Navigate shots or change speed.");
     }
     if(payload.kind==="replay-complete"){
       el("replay-next").disabled=true;
       if(replayExporting)text("replay-message","Replay complete. Finalizing your video...");
       else text("replay-message","Replay finished. Go back a shot, play again, or return to your match.");
     }
     if(payload.kind==="replay-next")text("replay-message","Moving to the next recorded shot.");
     return;
   }
   if(e.source!==frame.contentWindow)return;
   const m=e.data;
   if(m.kind==="ready"){gameReady=true;el("loading-layer").hidden=true;command("power",{value:power/100});command("spin",spin);}
   if(m.kind==="state"){
     const s=m.state||{};gameReady=Boolean(s.ready);
     if(gameReady)el("loading-layer").hidden=true;
     canShoot=Boolean(s.canShoot)&&!ended;
     el("shoot-button").disabled=!canShoot;
     const action=s.action==="Place ball"?"Place ball":"Take shot";
     text("shoot-label",action);
     text("shot-phase",s.phase==="PlaceBall"?"BALL IN HAND":s.phase==="Aim"?"READY":s.phase==="End"?"FINISHED":"IN PLAY");
     if(s.phase==="End"&&!ended){text("feedback-text","Match complete. Replay the match or restart.")}
     // Turn ownership changes only on a confirmed handoff, never during ball movement.
     if(current.opponent==="bot"&&!ended){
       if(s.phase==="WatchAim"||s.phase==="WatchShot")setActivePlayer(1);
       else if(s.phase==="Aim"||s.phase==="PlaceBall")setActivePlayer(0);
     }
     if(current?.game==="eightball"&&Array.isArray(s.playerGroups))updateGroups(s.playerGroups,player,s.playerEightTargets);
     if(!ended)text("turn-indicator",gameReady?(current.opponent==="bot"?(player===1?"Bot's turn":"Your turn"):"Player "+(player+1)):"Loading match");
     if(typeof s.power==="number"&&document.activeElement!==el("power-control"))setPower(Math.round(s.power*100),false);
     if(s.spin&&document.activeElement!==spinPad)setSpin(s.spin.x,s.spin.y,false);
   }
   if(m.kind==="shot-start"){
     shotCount++;el("replay-shot").disabled=true;el("replay-match").disabled=true;text("shot-phase","IN MOTION");
     text("feedback-text","The balls are moving...");
   }
   if(m.kind==="shot-end"){
     el("replay-shot").disabled=false;el("replay-match").disabled=false;
     const r=m.detail||{},pots=Math.max(0,Number(r.potted)||0);
     const foul=String(r.foul||"").trim();
     text("last-shot","SHOT "+String(shotCount).padStart(2,"0")+" · "+pots+" POTTED");
     text("feedback-text",foul?"Foul: "+foul:pots?pots+" ball"+(pots===1?"":"s")+" potted.":"No pot. Line up the next shot.");
   }
   if(m.kind==="shot-decision"&&current?.opponent==="hotseat"&&!ended){
     const d=m.detail||{};
     const next=Number(d.turn)||0;
     // The shot result, not animation phase or previous break score, owns the turn.
     if(Array.isArray(d.groups)&&current.game==="eightball")updateGroups(d.groups,player);
     const reason=String(d.reason||"").trim();
     const message=d.keep
       ?"Player "+(Number(d.shooter||0)+1)+" keeps the turn. "+reason
       :"Player "+(next+1)+" to shoot. "+reason;
     text("feedback-text",message);
     text("stage-message",d.keep?"Player "+(Number(d.shooter||0)+1)+" shoots again":"Player "+(next+1)+" is up");
   }
   if(m.kind==="turn-change"&&m.detail?.changed===true)setActivePlayer(Number(m.detail.turn)||0);
   if(m.kind==="match-end")endMatch(m.detail||{});
   if(m.kind==="replay-data")showReplay(m.scope,m.data);
   if(m.kind==="replay-unavailable")text("feedback-text","No recorded shots available to replay yet.");
 });
 el("current-year").textContent=String(new Date().getFullYear());
 chooseGame("eightball");chooseOpponent("hotseat");setSpin(0,0,false);setPower(65,false);
})();
