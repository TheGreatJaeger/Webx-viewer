import { createLegacyLua } from './lua/legacy.js';
import { createV2Lua } from './lua/v2.js';

import { parse as htmlparser } from './parsers/html.js';
import { parse as cssparser } from './parsers/css.js';

import { build as htmlbuilder } from './builder/html.js';
import { build as cssbuilder } from './builder/css.js';

const stdoute = document.getElementById('stdout') ?? { insertAdjacentHTML:()=>{} };
function stdout(text, type='') {
  stdoute.insertAdjacentHTML('afterbegin', `<p class="${type}">${text.replaceAll('<','&lt;')}</p>`);
}

let seenwarn = false;
function bussFetch(ip, path) {
  // TODO: Remove support for github.com
  if (ip.includes('github.com')) {
    if (seenwarn) {
      seenwarn = true;
      alert('This website is using the outdated github dns target.');
    }
    if (path=='') path = 'index.html';
    ip = ip.replace('github.com','raw.githubusercontent.com')+(ip.includes('/main/')?'':'/main/')+'/'+path;
    ip = ip.replace('/tree/','/').replaceAll(/\/{2,}/g,'/').replace(':/','://');
  } else {
    ip += path;
  }
  return new Promise((resolve, reject) => {
    try {
      fetch(ip)
        .then(res=>res.text())
        .then(res=>resolve(res))
        .catch(err=>reject(err));
    } catch(err) {
      reject(err);
    }
  })
};
function getTarget(domain) {
  return new Promise((resolve, reject)=>{
    try {
      domain = domain.toLowerCase().trim().replace(/^.*?:\/\//m,'').split('/')[0].split('?')[0].trim();
      if (!(/^[a-z0-9\-]*.[a-z0-9\-]*$/m).test(domain)) reject();
      fetch(new URL(`/domain/${domain.replace('.','/')}`, document.getElementById('dns').value))
        .then(res=>res.json())
        .then(res=>resolve(res.ip));
    } catch(err) {
      reject(err);
    }
  })
}

async function load(ip, query, html, scripts, styles) {
  let iframe = document.querySelector('iframe');
  let doc = iframe.contentDocument;
  let has_console = !!document.getElementById('sned');

  doc.querySelector('html').innerHTML = html;

  // Links
  doc.onclick = function(evt) {
    const anchor = evt.target.closest('a[href^="buss://"]');
    if (anchor) {
      evt.preventDefault();
      document.getElementById('url').value = anchor.href.replace('buss://','');
      view();
    }
  }

  // Default css
  let default_style = doc.createElement('style');
  if (document.getElementById('bussinga').checked) {
    default_style.innerHTML = `/* Bussinga default css */
@import url('https://fonts.googleapis.com/css2?family=Lexend:ital,wght@0,100..900;1,100..600&display=swap');
* {
  box-sizing: border-box;
  flex-shrink: 0;
}
.query { height: fit-content !important }
body {
  word-break: break-word;
  width: calc(100vw - 24px);
  min-height: calc(100vh - 24px);
  font-family: Lexend, Arial, sans-serif;
  padding: 12px;
  margin: 0px;
  background-color: #252524;
  color: white;
}
img { width: fit-content; }
hr {
  width: 100%;
  border: none;
  border-bottom: 1px solid white;
}
h1, h2, h3, h4, h5, h6, p, a, ul, ol { margin: 3px; }
a { color: #50889b; }
button, input, select, option {
  background-color: #393838;
  font-family: Noto Sans;
  transition: 0.2s;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 18px;
  padding-top: 12px;
  padding-bottom: 12px;
}
select, option {
  color: black;
  margin: 0;
  padding-top: 8px;
  padding-bottom: 8px;
  outline: none;
}
input { box-shadow: 0 0 3px black inset; }
button:hover {
  background-color: #656565;
  transition: 0.2s;
}`;
  } else {
    default_style.innerHTML = `/* Napture default css */
@import url('https://fonts.googleapis.com/css2?family=Lexend:ital,wght@0,100..900;1,100..600&display=swap');
body {
  font-family: Lexend, Arial, sans-serif;
  color: #F7F7F7;
  background-color: #2C2C2C;
  word-break: break-word;
}
body, div {
  display: flex;
  gap: 10px;
  flex-direction: column;
  align-items: self-start;
}
h1, h2, h3, h4, h5, h6, p {
 font-weight: normal;
 margin: 0px;
}
h1 { font-size: 24pt; }
h2 { font-size: 22pt; }
h3 { font-size: 20pt; }
h4 { font-size: 18pt; }
h5 { font-size: 16pt; }
h6 { font-size: 14pt; }
a { color: #67B7D1; }
button {
  color: #F6F6F6;
  font-weight: bold;
  font-family: inherit;
  padding: 9px;
  border: none;
  border-radius: 5px;
  background-color: #414141;
  transition: 250ms;
}
input, textarea {
  padding: 6px;
  border: 1px #616161 solid;
  border-radius: 12px;
}
textarea {
  width: 400px;
  height: 100px;
}
hr {
  width: 100%;
  height: 1px;
  border: none;
  background-color: #4A4A4A;
}`;
  }
  doc.head.appendChild(default_style);
  // Page css
  for (let i = 0; i<styles.length; i++) {
    if (!styles[i].endsWith('.css')) {
      styles[i]=null;
      continue;
    }
    styles[i] = await bussFetch(ip, styles[i]);
  }
  styles
    .filter(styl=>styl??false)
    .forEach(styl=>{
      if (!styl) return;
      let dstyl = doc.createElement('style');
      if (!document.getElementById('bussinga').checked||!styl.includes('/* bussinga! */')) {
        if (styl.includes('/* bussinga! */')) {
          stdout('[Warn] Site uses bussinga css, but you are not using bussinga mode.', 'warn');
        }
        let style = cssparser(styl);
        styl = cssbuilder(style);
      }
      dstyl.innerHTML = styl;
      doc.head.appendChild(dstyl);
    });

  // Lua
  for (let i = 0; i<scripts.length; i++) {
    scripts[i].code = await bussFetch(ip, scripts[i].src);
  }
  window.luaEngine = [];
  window.luaGlobal = {};
  scripts.forEach(async script => {
    let lua;
    let options = {
      query,
      bussinga: document.getElementById('bussinga').checked,
      proxy: document.getElementById('proxy').checked
    };
    if (script.version==='2') {
      lua = await createV2Lua(doc, options, stdout);
    } else if (script.version==='legacy') {
      script.code = script.code
        .replace(/(\.(on_click|on_input|on_submit)\s*\()\s*function\s*\(/g, '$1async(function(')
        .replace(/(\.(on_click|on_input|on_submit)\(async\(function\([^]*?\bend\b)\)/g, '$1))')
        .replace(/(\bfetch\s*\(\{[\s\S]*?\}\))(?!(\s*:\s*await\s*\())/g, '$1:await()');
      lua = await createLegacyLua(doc, options, stdout);
    } else {
      stdout(`Unknwon version: ${script.version} for: ${script.src}`, 'error');
    }
    if (has_console) {
      window.luaEngine.push([lua, script.version]);
      let i = -1;
      document.getElementById('ctx').innerHTML = window.luaEngine.map(r=>{i++;return`<option value="${i}">${i} (${r[1]})</option>`}).join('');
    }
    try {
      await lua.doString(script.code);
    } catch(err) {
      console.log(err);
      stdout(err.message, 'error');
    }
  });
}

async function view() {
  let iframe = document.querySelector('iframe');
  let ip = document.getElementById('url').value.trim();
  let query = ip.split('?')[1]??'';
  let target = ip;

  if (!(/^https?:\/\//m).test(ip)) target = await getTarget(ip);
  if (!target.includes('://')) target = 'https://'+target;

  iframe.onload = async() => {
    let page = await bussFetch(target, '');
    let tree = htmlparser(page);
    let build = htmlbuilder(tree, target);
    load(target, query, ...build[0]);
  };
  iframe.contentDocument.location.reload();
}
window.view = view;

// Console run
if (document.getElementById('sned')) {
  document.getElementById('sned').onclick = function(){
    try {
      window.luaEngine[Number(document.getElementById('ctx').value)][0].doString(document.getElementById('code').value);
    } catch(err) {
      console.log(err);
      stdout(err.message, 'error');
    }
  };
  document.getElementById('code').oninput = function(event){
    event.target.setAttribute('rows', Math.max(event.target.value.split('\n').length, 1));
  };
}

await lua.global.set("play_audio", (url) => {
  const audio = new Audio(url);
  audio.play();
});
