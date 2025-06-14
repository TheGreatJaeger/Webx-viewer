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
  if (ip.includes('github.com')) {
    if (!seenwarn) {
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
  });
};

function getTarget(domain) {
  return new Promise((resolve, reject)=>{
    try {
      domain = domain.toLowerCase().trim().replace(/^.*?:\/\//m,'').split('/')[0].split('?')[0].trim();
      if (!(/^[a-z0-9\-]*\.[a-z0-9\-]*$/m).test(domain)) reject();
      fetch(new URL(`/domain/${domain.replace('.','/')}`, document.getElementById('dns').value))
        .then(res=>res.json())
        .then(res=>resolve(res.ip));
    } catch(err) {
      reject(err);
    }
  });
}

async function load(ip, query, html, scripts, styles) {
  let iframe = document.querySelector('iframe');
  let doc = iframe.contentDocument;
  let has_console = !!document.getElementById('sned');

  doc.querySelector('html').innerHTML = html;
  doc.onclick = function(evt) {
    const anchor = evt.target.closest('a[href^="buss://"]');
    if (anchor) {
      evt.preventDefault();
      document.getElementById('url').value = anchor.href.replace('buss://','');
      view();
    }
  }

  let default_style = doc.createElement('style');
  if (document.getElementById('bussinga').checked) {
    default_style.innerHTML = `/* Bussinga default css */ ...`;
  } else {
    default_style.innerHTML = `/* Napture default css */ ...`;
  }
  doc.head.appendChild(default_style);

  for (let i = 0; i<styles.length; i++) {
    if (!styles[i].endsWith('.css')) {
      styles[i]=null;
      continue;
    }
    styles[i] = await bussFetch(ip, styles[i]);
  }
  styles.filter(styl=>styl??false).forEach(styl=>{
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
        .replace(/(\bfetch\s*\(\{[\s\S]*?\})(?!(\s*:\s*await\s*\())/g, '$1:await()');
      lua = await createLegacyLua(doc, options, stdout);
    } else {
      stdout(`Unknwon version: ${script.version} for: ${script.src}`, 'error');
    }
    if (has_console) {
      window.luaEngine.push([lua, script.version]);
      let i = -1;
      document.getElementById('ctx').innerHTML = window.luaEngine.map(r=>{i++;return`<option value="${i}">${i} (${r[1]})</option>`}).join('');
    }

    await lua.global.set("play_audio", (url) => {
      try {
        const audio = new Audio(url);
        audio.play();
      } catch (err) {
        stdout(`Audio error: ${err.message}`, 'error');
      }
    });

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
