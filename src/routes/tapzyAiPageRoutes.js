const express = require("express");

const router = express.Router();

router.get("/tapzy-ai", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Ask Tapzy Room</title>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <style>
    :root{color-scheme:dark;--blue:#2f7bff;--line:rgba(126,190,255,.22);--glass:rgba(9,14,26,.82)}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}
    body{background:
      linear-gradient(rgba(75,142,255,.052) 1px,transparent 1px) 0 0/64px 64px,
      linear-gradient(90deg,rgba(75,142,255,.052) 1px,transparent 1px) 0 0/64px 64px,
      radial-gradient(circle at 50% 22%,rgba(47,123,255,.22),transparent 36%),
      #000}
    @keyframes tapzyFaceFloat{0%,100%{transform:translateY(0) scale(.985);filter:brightness(1)}50%{transform:translateY(-7px) scale(1.025);filter:brightness(1.08)}}
    @keyframes tapzyFaceThink{0%,100%{transform:rotate(0deg) scale(1)}50%{transform:rotate(1.2deg) scale(1.025)}}
    @keyframes tapzyDotPulse{0%,100%{opacity:.72;box-shadow:0 0 13px rgba(72,164,255,.72)}50%{opacity:1;box-shadow:0 0 25px rgba(72,164,255,1)}}
    .tapzy-room{width:min(100%,620px);min-height:100dvh;margin:0 auto;padding:calc(12px + env(safe-area-inset-top)) 22px calc(18px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px}
    .tapzy-head{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.08)}
    .tapzy-brand{display:flex;align-items:center;gap:12px;font-size:24px;font-weight:950;letter-spacing:0}
    .tapzy-brand img{width:48px;height:48px;border-radius:14px;background:#1768f5;box-shadow:0 0 26px rgba(47,123,255,.48)}
    .tapzy-close{width:56px;height:56px;border:1px solid rgba(255,255,255,.13);border-radius:18px;background:rgba(255,255,255,.06);color:#fff;text-decoration:none;display:grid;place-items:center;font-size:33px;line-height:1}
    .tapzy-card{position:relative;min-height:560px;border:1px solid var(--line);border-radius:33px;background:radial-gradient(circle at 50% 38%,rgba(47,123,255,.28),transparent 42%),linear-gradient(180deg,rgba(10,22,40,.88),rgba(2,6,13,.93));box-shadow:0 28px 90px rgba(0,0,0,.68),0 0 48px rgba(47,123,255,.16);overflow:hidden}
    .tapzy-card:before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(142,199,255,.08) 1px,transparent 1px) 0 0/64px 64px,linear-gradient(90deg,rgba(142,199,255,.08) 1px,transparent 1px) 0 0/64px 64px;mask-image:linear-gradient(#000 70%,transparent 100%)}
    .tapzy-face-wrap{position:absolute;left:50%;top:33%;width:min(45vw,250px);max-width:250px;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:999px;display:grid;place-items:center;background:radial-gradient(circle,rgba(57,135,255,.2),rgba(12,22,42,.65));box-shadow:0 0 0 12px rgba(16,37,72,.72),0 0 82px rgba(47,123,255,.58)}
    .tapzy-face{width:100%;height:100%;border-radius:999px;object-fit:cover;animation:tapzyFaceFloat 3.2s ease-in-out infinite}
    .is-thinking .tapzy-face{animation:tapzyFaceThink 1.1s ease-in-out infinite}
    .is-listening .tapzy-face,.is-speaking .tapzy-face{animation:tapzyFaceFloat 1.45s ease-in-out infinite}
    .tapzy-state{position:absolute;left:28px;bottom:28px;z-index:2;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.48);font-size:18px;font-weight:950;box-shadow:0 12px 34px rgba(0,0,0,.32)}
    .tapzy-dot{width:11px;height:11px;border-radius:50%;background:#3fa2ff;animation:tapzyDotPulse 1.5s ease-in-out infinite}
    .tapzy-intro{position:absolute;left:0;right:0;bottom:0;z-index:2;margin:0;padding:22px 24px;border-radius:24px 24px 30px 30px;background:rgba(11,16,29,.9);border-top:1px solid rgba(255,255,255,.1);font-size:19px;line-height:1.32;color:rgba(255,255,255,.92)}
    .tapzy-messages{display:flex;flex-direction:column;gap:12px;min-height:0;max-height:28dvh;overflow:auto;scrollbar-width:none}
    .tapzy-messages::-webkit-scrollbar{display:none}
    .tapzy-bubble{max-width:86%;padding:14px 16px;border-radius:21px;font-size:17px;line-height:1.42;overflow-wrap:anywhere;box-shadow:0 18px 45px rgba(0,0,0,.25)}
    .tapzy-bubble.assistant{align-self:flex-start;background:rgba(11,16,29,.9);border:1px solid rgba(126,190,255,.18)}
    .tapzy-bubble.user{align-self:flex-end;background:linear-gradient(145deg,#3280ff,#1350dd);font-weight:780}
    .tapzy-chips{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 18px,#000 calc(100% - 18px),transparent)}
    .tapzy-chips::-webkit-scrollbar{display:none}
    .tapzy-chip{flex:0 0 auto;min-height:38px;border:1px solid rgba(125,194,255,.3);border-radius:999px;background:rgba(7,13,25,.76);color:#fff;padding:0 18px;font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}
    .tapzy-composer{display:grid;grid-template-columns:78px minmax(0,1fr) 78px;gap:10px;align-items:center;border:1px solid rgba(125,194,255,.2);border-radius:27px;background:rgba(8,14,27,.86);padding:9px;box-shadow:0 18px 56px rgba(0,0,0,.44)}
    .tapzy-button,.tapzy-input{height:54px;border-radius:18px;border:1px solid rgba(255,255,255,.11);font:900 18px/1 Inter,system-ui,sans-serif;color:#fff}
    .tapzy-button{background:rgba(255,255,255,.08);cursor:pointer}
    .tapzy-button.is-listening{border-color:rgba(72,164,255,.72);box-shadow:0 0 0 6px rgba(47,123,255,.16),0 0 26px rgba(47,123,255,.34)}
    .tapzy-send{background:linear-gradient(145deg,#3280ff,#1350dd);box-shadow:0 12px 34px rgba(47,123,255,.32)}
    .tapzy-input{min-width:0;background:rgba(255,255,255,.065);padding:0 16px;outline:none}
    .tapzy-input::placeholder{color:rgba(255,255,255,.48)}
    @media(max-width:520px){
      .tapzy-room{padding-left:22px;padding-right:22px;gap:12px}
      .tapzy-head{height:70px}.tapzy-brand{font-size:23px}.tapzy-brand img{width:46px;height:46px}.tapzy-close{width:52px;height:52px}
      .tapzy-card{min-height:560px;border-radius:31px}.tapzy-face-wrap{width:min(48vw,225px);top:34%}
      .tapzy-intro{font-size:18px;padding:20px 22px}.tapzy-state{left:28px;bottom:28px;font-size:17px}
      .tapzy-composer{grid-template-columns:74px minmax(0,1fr) 74px;border-radius:25px}.tapzy-button,.tapzy-input{height:52px;border-radius:17px;font-size:17px}.tapzy-bubble{font-size:16px}
    }
  </style>
</head>
<body>
  <main class="tapzy-room is-idle" data-tapzy-ai-room>
    <header class="tapzy-head">
      <div class="tapzy-brand"><img src="/images/tapzy-mark-white.png" alt="" /><span>Ask Tapzy Room</span></div>
      <a class="tapzy-close" href="/" aria-label="Close">x</a>
    </header>
    <section class="tapzy-card" aria-label="Tapzy AI">
      <div class="tapzy-face-wrap"><img class="tapzy-face" src="/images/tapzy-identity-digital-face.jpg" alt="" /></div>
      <div class="tapzy-state"><span class="tapzy-dot"></span><span data-state-text>Idle</span></div>
      <p class="tapzy-intro" data-intro>Ask me anything. We can have a real conversation, search the web, talk Tapzy, find places, plan your night, check weather, or get directions.</p>
    </section>
    <section class="tapzy-messages" data-messages aria-live="polite"></section>
    <section class="tapzy-chips" aria-label="Quick questions">
      <button class="tapzy-chip" type="button">What is going on tonight?</button>
      <button class="tapzy-chip" type="button">Find concerts near me</button>
      <button class="tapzy-chip" type="button">Late night snacks near me</button>
      <button class="tapzy-chip" type="button">Tell me a joke</button>
    </section>
    <form class="tapzy-composer" data-composer autocomplete="off">
      <button class="tapzy-button" type="button" data-mic>Mic</button>
      <input class="tapzy-input" data-input placeholder="Ask Tapzy anything..." />
      <button class="tapzy-button tapzy-send" type="submit">Go</button>
    </form>
  </main>
  <script>
    (function(){
      var root=document.querySelector('[data-tapzy-ai-room]');
      var messages=root.querySelector('[data-messages]');
      var form=root.querySelector('[data-composer]');
      var input=root.querySelector('[data-input]');
      var state=root.querySelector('[data-state-text]');
      var intro=root.querySelector('[data-intro]');
      var mic=root.querySelector('[data-mic]');
      var busy=false;
      var listening=false;
      var recognition=null;
      var silenceTimer=null;
      var selectedVoice=null;
      var memory=[];
      var geo=null;
      function setState(text){var value=text||'Idle';state.textContent=value;root.classList.remove('is-idle','is-listening','is-thinking','is-speaking');root.classList.add('is-'+String(value).toLowerCase())}
      function add(role,text){var bubble=document.createElement('div');bubble.className='tapzy-bubble '+(role==='user'?'user':'assistant');bubble.textContent=String(text||'');messages.appendChild(bubble);messages.scrollTop=messages.scrollHeight;memory.push({role:role==='user'?'user':'assistant',content:String(text||'')});memory=memory.slice(-12)}
      function showAssistant(text){var value=String(text||'');if(!messages.children.length&&intro){intro.textContent=value}else{add('assistant',value)}}
      function pickVoice(){try{var voices=window.speechSynthesis&&window.speechSynthesis.getVoices?window.speechSynthesis.getVoices():[];if(!voices||!voices.length)return null;var preferred=['Samantha','Ava','Jenny','Aria','Zira','Karen','Moira','Tessa','Google US English','Microsoft Aria','Microsoft Jenny'];for(var i=0;i<preferred.length;i++){var found=voices.find(function(v){return String(v.name||'').toLowerCase().indexOf(preferred[i].toLowerCase())>-1&&/^en/i.test(v.lang||'')});if(found)return found;}return voices.find(function(v){return /^en/i.test(v.lang||'')&&/female|natural|premium|enhanced/i.test(String(v.name||''))})||voices.find(function(v){return /^en/i.test(v.lang||'')})||voices[0]||null;}catch(_){return null}}
      function warmVoiceList(){try{if(!('speechSynthesis'in window))return;selectedVoice=pickVoice();window.speechSynthesis.onvoiceschanged=function(){selectedVoice=pickVoice()||selectedVoice;};}catch(_){}}
      function speak(text){try{if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();selectedVoice=selectedVoice||pickVoice();var clean=String(text||'').replace(/https?:\/\/\S+/g,'').replace(/\s+/g,' ').trim();if(!clean)return;var utterance=new SpeechSynthesisUtterance(clean.slice(0,900));if(selectedVoice)utterance.voice=selectedVoice;utterance.lang=(selectedVoice&&selectedVoice.lang)||'en-US';utterance.rate=.94;utterance.pitch=1.05;utterance.volume=1;utterance.onstart=function(){setState('Speaking')};utterance.onend=function(){setState('Idle')};window.speechSynthesis.speak(utterance)}catch(_){setState('Idle')}}
      function getLocation(){return new Promise(function(resolve){if(geo)return resolve(geo);if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(function(pos){geo={latitude:pos.coords.latitude,longitude:pos.coords.longitude};resolve(geo)},function(){resolve(null)},{enableHighAccuracy:false,timeout:5500,maximumAge:300000})})}
      async function ask(text){text=String(text||'').trim();if(!text||busy)return;busy=true;add('user',text);input.value='';setState('Thinking');var oldIntro=intro&&intro.textContent;var thinkingShown=false;if(intro){intro.textContent='Thinking...';thinkingShown=true}else{add('assistant','Thinking...')}var loc=await getLocation();try{var res=await fetch('/api/tapzy-ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,memory:memory,latitude:loc&&loc.latitude,longitude:loc&&loc.longitude,currentPath:location.pathname,currentUrl:location.href,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});var data=await res.json().catch(function(){return{}});var reply=data.reply||'Tapzy AI could not answer yet. Try again.';if(thinkingShown&&intro){intro.textContent=reply}else{var last=messages.lastElementChild;if(last&&last.textContent==='Thinking...')last.remove();showAssistant(reply)}speak(reply)}catch(_){var fallback='Tapzy AI had trouble connecting. Try again in a moment.';if(thinkingShown&&intro){intro.textContent=fallback}else{var last=messages.lastElementChild;if(last&&last.textContent==='Thinking...')last.remove();showAssistant(fallback)}speak(fallback)}finally{busy=false;setTimeout(function(){if(!window.speechSynthesis||!window.speechSynthesis.speaking)setState('Idle')},900)}}
      form.addEventListener('submit',function(event){event.preventDefault();ask(input.value)});
      root.querySelectorAll('.tapzy-chip').forEach(function(button){button.addEventListener('click',function(){ask(button.textContent)})});
      function stopListening(){window.clearTimeout(silenceTimer);listening=false;mic.classList.remove('is-listening');mic.textContent='Mic';try{recognition&&recognition.stop&&recognition.stop();}catch(_){}recognition=null;if(!busy)setState('Idle')}
      function startListening(){var Rec=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Rec){showAssistant('Voice typing is not supported in this browser. Type your question and I will still speak back.');speak('Voice typing is not supported in this browser. Type your question and I will still speak back.');return}try{window.speechSynthesis&&window.speechSynthesis.cancel&&window.speechSynthesis.cancel();if(recognition)stopListening();recognition=new Rec();recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=false;listening=true;mic.classList.add('is-listening');mic.textContent='End';setState('Listening');var finalText='';var interimText='';var submitted=false;function submitHeard(){if(submitted)return;submitted=true;var heard=(finalText||interimText||'').trim();stopListening();if(heard)ask(heard);}silenceTimer=window.setTimeout(function(){if(listening)submitHeard();},9000);recognition.onresult=function(event){window.clearTimeout(silenceTimer);for(var i=event.resultIndex;i<event.results.length;i++){var piece=event.results[i]&&event.results[i][0]&&event.results[i][0].transcript||'';if(event.results[i].isFinal)finalText+=piece;else interimText=piece;}input.value=(finalText||interimText||'').trim();silenceTimer=window.setTimeout(function(){if(listening)submitHeard();},1400);};recognition.onerror=function(){submitted=true;stopListening();showAssistant('I could not hear that. Tap Mic again or type your question.');};recognition.onend=function(){if((finalText||interimText||'').trim())submitHeard();else stopListening();};recognition.start();}catch(_){stopListening();showAssistant('Mic could not start. Check browser microphone permission, then tap Mic again.');}}
      mic.addEventListener('click',function(){if(listening)stopListening();else startListening();});
      warmVoiceList();
    })();
  </script>
</body>
</html>`);
});

module.exports = router;
