function createCamera(view, world, controls, update = () => {}) {
  let width = 1;
  let height = 1;
  let scale = 1;
  let x = 0;
  let y = 0;
  let suppressClick = false;
  const pointers = new Map();
  const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
  const fitScale = () => Math.min(1,(view.clientWidth-18)/width,(view.clientHeight-18)/height);
  const minScale = () => Math.max(.008,fitScale());
  const maxScale = 2.6;

  function limitAxis(offset, size, extent) {
    if (extent <= size) return (size-extent)/2;
    const margin = size*.48;
    return clamp(offset,size-extent-margin,margin);
  }

  function paint() {
    if (!view.clientWidth || !view.clientHeight) return;
    x = limitAxis(x,view.clientWidth,width*scale);
    y = limitAxis(y,view.clientHeight,height*scale);
    world.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    world.style.setProperty('--inverse-zoom',1/scale);
    view.dataset.overviewScale = scale < .25 ? 'far' : 'near';
    controls.querySelector('output').textContent = new Intl.NumberFormat(localeConfig.intl,{style:'percent',maximumFractionDigits:0}).format(scale);
    controls.querySelector('[data-camera=out]').disabled = scale <= minScale()+.0001;
    controls.querySelector('[data-camera=in]').disabled = scale >= maxScale-.0001;
    update({x,y,scale,width,height,viewWidth:view.clientWidth,viewHeight:view.clientHeight});
  }

  function size(w,h) {
    width = w;
    height = h;
    world.style.width = w+'px';
    world.style.height = h+'px';
  }

  function center(wx,wy,nextScale = scale) {
    scale = clamp(nextScale,minScale(),maxScale);
    x = view.clientWidth/2-wx*scale;
    y = view.clientHeight/2-wy*scale;
    paint();
  }

  function fit() {
    if (view.clientWidth > 0 && view.clientHeight > 0) center(width/2,height/2,fitScale());
  }

  function zoom(factor, px = view.clientWidth/2, py = view.clientHeight/2, nextX = px, nextY = py) {
    const target = clamp(scale*factor,minScale(),maxScale);
    x = nextX-(px-x)*target/scale;
    y = nextY-(py-y)*target/scale;
    scale = target;
    paint();
  }

  function pan(dx,dy) {
    x += dx;
    y += dy;
    paint();
  }

  function show(rect, inset = 36, max = 1.2) {
    const desired = Math.min((view.clientWidth-inset*2)/rect.w,(view.clientHeight-inset*2)/rect.h,max);
    center(rect.x+rect.w/2,rect.y+rect.h/2,desired);
  }

  function coords(event) {
    const rect = view.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }

  function pinch() {
    const [a,b] = pointers.values();
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,span:Math.hypot(a.x-b.x,a.y-b.y)};
  }

  controls.addEventListener('click',event => {
    const action = event.target.closest('button')?.dataset.camera;
    if (action === 'in') zoom(1.45);
    if (action === 'out') zoom(1/1.45);
    if (action === 'fit') fit();
  });
  view.addEventListener('wheel',event => {
    if (event.target.closest('[data-map-chrome]')) return;
    event.preventDefault();
    const amount = event.deltaY*(event.deltaMode === 1 ? 14 : event.deltaMode === 2 ? 180 : 1);
    const point = coords(event);
    zoom(Math.exp(-clamp(amount,-180,180)*.007),point.x,point.y);
  },{passive:false});
  view.addEventListener('keydown',event => {
    if (event.target !== view) return;
    const step = event.shiftKey ? 180 : 72;
    const moves = {ArrowLeft:[step,0],ArrowRight:[-step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};
    if (event.key in moves) pan(...moves[event.key]);
    else if (event.key === '+' || event.key === '=') zoom(1.45);
    else if (event.key === '-') zoom(1/1.45);
    else if (event.key === 'Home') fit();
    else return;
    event.preventDefault();
  });

  view.addEventListener('pointerdown',event => {
    if (event.button !== 0 || event.target.closest('[data-map-chrome]')) return;
    if (!pointers.size) suppressClick = false;
    const point = coords(event);
    pointers.set(event.pointerId,{...point,startX:point.x,startY:point.y});
    if (pointers.size === 2) {
      suppressClick = true;
      view.classList.add('dragging');
      for (const id of pointers.keys()) view.setPointerCapture(id);
    }
  });

  view.addEventListener('pointermove',event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const point = coords(event);
    if (pointers.size > 1) {
      const before = pinch();
      pointers.set(event.pointerId,{...previous,...point});
      const after = pinch();
      zoom(after.span/Math.max(8,before.span),before.x,before.y,after.x,after.y);
      return;
    }
    const distance = Math.hypot(point.x-previous.startX,point.y-previous.startY);
    if (!suppressClick && distance < 5) return;
    if (!suppressClick) {
      suppressClick = true;
      view.classList.add('dragging');
      view.setPointerCapture(event.pointerId);
    }
    pointers.set(event.pointerId,{...previous,...point});
    pan(point.x-previous.x,point.y-previous.y);
  });

  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) view.classList.remove('dragging');
  }

  view.addEventListener('pointerup',release);
  view.addEventListener('pointercancel',release);
  view.addEventListener('pointerleave',event => {
    if (!view.hasPointerCapture(event.pointerId)) release(event);
  });
  view.addEventListener('click',event => {
    if (!suppressClick || !event.detail || event.target.closest('[data-map-chrome]')) return;
    event.stopPropagation();
    event.preventDefault();
    suppressClick = false;
  },true);

  let oldWidth = 0;
  let oldHeight = 0;
  new ResizeObserver(() => {
    const vw = view.clientWidth;
    const vh = view.clientHeight;
    if (!vw || !vh) return;
    if (oldWidth && oldHeight) {
      x += (vw-oldWidth)/2;
      y += (vh-oldHeight)/2;
    }
    oldWidth = vw;
    oldHeight = vh;
    paint();
  }).observe(view);

  return {size,center,fit,show,paint};
}
