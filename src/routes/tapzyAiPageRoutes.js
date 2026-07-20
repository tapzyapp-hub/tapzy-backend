const express = require("express");

const router = express.Router();

router.get("/tapzy-ai", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Hey Tapzy</title>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <style>
    :root{color-scheme:dark;--blue:#2f7bff;--line:rgba(126,190,255,.22);--panel:rgba(7,13,25,.86)}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:#000;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}
    body{background:
      linear-gradient(rgba(75,142,255,.055) 1px,transparent 1px) 0 0/64px 64px,
      linear-gradient(90deg,rgba(75,142,255,.055) 1px,transparent 1px) 0 0/64px 64px,
      radial-gradient(circle at 50% 20%,rgba(47,123,255,.28),transparent 34%),
      #000}
    @keyframes tapzyAiBreath{0%,100%{transform:scale(.985);box-shadow:0 0 0 9px rgba(20,43,78,.72),0 0 58px rgba(47,123,255,.42)}50%{transform:scale(1.035);box-shadow:0 0 0 13px rgba(28,65,120,.76),0 0 92px rgba(70,157,255,.68)}}
    @keyframes tapzyAiListen{0%,100%{filter:brightness(1);transform:scale(1)}50%{filter:brightness(1.22);transform:scale(1.045)}}
    @keyframes tapzyAiThink{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(1.4deg) scale(1.03)}100%{transform:rotate(0deg) scale(1)}}
    @keyframes tapzyAiDot{0%,100%{opacity:.68;box-shadow:0 0 12px rgba(63,162,255,.6)}50%{opacity:1;box-shadow:0 0 24px rgba(63,162,255,1)}}
    .tapzy-ai-shell{width:min(100%,620px);min-height:100dvh;margin:0 auto;padding:calc(14px + env(safe-area-inset-top)) 18px calc(20px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:13px}
    .tapzy-ai-top{display:flex;align-items:center;justify-content:space-between;padding:8px 0 12px;border-bottom:1px solid rgba(255,255,255,.08)}
    .tapzy-ai-title{font-size:23px;font-weight:950;letter-spacing:0}
    .tapzy-ai-close{width:52px;height:52px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:rgba(255,255,255,.06);color:#fff;font-size:34px;line-height:1;display:grid;place-items:center;text-decoration:none}
    .tapzy-ai-orb{position:relative;min-height:360px;border:1px solid var(--line);border-radius:32px;background:radial-gradient(circle at 50% 38%,rgba(47,123,255,.34),transparent 38%),linear-gradient(180deg,rgba(11,25,45,.88),rgba(2,6,13,.92));box-shadow:0 24px 80px rgba(0,0,0,.64),0 0 45px rgba(47,123,255,.18);overflow:hidden;display:grid;place-items:center}
    .tapzy-ai-orb:before{content:"";position:absolute;inset:0;background:linear-gradient(rgba(142,199,255,.08) 1px,transparent 1px) 0 0/64px 64px,linear-gradient(90deg,rgba(142,199,255,.08) 1px,transparent 1px) 0 0/64px 64px;mask-image:linear-gradient(#000,transparent 94%)}
    .tapzy-ai-face{position:relative;z-index:1;width:min(52%,230px);aspect-ratio:1;border-radius:999px;object-fit:cover;box-shadow:0 0 0 10px rgba(20,43,78,.72),0 0 70px rgba(47,123,255,.52);animation:tapzyAiBreath 3.2s ease-in-out infinite;will-change:transform,box-shadow,filter}
    .is-listening .tapzy-ai-face{animation:tapzyAiListen 1.3s ease-in-out infinite}
    .is-thinking .tapzy-ai-face{animation:tapzyAiThink 1.1s ease-in-out infinite}
    .is-speaking .tapzy-ai-face{animation:tapzyAiBreath 1.45s ease-in-out infinite;filter:brightness(1.14)}
    .tapzy-ai-state{position:absolute;left:28px;bottom:28px;z-index:2;display:flex;align-items:center;gap:10px;border:1px solid rgba(255,255,255,.13);border-radius:999px;background:rgba(0,0,0,.48);padding:11px 17px;font-weight:900;font-size:17px;box-shadow:0 12px 34px rgba(0,0,0,.32)}
    .tapzy-ai-dot{width:11px;height:11px;border-radius:50%;background:#3fa2ff;box-shadow:0 0 18px rgba(63,162,255,.9);animation:tapzyAiDot 1.5s ease-in-out infinite}
    .tapzy-ai-messages{display:flex;flex-direction:column;gap:11px;min-height:108px;max-height:32dvh;overflow:auto;padding:2px;scrollbar-width:none}
    .tapzy-ai-messages::-webkit-scrollbar{display:none}
    .tapzy-ai-bubble{max-width:86%;padding:13px 15px;border-radius:20px;font-size:16px;line-height:1.42;overflow-wrap:anywhere;box-shadow:0 18px 45px rgba(0,0,0,.24)}
    .tapzy-ai-bubble.assistant{align-self:flex-start;background:var(--panel);border:1px solid rgba(132,197,255,.18)}
    .tapzy-ai-bubble.user{align-self:flex-end;background:linear-gradient(145deg,#3280ff,#1350dd);font-weight:750}
    .tapzy-ai-chips{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none}
    .tapzy-ai-chips::-webkit-scrollbar{display:none}
    .tapzy-ai-chip{flex:0 0 auto;border:1px solid rgba(125,194,255,.3);border-radius:999px;background:rgba(7,13,25,.76);color:#fff;padding:10px 15px;font-size:12px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}
    .tapzy-ai-composer{display:grid;grid-template-columns:70px 1fr 70px;gap:9px;border:1px solid rgba(125,194,255,.22);border-radius:24px;background:rgba(8,14,27,.86);padding:9px;box-shadow:0 14px 44px rgba(0,0,0,.4)}
    .tapzy-ai-button,.tapzy-ai-input{height:50px;border-radius:17px;border:1px solid rgba(255,255,255,.1);font:900 17px/1 Inter,system-ui,sans-serif;color:#fff}
    .tapzy-ai-button{background:rgba(255,255,255,.08);cursor:pointer}
    .tapzy-ai-send{background:linear-gradient(145deg,#3280ff,#1350dd);box-shadow:0 12px 34px rgba(47,123,255,.28)}
    .tapzy-ai-input{min-width:0;background:rgba(255,255,255,.07);padding:0 14px;outline:none}
    .tapzy-ai-input::placeholder{color:rgba(255,255,255,.48)}
    .tapzy-ai-brain{display:grid;grid-template-columns:46px 1fr auto;gap:12px;align-items:center;border:1px solid rgba(125,194,255,.22);border-radius:20px;background:rgba(5,15,31,.84);padding:12px 14px}
    .tapzy-ai-brain-icon{width:40px;height:40px;border-radius:14px;border:1px solid rgba(125,194,255,.24);display:grid;place-items:center;background:radial-gradient(circle,rgba(55,158,255,.26),rgba(255,255,255,.04));font-size:15px}
    .tapzy-ai-brain-title{font-size:16px;font-weight:950;margin-bottom:6px}
    .tapzy-ai-bar{height:8px;border-radius:999px;background:rgba(255,255,255,.11);overflow:hidden}
    .tapzy-ai-fill{height:100%;width:8%;border-radius:inherit;background:linear-gradient(90deg,#48d9ff,#2f7bff);box-shadow:0 0 18px rgba(72,217,255,.72);transition:width .24s ease}
    .tapzy-ai-percent{font-weight:950;color:#a9d7ff}
    @media(max-width:520px){.tapzy-ai-shell{padding-left:14px;padding-right:14px;gap:12px}.tapzy-ai-orb{min-height:330px;border-radius:28px}.tapzy-ai-face{width:min(52%,210px)}.tapzy-ai-state{left:24px;bottom:24px;font-size:16px;padding:10px 15px}.tapzy-ai-composer{grid-template-columns:64px 1fr 64px}.tapzy-ai-button,.tapzy-ai-input{height:48px;border-radius:16px;font-size:16px}.tapzy-ai-bubble{font-size:15px}.tapzy-ai-title{font-size:22px}.tapzy-ai-brain{grid-template-columns:42px 1fr auto}.tapzy-ai-brain-icon{width:38px;height:38px}.tapzy-ai-percent{font-size:15px}}
  </style>
</head>
<body>
  <main class="tapzy-ai-shell" data-tapzy-ai-room>
    <header class="tapzy-ai-top">
      <div class="tapzy-ai-title">Hey Tapzy</div>
      <a class="tapzy-ai-close" href="/" aria-label="Close">x</a>
    </header>
    <section class="tapzy-ai-orb" aria-label="Tapzy AI visual">
      <img class="tapzy-ai-face" src="/images/tapzy-identity-digital-face.jpg" alt="" />
      <div class="tapzy-ai-state"><span class="tapzy-ai-dot"></span><span data-state-text>Idle</span></div>
    </section>
    <section class="tapzy-ai-messages" data-messages aria-live="polite"></section>
    <section class="tapzy-ai-chips" aria-label="Quick questions">
      <button class="tapzy-ai-chip" type="button">What is going on tonight?</button>
      <button class="tapzy-ai-chip" type="button">Late night snacks near me</button>
      <button class="tapzy-ai-chip" type="button">Tell me a joke</button>
      <button class="tapzy-ai-chip" type="button">Help me with math</button>
    </section>
    <form class="tapzy-ai-composer" data-composer autocomplete="off">
      <button class="tapzy-ai-button" type="button" data-mic>Mic</button>
      <input class="tapzy-ai-input" data-input placeholder="Ask Tapzy..." />
      <button class="tapzy-ai-button tapzy-ai-send" type="submit">Go</button>
    </form>
    <section class="tapzy-ai-brain" aria-label="Tapzy Brain status">
      <div class="tapzy-ai-brain-icon">AI</div>
      <div>
        <div class="tapzy-ai-brain-title">Tapzy Brain</div>
        <div class="tapzy-ai-bar"><div class="tapzy-ai-fill" data-brain-fill></div></div>
      </div>
      <div class="tapzy-ai-percent" data-brain-percent>8%</div>
    </section>
  </main>
  <script>
    (function(){
      var root=document.querySelector('[data-tapzy-ai-room]');
      var messages=root.querySelector('[data-messages]');
      var form=root.querySelector('[data-composer]');
      var input=root.querySelector('[data-input]');
      var state=root.querySelector('[data-state-text]');
      var mic=root.querySelector('[data-mic]');
      var fill=root.querySelector('[data-brain-fill]');
      var percent=root.querySelector('[data-brain-percent]');
      var busy=false;
      var memory=[];
      var geo=null;
      function setState(text){var value=text||'Idle';state.textContent=value;root.classList.remove('is-idle','is-listening','is-thinking','is-speaking');root.classList.add('is-'+String(value).toLowerCase())}
      function setBrain(value){var score=Math.max(8,Math.min(100,Number(value)||8));fill.style.width=score+'%';percent.textContent=score+'%'}
      function add(role,text){var bubble=document.createElement('div');bubble.className='tapzy-ai-bubble '+(role==='user'?'user':'assistant');bubble.textContent=String(text||'');messages.appendChild(bubble);messages.scrollTop=messages.scrollHeight;memory.push({role:role==='user'?'user':'assistant',content:String(text||'')});memory=memory.slice(-12)}
      function speak(text){try{if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();var utterance=new SpeechSynthesisUtterance(String(text||''));utterance.rate=.96;utterance.pitch=1.02;utterance.volume=1;utterance.onstart=function(){setState('Speaking')};utterance.onend=function(){setState('Idle')};window.speechSynthesis.speak(utterance)}catch(_){setState('Idle')}}
      function getLocation(){return new Promise(function(resolve){if(geo)return resolve(geo);if(!navigator.geolocation)return resolve(null);navigator.geolocation.getCurrentPosition(function(pos){geo={latitude:pos.coords.latitude,longitude:pos.coords.longitude};resolve(geo)},function(){resolve(null)},{enableHighAccuracy:false,timeout:5500,maximumAge:300000})})}
      async function ask(text){text=String(text||'').trim();if(!text||busy)return;busy=true;add('user',text);input.value='';setState('Thinking');var thinking=document.createElement('div');thinking.className='tapzy-ai-bubble assistant';thinking.textContent='Thinking...';messages.appendChild(thinking);messages.scrollTop=messages.scrollHeight;var loc=await getLocation();try{var res=await fetch('/api/tapzy-ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,memory:memory,latitude:loc&&loc.latitude,longitude:loc&&loc.longitude,currentPath:location.pathname,currentUrl:location.href,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone})});var data=await res.json().catch(function(){return{}});var reply=data.reply||'Tapzy AI could not answer yet. Try again.';thinking.remove();add('assistant',reply);setBrain(data.brainScore);speak(reply)}catch(_){thinking.remove();var fallback='Tapzy AI had trouble connecting. Try again in a moment.';add('assistant',fallback);speak(fallback)}finally{busy=false;setTimeout(function(){if(!window.speechSynthesis||!window.speechSynthesis.speaking)setState('Idle')},900)}}
      form.addEventListener('submit',function(event){event.preventDefault();ask(input.value)});
      root.querySelectorAll('.tapzy-ai-chip').forEach(function(button){button.addEventListener('click',function(){ask(button.textContent)})});
      mic.addEventListener('click',function(){var Rec=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Rec){add('assistant','Voice typing is not supported in this browser. Type your question and I will still speak back.');return}var rec=new Rec();rec.lang='en-US';rec.interimResults=false;rec.continuous=false;setState('Listening');mic.textContent='End';rec.onresult=function(event){var text=event.results&&event.results[0]&&event.results[0][0]&&event.results[0][0].transcript||'';ask(text)};rec.onerror=function(){setState('Idle');mic.textContent='Mic'};rec.onend=function(){mic.textContent='Mic';if(!busy)setState('Idle')};rec.start()});
      add('assistant','Ask me anything. I can answer, plan, joke, help with Tapzy, and speak back.');
    })();
  </script>
</body>
</html>`);
});

module.exports = router;
