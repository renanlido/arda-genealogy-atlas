const locales = ['pt-BR','en','es','de'];
const parameters = new URLSearchParams(location.search);
const localeConfig = {intl:locales.includes(parameters.get('lang')) ? parameters.get('lang') : 'pt-BR'};
const byId = new Map(people.map(person=>[person.id,person]));
const cardNodes = new Map();
const paths = [];
const articleNodes = [];
const get = id => document.getElementById(id);
const view = get('viewport');
const world = get('world');
const svg = get('edges');
const nodes = get('nodes');
const camera = createCamera(view,world,get('camera-tools'));
const nameOrder = () => new Intl.Collator(localeConfig.intl,{sensitivity:'base'});
let active;

function localize(values) {
  return values[locales.indexOf(localeConfig.intl)];
}

function message(key) {
  return localize(strings[key]);
}

function element(tag,text='',className='') {
  const node = document.createElement(tag);
  if (text) node.textContent=text;
  if (className) node.className=className;
  return node;
}

function sourceLink(sourceId) {
  const source = sources[sourceId];
  const anchor = element('a',localize(source.title));
  anchor.href=source.url;
  return anchor;
}

function formatReference(reference) {
  if (reference.length===1) return localize(['Apêndice','Appendix','Apéndice','Anhang'])+' '+reference;
  return reference.replace('O Silmarillion',localize(['O Silmarillion','The Silmarillion','El Silmarillion','Das Silmarillion']))
    .replace(' e ',localize([' e ',' and ',' y ',' und ']));
}

function writeAddress() {
  const address = new URL(location.href);
  if (active) address.searchParams.set('person',active);
  address.searchParams.set('lang',localeConfig.intl);
  history.replaceState(null,'',address);
}

function cardStatus(person) {
  if (person.status==='aberto') return message('abertoCurto');
  if (person.status==='partida') return message('partidaCurta')+' · '+person.date;
  return '† '+person.date;
}

function linePath(first,last,type,bend) {
  if (type==='union' || type==='sibling') return 'M '+first.x+' '+first.y+' H '+last.x;
  const start = first.y+31;
  const end = last.y-31;
  const middle = bend ?? (start+end)/2;
  return 'M '+first.x+' '+start+' V '+middle+' H '+last.x+' V '+end;
}

function drawGraph() {
  nodes.replaceChildren();
  svg.replaceChildren();
  cardNodes.clear();
  paths.length=0;
  for (const [from,to,kind,bend] of connections) {
    const path = document.createElementNS(svg.namespaceURI,'path');
    path.setAttribute('class','edge '+kind);
    path.setAttribute('d',linePath(byId.get(from),byId.get(to),kind,bend));
    svg.append(path);
    paths.push({from,to,kind,path});
  }
  for (const [key,x,y] of [['casaElrond',24,17],['casaRohan',825,17],['reis',22,576]]) {
    const label=element('span',message(key),'lane');
    label.style.left=x+'px';
    label.style.top=y+'px';
    nodes.append(label);
  }
  for (const person of people) {
    const card=element('button','','person');
    card.type='button';
    card.setAttribute('aria-pressed','false');
    card.dataset.person=person.id;
    card.style.left=(person.x-71)+'px';
    card.style.top=(person.y-31)+'px';
    card.append(element('span',person.name),element('time',cardStatus(person)));
    card.addEventListener('click',()=>selectPerson(person.id));
    card.addEventListener('focus',()=>{
      const frame=view.getBoundingClientRect();
      const rect=card.getBoundingClientRect();
      if (rect.left<frame.left || rect.right>frame.right || rect.top<frame.top || rect.bottom>frame.bottom) {
        camera.center(person.x,person.y,.97);
      }
    });
    nodes.append(card);
    cardNodes.set(person.id,card);
  }
}

function trace(start,direction) {
  const found = new Set([start]);
  const pending = [start];
  while (pending.length) {
    const current = pending.pop();
    for (const [parent,child,kind] of connections) {
      if (kind!=='parent' && kind!=='gap') continue;
      const first = direction==='up' ? child : parent;
      const next = direction==='up' ? parent : child;
      if (first!==current || found.has(next)) continue;
      found.add(next);
      pending.push(next);
    }
  }
  return found;
}

function drawProfile(person) {
  const profile=get('profile');
  const name=element('h3',person.name);
  const date=element('p',[message(person.status),person.date].filter(Boolean).join(' · '),'status');
  const groups = {pais:[],filhos:[],unioes:[],irmaos:[],ramos:[]};
  for (const [from,to,kind] of connections) {
    if (from!==person.id && to!==person.id) continue;
    const other=from===person.id?to:from;
    const key=kind==='gap'?'ramos':kind==='union'?'unioes':kind==='sibling'?'irmaos':from===person.id?'filhos':'pais';
    groups[key].push(other);
  }
  const entries = [];
  for (const [key,ids] of Object.entries(groups)) {
    if (!ids.length) continue;
    const wrapper=element('div','','related');
    wrapper.append(element('strong',message(key)));
    for (const id of ids) {
      const button=element('button',byId.get(id).name);
      button.type='button';
      button.addEventListener('click',()=>selectPerson(id,true));
      wrapper.append(button);
    }
    entries.push(wrapper);
  }
  for (const [index,reading] of readings.entries()) {
    if (!reading.people.includes(person.id)) continue;
    const anchor=element('a',localize(reading.title));
    anchor.href='#reading-'+index;
    anchor.addEventListener('click',()=>{articleNodes[index].open=true;});
    const finding=element('p');
    finding.append(anchor);
    entries.push(finding);
  }
  const citation=element('p',formatReference(person.reference)+' · ');
  citation.append(sourceLink(person.source));
  profile.replaceChildren(name,date,...entries,citation);
}

function selectPerson(id,center=false,persist=true) {
  if (!byId.has(id)) return;
  active=id;
  const person = byId.get(id);
  const ancestors=trace(id,'up');
  const descendants=trace(id,'down');
  const highlighted=new Set([...ancestors,...descendants]);
  for (const [from,to,kind] of connections) {
    if (kind!=='union' && kind!=='sibling') continue;
    if (from===id) highlighted.add(to);
    if (to===id) highlighted.add(from);
  }
  for (const [key,card] of cardNodes) {
    card.classList.toggle('active',highlighted.has(key));
    card.classList.toggle('muted',!highlighted.has(key));
    card.setAttribute('aria-pressed',String(key===id));
  }
  for (const {from,to,kind,path} of paths) {
    const line=kind==='parent' || kind==='gap';
    const lit=line
      ? [ancestors,descendants].some(set=>set.has(from) && set.has(to))
      : from===id || to===id;
    path.classList.toggle('active',lit);
    path.classList.toggle('muted',!lit);
  }
  get('person-picker').value=id;
  drawProfile(person);
  if (center) camera.center(person.x,person.y,view.clientWidth<600?.72:.96);
  if (persist) writeAddress();
}

function drawReadings() {
  const grid = get('articles-grid');
  const list = get('references-list');
  const open = articleNodes.map(details=>details.open);
  grid.replaceChildren();
  list.replaceChildren();
  articleNodes.length=0;
  for (const [index,reading] of readings.entries()) {
    const article=element('article','','reading');
    article.id='reading-'+index;
    const details=element('details');
    details.open=Boolean(open[index]) || location.hash==='#'+article.id;
    const refs=element('p','','read-source');
    refs.append(...reading.refs.map(sourceLink));
    details.append(element('summary',message('ler')),element('p',localize(reading.text)),refs);
    article.append(element('h3',localize(reading.title)),details);
    articleNodes.push(details);
    grid.append(article);
  }
  for (const [key,source] of Object.entries(sources)) {
    const item=element('li');
    item.append(sourceLink(key),' · '+localize(source.note));
    list.append(item);
  }
}

function drawLanguage() {
  document.documentElement.lang=localeConfig.intl;
  document.title=message('titulo');
  get('nav').setAttribute('aria-label',message('navegar'));
  get('language').value=localeConfig.intl;
  for (const node of document.querySelectorAll('[data-text]')) node.textContent=message(node.dataset.text);
  for (const node of document.querySelectorAll('[data-aria]')) node.setAttribute('aria-label',message(node.dataset.aria));
  const picker=get('person-picker');
  const compare=nameOrder();
  picker.replaceChildren(...[...people].sort((a,b)=>compare.compare(a.name,b.name)).map(person=>{
    const option=element('option',person.name);
    option.value=person.id;
    return option;
  }));
  drawReadings();
  drawGraph();
  camera.paint();
}

get('person-picker').addEventListener('change',event=>selectPerson(event.target.value,true));
get('language').addEventListener('change',event=>{
  if (!locales.includes(event.target.value)) return;
  localeConfig.intl=event.target.value;
  drawLanguage();
  selectPerson(active);
});
window.addEventListener('hashchange',()=>{
  const target=document.getElementById(location.hash.slice(1));
  const details=target?.matches('.reading') ? target.querySelector('details') : null;
  if (details) details.open=true;
});

camera.size(1410,822);
drawLanguage();
const startingPerson=byId.has(parameters.get('person'))?parameters.get('person'):'arwen';
if (matchMedia('(max-width: 760px)').matches || parameters.has('person')) selectPerson(startingPerson,true,false);
else {
  camera.fit();
  selectPerson(startingPerson,false,false);
}
