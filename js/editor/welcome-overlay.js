/* LOT KING — concise editor welcome and experimental-status notice. */
(function(){
'use strict';

const HIDDEN_KEY = 'lotking.editor.welcome.hidden.v1';
const COPY = {
  en:{
    title:'Welcome to Lot King Engine',
    intro:'Build levels, import assets, create cinematics and test gameplay directly in the browser.',
    features:['Level editor + Play Preview','Cinema Studio and reusable assets','Visual scripting with Logic Elements'],
    warning:'Experimental notice: many features have been tested, but some remain incomplete or untested. “Experimental” means node coverage and workflows are still limited. For Player Car projects, use the native player_car (Logic); the Player Car Logic Element is still in development.',
    hide:'Do not show this message again',
    continue:'Open Editor',
  },
  it:{
    title:'Benvenuto in Lot King Engine',
    intro:'Crea livelli, importa asset, realizza cinematiche e prova il gameplay direttamente nel browser.',
    features:['Editor livelli + Play Preview','Cinema Studio e asset riutilizzabili','Visual scripting con Logic Elements'],
    warning:'Avviso sperimentale: molte funzioni sono state testate, ma alcune restano incomplete o non verificate. “Sperimentale” indica nodi e flussi ancora limitati. Per i progetti Player Car usa player_car (Logic) nativo; il Player Car Logic Element è ancora in sviluppo.',
    hide:'Non mostrare più questo messaggio',
    continue:'Apri Editor',
  },
};

function create(options){
  const opts = options || {};
  const root = opts.root;
  const preferences = opts.preferences;
  const overlay = root && root.querySelector('#lkWelcomeOverlay');
  if(!overlay) return Object.freeze({open(){}, close(){}});
  const q = selector => overlay.querySelector(selector);

  function language(){ return preferences && preferences.lang ? preferences.lang() : 'en'; }
  function render(){
    const lang = language();
    const copy = COPY[lang] || COPY.en;
    q('#lkWelcomeTitle').textContent = copy.title;
    q('#lkWelcomeIntro').textContent = copy.intro;
    q('#lkWelcomeFeatures').innerHTML = copy.features.map(item => '<span>✓ ' + item + '</span>').join('');
    q('#lkWelcomeWarning').textContent = copy.warning;
    q('#lkWelcomeHideLabel').textContent = copy.hide;
    q('#lkWelcomeContinue').textContent = copy.continue;
    overlay.querySelectorAll('[data-welcome-lang]').forEach(button => button.classList.toggle('on', button.dataset.welcomeLang === lang));
  }
  function open(force){
    if(!force){
      try { if(localStorage.getItem(HIDDEN_KEY) === '1') return; } catch(err){}
    }
    q('#lkWelcomeHide').checked = false;
    render();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
  }
  function close(){
    if(q('#lkWelcomeHide').checked){ try { localStorage.setItem(HIDDEN_KEY,'1'); } catch(err){} }
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
  }
  overlay.querySelectorAll('[data-welcome-lang]').forEach(button => button.addEventListener('click', () => {
    if(preferences && preferences.setLang) preferences.setLang(button.dataset.welcomeLang);
    render();
  }));
  q('#lkWelcomeClose').addEventListener('click', close);
  q('#lkWelcomeContinue').addEventListener('click', close);
  overlay.addEventListener('click', event => { if(event.target === overlay) close(); });
  const showButton = root.querySelector('#lkShowWelcome');
  if(showButton) showButton.addEventListener('click', () => {
    try { localStorage.removeItem(HIDDEN_KEY); } catch(err){}
    open(true);
  });
  window.addEventListener('lotking:languagechange', render);
  setTimeout(() => open(false), 0);
  return Object.freeze({open, close, render});
}

window.LK_EDITOR_WELCOME = Object.freeze({create});
})();
