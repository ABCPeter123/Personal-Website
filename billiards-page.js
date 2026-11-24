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
 function clearSavedVideo(){if(savedVideoUrl){URL.revokeObjectURL(savedVideoUrl);savedVideoUrl=null}el("save-replay-video").textContent="â†“ Save video"}
 function downloadSavedVideo(){if(!savedVideoUrl)return;const a=document.createElement("a");a.href=savedVideoUrl;const date=new Date().toISOString().replace(/[:.]/g,"-");a.download="break-room-"+(current?.game||"pool")+"-"+requestedReplay+"-"+date+(videoMime.startsWith("video/mp4")?".mp4":".webm");document.body.append(a);a.click();a.remove()}
 function holdReplayNavigation(){replayNavHold=true;clearTimeout(replayHoldTimer);replayHoldTimer=setTimeout(()=>{replayNavHold=false;updateReplayControls()},380)}¶»§q«^