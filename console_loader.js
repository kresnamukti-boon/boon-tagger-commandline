/* Boon Region Workbench — console loader.
 * Usage: F12 -> Console -> paste this entire block -> Enter.
 * Installs the full workbench (regions, mask tools, undo, commit, helpers).
 * Paste again after each page navigation. Nothing persists server-side until you Save. */
(async function(){
  function ready(){
    return typeof annotationState !== 'undefined'
        && annotationState.annotations
        && document.getElementById('pdf-canvas')
        && document.getElementById('annotation-canvas')
        && document.getElementById('right-rail-content');
  }
  // wait for app (up to 30s) — safe to paste immediately on page load
  for (let i=0; i<60 && !ready(); i++) await new Promise(r=>setTimeout(r,500));
  if (!ready()){ console.warn('[RW] app not ready after 30s — try pasting again once the page renders'); return; }
  await new Promise(r=>setTimeout(r,600)); // let the canvas settle

// ===== rw_panelux.js =====
// RW v2.8 — collapsible panel + master killswitch.
// MUST be loaded FIRST (before rw_install). Establishes RW.enabled and
// wraps annotation-canvas's addEventListener so every handler registered
// by subsequent modules checks RW.enabled automatically.
// Panel UX (collapse/resize/toggle) attaches at the end.
(function boot(){
  'use strict';

  // Do NOT create __RW here — rw_install will create it. We just set up
  // the addEventListener wrappers so subsequent modules get auto-gated.
  // After rw_install runs, poll for __RW and attach our state + panel UX.

  // We need RW.enabled accessible BEFORE rw_install runs (the wrapper checks
  // it). Store it on a separate object that the wrapper reads.
  if (!window.__RWgate) window.__RWgate = { enabled: true };
  const gate = window.__RWgate;

  /* ---------- auto-gate all annotation-canvas listeners ---------- */
  // Override addEventListener on the annotation-canvas so any handler
  // registered by us checks RW.enabled first. Store the original under
  // _rawAdd so the override itself doesn't get wrapped.
  const ac = document.getElementById('annotation-canvas');
  if (ac && !ac.__RWrawAdd){
    ac.__RWrawAdd = ac.addEventListener;
    ac.addEventListener = function(type, handler, options){
      const wrapped = function(e){
        if (!window.__RWgate || !window.__RWgate.enabled) return;
        return handler.call(this, e);
      };
      return ac.__RWrawAdd.call(ac, type, wrapped, options);
    };
  }

  // Also wrap window keydown (capture) for the modules that attach there
  if (!window.__RWrawAddKey){
    window.__RWrawAddKey = window.addEventListener;
    window.addEventListener = function(type, handler, options){
      if (type === 'keydown' && options === true){
        // This is how our modules attach key handlers (capture phase)
        const wrapped = function(e){
          if (!window.__RWgate || !window.__RWgate.enabled) return;
          return handler.call(this, e);
        };
        return window.__RWrawAddKey.call(window, type, wrapped, options);
      }
      return window.__RWrawAddKey.call(window, type, handler, options);
    };
  }

  /* ---------- post-init: retrofits panel after all modules loaded ---------- */
  function retrofit(){
    const RW = window.__RW;
    if (!RW) return;
    const panel = document.getElementById('rw-panel');
    if (!panel) return;

    // sync the enabled flag from our gate object to RW
    RW.enabled = gate.enabled;
    RW.v28 = true;

    // wrap existing children into collapsible body
    const body = document.createElement('div');
    body.id = 'rw-body';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    panel.appendChild(body);

    // header bar
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 0;cursor:pointer;user-select:none;';

    const caret = document.createElement('span');
    caret.id = 'rw-collapse';
    caret.style.cssText = 'font-size:11px;flex:none;';
    caret.innerHTML = '&#9660;';
    caret.title = 'Collapse Region Workbench';
    caret.onclick = (e)=>{ e.stopPropagation(); RW.setPanelExpanded(!RW.panelExpanded); };

    const title = document.createElement('b');
    title.innerText = 'Region Workbench';
    title.style.cssText = 'font-size:12px;flex:1;';

    const enableBtn = document.createElement('button');
    enableBtn.id = 'rw-enable';
    enableBtn.style.cssText = 'font-size:11px;padding:1px 6px;flex:none;border-radius:3px;';
    enableBtn.onclick = (e)=>{ e.stopPropagation(); RW.setEnabled(!RW.enabled); };

    header.appendChild(caret);
    header.appendChild(title);
    header.appendChild(enableBtn);
    header.onclick = (e)=>{
      if (e.target === header || e.target === title) RW.setPanelExpanded(!RW.panelExpanded);
    };
    panel.insertBefore(header, body);

    // panel styling
    panel.style.position = 'relative';
    panel.style.resize = 'vertical';
    panel.style.overflow = 'auto';
    panel.style.minHeight = '32px';
    panel.style.maxHeight = '50%';

    /* ---------- panel state ---------- */
    RW.panelExpanded = true;
    RW.setPanelExpanded = function(on){
      RW.panelExpanded = !!on;
      const p = document.getElementById('rw-panel');
      const b = document.getElementById('rw-body');
      const c = document.getElementById('rw-collapse');
      if (!p || !c) return;
      if (RW.panelExpanded){
        p.style.maxHeight = '50%';
        if (b) b.style.display = '';
        c.innerHTML = '&#9660;';
        c.title = 'Collapse Region Workbench';
      } else {
        p.style.maxHeight = '32px';
        if (b) b.style.display = 'none';
        c.innerHTML = '&#9654;';
        c.title = 'Expand Region Workbench';
      }
    };

    RW.setEnabled = function(on){
      gate.enabled = !!on;
      RW.enabled = !!on;
      const btn = document.getElementById('rw-enable');
      if (btn){
        btn.innerText = 'RW: ' + (RW.enabled ? 'ON' : 'OFF');
        btn.style.background = RW.enabled ? 'rgba(100,220,100,0.25)' : 'rgba(220,100,100,0.30)';
      }
      const overlay = document.getElementById('rw-overlay');
      if (overlay){
        if (RW.overlayHidden) overlay.style.display = 'none';
        else overlay.style.opacity = RW.enabled ? '0.55' : '0.12';
      }
      if (!RW.enabled){
        RW.maskMode = null; RW.maskMode2 = null; RW.setPick(false);
        RW._polyPtsN = []; RW.__rectStartN = null; RW.__rectCurN = null;
        const av = document.getElementById('annotation-canvas');
        if (av) av.style.cursor = '';
        ['rw-polyline','rw-rectline','rw-brushline','rw-commitpreview'].forEach(id=>{
          const el = document.getElementById(id); if(el) el.remove();
        });
        if (RW._syncRectBtn) RW._syncRectBtn();
        if (RW._syncToolButtons) RW._syncToolButtons();
      }
    };

    RW.setEnabled(true);
    RW.setPanelExpanded(true);
  }

  // The panel is built by rw_install (v2). Schedule retrofit after all modules run.
  setTimeout(retrofit, 100);
  // Backup: if setTimeout fires before rw_install, poll
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    const p = document.getElementById('rw-panel');
    if (p && p.children.length > 0){
      if (!document.getElementById('rw-collapse')){
        retrofit();
        clearInterval(poll);
      }
    }
    if (tries > 80) clearInterval(poll);
  }, 250);

  return 'v2.8 boot: listener gate + panel UX pending';
})()

;
// ===== rw_install.js =====
// Region Workbench v2 — single-shot installer.
// Paste-injected via OpenCLI eval. All listeners named/registered once.
(function(){
  if (window.__RW && window.__RW.v === 2) return 'RW v2 already installed';

  const RW = window.__RW = { v: 2, W: 2592, H: 1728, selected: new Set(), hovered: null, pickMode: false };

  /* ---------- segmentation ---------- */
  RW.extract = function(){
    const src = document.getElementById('pdf-canvas');
    // scale extraction resolution to native canvas size so thin lines survive
    let {W,H} = RW;
    const nw = src.width, nh = src.height;
    if (nw && nh && (nw > W*1.3 || nh > H*1.3)){
      W = RW.W = Math.min(nw, 3888);
      H = RW.H = Math.round(W * (nh/nw));
      // clamp region size threshold proportionally
      RW._areaFloor = Math.round(2500 * (W*H) / (2592*1728));
    }
    const areaFloor = RW._areaFloor || 2500;
    // ... rest of extraction
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0, W, H);
    const d = ctx.getImageData(0,0,W,H).data;
    let wall = new Uint8Array(W*H);
    for (let i=0;i<W*H;i++){
      // use minimum RGB channel to catch colored lines (yellow, green, blue)
      // on white background (255,255,255 → min=255). any color drop = line
      const minChan = Math.min(d[i*4], d[i*4+1], d[i*4+2]);
      if (minChan < 200) wall[i]=1;
    }
    // no morphological pass — raw luminance only.
    // mask boundary sits at line edge. curves follow pixel data directly.
    // knock out existing annotations
    const c2 = document.createElement('canvas'); c2.width=W; c2.height=H;
    const x2 = c2.getContext('2d');
    for (const a of annotationState.annotations){
      if (a._hidden || a.is_void) continue;
      const pts = a.coordinates; if (!pts||!pts.length) continue;
      x2.fillStyle='#000';
      x2.beginPath();
      pts.forEach((p,i)=>{ const X=p.x*W, Y=p.y*H; i?x2.lineTo(X,Y):x2.moveTo(X,Y); });
      x2.closePath(); x2.fill();
    }
    const dd = x2.getImageData(0,0,W,H).data;
    for (let i=0;i<W*H;i++) if (dd[i*4+3]>127) wall[i]=1;
    // background flood from border
    const seen = new Uint8Array(W*H);
    const q=[];
    for (let x=0;x<W;x++){ q.push(x,(H-1)*W+x); }
    for (let y=0;y<H;y++){ q.push(y*W,y*W+W-1); }
    while(q.length){
      const i=q.pop();
      if (seen[i]||wall[i]) continue;
      seen[i]=1;
      const x=i%W, y=(i/W)|0;
      if(x>0)q.push(i-1); if(x<W-1)q.push(i+1);
      if(y>0)q.push(i-W); if(y<H-1)q.push(i+W);
    }
    // label enclosed components
    const labels = new Int32Array(W*H).fill(-1);
    let nComp=0; const sizes=[];
    for (let s=0;s<W*H;s++){
      if (seen[s]||wall[s]||labels[s]>=0) continue;
      const stack=[s]; labels[s]=nComp; let size=0;
      while(stack.length){
        const i=stack.pop(); size++;
        const x=i%W, y=(i/W)|0;
        if(x>0&&!seen[i-1]&&!wall[i-1]&&labels[i-1]<0){labels[i-1]=nComp;stack.push(i-1);}
        if(x<W-1&&!seen[i+1]&&!wall[i+1]&&labels[i+1]<0){labels[i+1]=nComp;stack.push(i+1);}
        if(y>0&&!seen[i-W]&&!wall[i-W]&&labels[i-W]<0){labels[i-W]=nComp;stack.push(i-W);}
        if(y<H-1&&!seen[i+W]&&!wall[i+W]&&labels[i+W]<0){labels[i+W]=nComp;stack.push(i+W);}
      }
      sizes.push(size); nComp++;
    }
    RW.labels=labels; RW.nComp=nComp; RW.wall=wall;
    RW.regions = sizes.map((size,id)=>({id, size, included: size>=areaFloor, group: id, color:'hsl('+((id*67)%360)+',70%,55%)'}));
    return {components:nComp, kept: RW.regions.filter(r=>r.included).length, W, H};
  };

  /* ---------- overlay ---------- */
  RW.renderOverlay = function(){
    const {W,H,labels,regions,selected,hovered} = RW;
    const old = document.getElementById('rw-overlay'); if(old) old.remove();
    const cv = document.createElement('canvas'); cv.width=W; cv.height=H;
    cv.id='rw-overlay';
    cv.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:45;opacity:0.55;image-rendering:auto;';
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W,H);
    const tmp = document.createElement('canvas').getContext('2d');
    const groupColor = {};
    for (const r of regions){
      if (!r.included || (r.group in groupColor)) continue;
      tmp.fillStyle = r.color;
      groupColor[r.group] = tmp.fillStyle.match(/\d+/g).map(Number);
    }
    for (let i=0;i<W*H;i++){
      const l = labels[i];
      if (l<0) continue;
      const r = regions[l];
      if (!r || !r.included) continue;
      const c = groupColor[r.group] || [200,200,200];
      let a = 110;
      if (selected.has(r.group)) a = 255;
      else if (hovered === r.group) a = 220;
      img.data[i*4]=c[0]; img.data[i*4+1]=c[1]; img.data[i*4+2]=c[2]; img.data[i*4+3]=a;
    }
    if (selected.size){
      for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++){
        const i=y*W+x; const l=labels[i];
        if (l<0) continue;
        const r=regions[l]; if(!r||!selected.has(r.group)) continue;
        const g = (ll)=> ll>=0 && regions[ll] && selected.has(regions[ll].group);
        if (!g(labels[i-1])||!g(labels[i+1])||!g(labels[i-W])||!g(labels[i+W])){
          img.data[i*4]=255; img.data[i*4+1]=255; img.data[i*4+2]=255; img.data[i*4+3]=255;
        }
      }
    }
    ctx.putImageData(img,0,0);
    document.getElementById('pdf-container').appendChild(cv);
    if (RW.overlayHidden) cv.style.display = 'none';
  };

  /* ---------- panel ---------- */
  RW.buildPanel = function(){
    const old = document.getElementById('rw-panel'); if(old) old.remove();
    const rail = document.getElementById('right-rail-content');
    const panel = document.createElement('div');
    panel.id='rw-panel';
    panel.style.cssText='border-top:1px solid #999;margin-top:8px;padding:8px;font-size:12px;max-height:45%;overflow-y:auto;';
    panel.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;"><b>Region Workbench</b><span id="rw-count" style="opacity:0.7"></span></div>' +
      '<div style="margin-bottom:6px;display:flex;gap:4px;flex-wrap:wrap;">' +
      '<button id="rw-pick" style="font-size:11px;padding:2px 6px;">Pick (P)</button>' +
      '<button id="rw-merge" style="font-size:11px;padding:2px 6px;">Merge</button>' +
      '<button id="rw-cut" style="font-size:11px;padding:2px 6px;">Cut (K)</button>' +
      '<button id="rw-commit" style="font-size:11px;padding:2px 6px;">Commit</button>' +
      '<button id="rw-refresh" style="font-size:11px;padding:2px 6px;">Re-extract</button>' +
      '<button id="rw-hide" style="font-size:11px;padding:2px 6px;">Hide</button>' +
      '</div><div id="rw-list"></div>';
    rail.insertBefore(panel, rail.firstChild);
    document.getElementById('rw-pick').onclick = ()=>RW.setPick(!RW.pickMode);
    document.getElementById('rw-merge').onclick = ()=>RW.mergeSelected();
    document.getElementById('rw-cut').onclick = ()=>RW.setCut(true);
    document.getElementById('rw-refresh').onclick = ()=>{ RW.extract(); RW.renderList(); RW.renderOverlay(); };
    document.getElementById('rw-hide').onclick = ()=>{
      const o = document.getElementById('rw-overlay');
      if (o) { o.style.display = o.style.display==='none'?'':'none'; RW.overlayHidden = o.style.display==='none'; }
      const p = document.getElementById('rw-commitpreview');
      if (p) p.style.display = RW.overlayHidden ? 'none' : '';
    };
    document.getElementById('rw-commit').onclick = ()=>RW.commitSelected && RW.commitSelected();
    RW.renderList();
  };

  RW.renderList = function(){
    const list = document.getElementById('rw-list');
    if (!list) return;
    const kept = RW.regions.filter(r=>r.included);
    const groups = {};
    for (const r of kept){ (groups[r.group]=groups[r.group]||[]).push(r); }
    document.getElementById('rw-count').innerText = Object.keys(groups).length + ' groups';
    list.innerHTML='';
    Object.entries(groups)
      .sort((a,b)=>{
        const sa=a[1].reduce((s,m)=>s+m.size,0), sb=b[1].reduce((s,m)=>s+m.size,0);
        return sb-sa;
      })
      .forEach(([gid, members])=>{
        const total = members.reduce((s,m)=>s+m.size,0);
        const row = document.createElement('div');
        row.dataset.group = gid;
        row.style.cssText='display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:3px;cursor:pointer;user-select:none;';
        if (RW.selected.has(+gid)) row.classList.add('rw-sel'), row.style.background='rgba(80,120,255,0.25)';
        const sw = document.createElement('span');
        sw.style.cssText='width:12px;height:12px;background:'+members[0].color+';display:inline-block;border-radius:2px;flex:none;';
        const label = document.createElement('span');
        const pct = (100*total/(RW.W*RW.H)).toFixed(1);
        label.innerText = 'G'+gid+' · '+members.length+'p · '+pct+'%';
        label.style.cssText='flex:1;opacity:0.85;';
        row.appendChild(sw); row.appendChild(label);
        row.onclick = ()=>RW.toggleGroup(+gid);
        row.onmouseenter = ()=>{ if(!RW.pickMode){ RW.hovered=+gid; RW.renderOverlay(); } };
        row.onmouseleave = ()=>{ if(!RW.pickMode){ RW.hovered=null; RW.renderOverlay(); } };
        list.appendChild(row);
      });
  };

  RW.toggleGroup = function(gid){
    if (RW.selected.has(gid)) RW.selected.delete(gid); else RW.selected.add(gid);
    document.querySelectorAll('#rw-list > div').forEach(row=>{
      const g = +row.dataset.group;
      const on = RW.selected.has(g);
      row.classList.toggle('rw-sel', on);
      row.style.background = on ? 'rgba(80,120,255,0.25)' : '';
    });
    RW.renderOverlay();
    RW._renderCommitPreview();
  };

  /* ---------- merge ---------- */
  RW.mergeSelected = function(){
    if (RW.selected.size < 2) return;
    const ids = Array.from(RW.selected).sort((a,b)=>a-b);
    const target = ids[0];
    for (const r of RW.regions){ if (RW.selected.has(r.group)) r.group = target; }
    RW.selected = new Set([target]);
    RW.renderList(); RW.renderOverlay();
  };

  /* ---------- cut ---------- */
  RW.cutMode = false; RW.cutStart = null;
  RW.setCut = function(on){
    RW.cutMode = on; RW.cutStart = null;
    document.getElementById('annotation-canvas').style.cursor = on ? 'crosshair' : '';
    if (!on){ const g=document.getElementById('rw-cutline'); if(g) g.remove(); }
  };
  RW.applyCut = function(p1, p2){
    const {W,H,labels,regions} = RW;
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    const x1=(p1.x-cr.x)/cr.width*W, y1=(p1.y-cr.y)/cr.height*H;
    const x2=(p2.x-cr.x)/cr.width*W, y2=(p2.y-cr.y)/cr.height*H;
    const dx=x2-x1, dy=y2-y1;
    const mx=Math.round((x1+x2)/2), my=Math.round((y1+y2)/2);
    const hitLabel=(mx>=0&&mx<W&&my>=0&&my<H)?labels[my*W+mx]:-1;
    if (hitLabel<0) return;
    const hitGroup = regions[hitLabel].group;
    const newId = RW.nComp++;
    let moved=0;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++){
      const i=y*W+x; const l=labels[i];
      if (l<0 || regions[l].group!==hitGroup) continue;
      const side = dy*x - dx*y + (x2*y1 - y2*x1);
      if (side>0){ labels[i]=newId; moved++; }
    }
    regions.push({id:newId, size:moved, included:true, group:newId, color:'hsl('+Math.floor(Math.random()*360)+',85%,50%)'});
    const sizes={};
    for (let i=0;i<W*H;i++){ const l=labels[i]; if(l>=0) sizes[l]=(sizes[l]||0)+1; }
    for (const r of regions){ if (r.id in sizes) r.size=sizes[r.id]; }
    RW.renderList(); RW.renderOverlay();
  };

  /* ---------- commit preview: raw contours of selected groups ---------- */
  RW._rawContour = function(gid){
    const {W,H,labels,regions} = RW;
    const memberIds = new Set(regions.filter(r=>r.group===gid).map(r=>r.id));
    if (!memberIds.size) return null;
    const uni = new Int8Array(W*H);
    for (let i=0;i<W*H;i++){
      const l = labels[i];
      uni[i] = (l>=0 && memberIds.has(l)) ? 1 : 0;
    }
    const on = (x,y)=> x>=0&&x<W&&y>=0&&y<H&&uni[y*W+x]===1;
    let sx=-1, sy=-1;
    outer: for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if(on(x,y)){sx=x;sy=y;break outer;} }
    if (sx<0) return null;
    const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    let path=[[sx,sy]];
    let cx=sx, cy=sy, dir=6;
    for (let step=0; step<400000; step++){
      let found=false;
      for (let k=0;k<8;k++){
        const d=(dir+k)%8;
        const nx=cx+dirs[d][0], ny=cy+dirs[d][1];
        if (on(nx,ny)){ cx=nx; cy=ny; dir=(d+6)%8; found=true; path.push([cx,cy]); break; }
      }
      if (!found) break;
      if (cx===sx&&cy===sy&&path.length>3) break;
    }
    return path.map(([x,y])=>({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  };

  RW._renderCommitPreview = function(){
      const old = document.getElementById('rw-commitpreview'); if(old) old.remove();
      if (!RW.selected.size) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.id = 'rw-commitpreview';
      svg.setAttribute('viewBox','0 0 '+RW.W+' '+RW.H);
      svg.setAttribute('preserveAspectRatio','none');
      svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:75;';
      // zoom-invariant stroke: 2.5 screen px → SVG units at current zoom
      const container = document.getElementById('pdf-container');
      const sw = container ? 2.5 * RW.W / container.clientWidth : 2.5;
      const dash = sw * 2.4;
      let inner = '';
      for (const gid of RW.selected){
        const path = RW._rawContour(gid);
        if (!path || path.length<3) continue;
        const pts = path.map(p=>(p.x*RW.W)+','+(p.y*RW.H)).join(' ');
        const col = RW.regions.filter(r=>r.group===gid)[0]?.color || '#ccc';
        inner += '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="'+sw.toFixed(2)+'" stroke-dasharray="'+dash.toFixed(1)+','+(dash*0.5).toFixed(1)+'"/>';
      }
    svg.innerHTML = inner;
    document.getElementById('pdf-container').appendChild(svg);
  };
  RW.setPick = function(on){
    RW.pickMode = on;
    document.getElementById('rw-pick').style.background = on ? 'rgba(80,120,255,0.35)' : '';
    document.getElementById('annotation-canvas').style.cursor = on ? 'pointer' : '';
    if (on){
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const popup=document.getElementById('selection-popup');
      if (popup) popup.style.display='none';
    }
    if (!on && RW.hovered!==null){ RW.hovered=null; RW.renderOverlay(); }
  };

  RW.groupAt = function(clientX, clientY){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    const x = Math.round((clientX-cr.x)/cr.width*RW.W);
    const y = Math.round((clientY-cr.y)/cr.height*RW.H);
    if (x<0||x>=RW.W||y<0||y>=RW.H) return null;
    const l = RW.labels[y*RW.W+x];
    if (l<0) return null;
    const r = RW.regions[l];
    return (r && r.included) ? r.group : null;
  };

  /* ---------- global event wiring (once) ---------- */
  const ac = document.getElementById('annotation-canvas');

  ac.addEventListener('mousedown', function(e){
    if (RW.pickMode){
      e.stopPropagation(); e.preventDefault();
      RW.__downPos = {x:e.clientX, y:e.clientY};
      return;
    }
    if (RW.cutMode){
      e.stopPropagation(); e.preventDefault();
      RW.cutStart = {x:e.clientX, y:e.clientY};
    }
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (RW.pickMode){
      e.stopPropagation();
      if (RW.__raf) return;
      RW.__raf = true;
      const cx=e.clientX, cy=e.clientY;
      requestAnimationFrame(()=>{
        RW.__raf=false;
        const g = RW.groupAt(cx,cy);
        if (g !== RW.hovered){ RW.hovered=g; RW.renderOverlay(); }
      });
      return;
    }
    if (RW.cutMode && RW.cutStart){
      e.stopPropagation();
      const container=document.getElementById('pdf-container');
      let svg=document.getElementById('rw-cutline');
      if (!svg){
        svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.id='rw-cutline';
        svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:70;';
        const ln=document.createElementNS('http://www.w3.org/2000/svg','line');
        ln.setAttribute('stroke','red');
        ln.setAttribute('stroke-width','2');
        svg.appendChild(ln);
        svg.__rwCutLine = ln;
        container.appendChild(svg);
      }
      const cr=container.getBoundingClientRect();
      const pc=(v,off,len)=>((v-off)/len*100)+'%';
      const ln=svg.__rwCutLine;
      if (ln){
        ln.setAttribute('x1',pc(RW.cutStart.x,cr.x,cr.width));
        ln.setAttribute('y1',pc(RW.cutStart.y,cr.y,cr.height));
        ln.setAttribute('x2',pc(e.clientX,cr.x,cr.width));
        ln.setAttribute('y2',pc(e.clientY,cr.y,cr.height));
      }
    }
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW.pickMode){
      e.stopPropagation(); e.preventDefault();
      const d=RW.__downPos; RW.__downPos=null;
      if (d && Math.hypot(e.clientX-d.x,e.clientY-d.y)<=5){
        const g=RW.groupAt(e.clientX,e.clientY);
        if (g!==null) RW.toggleGroup(g);
      }
      return;
    }
    if (RW.cutMode && RW.cutStart){
      e.stopPropagation(); e.preventDefault();
      const s=RW.cutStart;
      RW.setCut(false);
      RW.applyCut(s,{x:e.clientX,y:e.clientY});
    }
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.pickMode || RW.cutMode){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  document.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key==='p'||e.key==='P'){ e.preventDefault(); e.stopPropagation(); RW.setPick(!RW.pickMode); }
    if (e.key==='k'||e.key==='K'){ e.preventDefault(); e.stopPropagation(); RW.setCut(true); }
    // Delete/Backspace: remove selected regions from the mask (pick mode)
    if ((e.key==='Delete'||e.key==='Backspace') && RW.pickMode && RW.selected.size){
      e.preventDefault(); e.stopImmediatePropagation();
      // paint all pixels of selected groups as wall, then relabel
      for (const sv of RW.selected){
        for (let i=0;i<RW.W*RW.H;i++){
          if (RW.labels[i]>=0 && RW.regions[RW.labels[i]] && RW.regions[RW.labels[i]].group===sv){
            RW.wall[i]=1;
          }
        }
      }
      RW.selected = new Set();
      RW._relabel(); RW.renderList(); RW.renderOverlay();
      RW._renderCommitPreview();
    }
  }, true);

  /* ---------- boot ---------- */
  RW.extract();
  RW.buildPanel();
  RW.renderOverlay();
  return 'RW v2 up: '+RW.regions.filter(r=>r.included).length+' regions';
})()

;
// ===== rw_masktools.js =====
// RW v2.1-revised — unified Rect tool (supplants separate Block/Open).
// Extends live __RW v2. Paints into RW.wall, re-labels preserving groups.
// Now uses normalized coordinates for pan-stable previews and a single mode
// 'rect' with RW.maskAction ('block'|'open') toggled via Shift or the button.
// Depends on _toNorm/_toPx from v2.2 (rw_stable.js must be loaded first).
(function(){
  const RW = window.__RW;
  if (!RW || RW.v !== 2) return 'need RW v2 first';
  if (RW.v21r) return 'v2.1r already installed';
  RW.v21r = true;

  /* ---------- rect tool: unified block/open via maskAction ---------- */
  // NOTE: RW.maskAction is 'block' or 'open' (shared with v2.6). Default block.
  if (!('maskAction' in RW)) RW.maskAction = 'block';

  // coordinate helpers (mirror v2.2 — available before rw_stable loads)
  if (!RW._toNorm) RW._toNorm = function(cx,cy){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [(cx-cr.x)/cr.width, (cy-cr.y)/cr.height];
  };
  if (!RW._toPx) RW._toPx = function(nx,ny){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [nx*cr.width, ny*cr.height];
  };
  if (!RW._mkSvg) RW._mkSvg = function(id, z){
    const old=document.getElementById(id); if(old) old.remove();
    const container=document.getElementById('pdf-container');
    const cr=container.getBoundingClientRect();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id=id;
    svg.setAttribute('viewBox','0 0 '+cr.width+' '+cr.height);
    svg.setAttribute('preserveAspectRatio','none');
    svg.style.cssText='position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:'+z+';';
    container.appendChild(svg);
    return svg;
  };
  if (!RW._strokeK) RW._strokeK = function(){
    const pc=document.getElementById('pdf-container');
    const sc=document.getElementById('canvas-scroll-container');
    return pc.getBoundingClientRect().width/sc.getBoundingClientRect().width;
  };

  RW._paintRect = function(x0,y0,x1,y1,val){
    const {W,H,wall} = RW;
    const xa=Math.max(0,Math.min(x0,x1)|0), xb=Math.min(W-1,Math.max(x0,x1)|0);
    const ya=Math.max(0,Math.min(y0,y1)|0), yb=Math.min(H-1,Math.max(y0,y1)|0);
    for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++) wall[y*W+x]=val;
  };
  RW._paintPoly = function(pts,val){
    const {W,H,wall} = RW;
    let minY=H,maxY=0;
    for (const [x,y] of pts){ if(y<minY)minY=y; if(y>maxY)maxY=y; }
    minY=Math.max(0,minY|0); maxY=Math.min(H-1,Math.ceil(maxY));
    for (let y=minY;y<=maxY;y++){
      const xs=[];
      for (let i=0,j=pts.length-1;i<pts.length;j=i++){
        const [xi,yi]=pts[i], [xj,yj]=pts[j];
        if ((yi>y)!==(yj>y)) xs.push(xi+(y-yi)/(yj-yi)*(xj-xi));
      }
      xs.sort((a,b)=>a-b);
      for (let k=0;k+1<xs.length;k+=2){
        const xa=Math.max(0,Math.round(xs[k])), xb=Math.min(W-1,Math.round(xs[k+1]));
        for (let x=xa;x<=xb;x++) wall[y*W+x]=val;
      }
    }
  };

  // Bresenham polyline — paints wall=1 only where pixels are currently wall=0
  // AND are NOT part of an existing included mask region.
  // (seals gaps in linework without cutting through mask regions)
  RW._paintPolylineGap = function(pts){
    const {W,H,wall,labels,regions} = RW;
    function line(x0,y0,x1,y1){
      const dx=Math.abs(x1-x0), sx=x0<x1?1:-1;
      const dy=-Math.abs(y1-y0), sy=y0<y1?1:-1;
      let err=dx+dy;
      while(true){
        if (x0>=0&&x0<W&&y0>=0&&y0<H && wall[y0*W+x0]===0){
          // skip if this pixel belongs to an included mask region
          const l = labels ? labels[y0*W+x0] : -1;
          if (!(l>=0 && regions && regions[l] && regions[l].included)){
            wall[y0*W+x0]=1;
          }
        }
        if (x0===x1&&y0===y1) break;
        const e2=2*err;
        if (e2>=dy){ err+=dy; x0+=sx; }
        if (e2<=dx){ err+=dx; y0+=sy; }
      }
    }
    for (let i=0;i<pts.length;i++){
      const [x0,y0]=pts[i], [x1,y1]=pts[(i+1)%pts.length];
      line(Math.round(x0),Math.round(y0),Math.round(x1),Math.round(y1));
    }
  };

  /* ---------- relabel preserving groups by centroid ---------- */
  RW._relabel = function(){
    if (!RW.labels) RW.extract(); // auto-bootstrap if no mask exists yet
    const {W,H,wall} = RW;
    // snapshot old regions BEFORE flood — used to protect existing mask from border absorption
    const oldRegions = RW.regions;
    const oldLabels = RW.labels;
    const oldCent = {};
    for (let i=0;i<W*H;i++){
      const l=oldLabels[i]; if (l<0) continue;
      const g=oldRegions[l].group;
      const c=oldCent[g]=oldCent[g]||{sx:0,sy:0,n:0};
      c.sx+=i%W; c.sy+=(i/W)|0; c.n++;
    }
    for (const g in oldCent){ const c=oldCent[g]; c.x=c.sx/c.n; c.y=c.sy/c.n; }
    const seen=new Uint8Array(W*H); const q=[];
    for (let x=0;x<W;x++){ q.push(x,(H-1)*W+x); }
    for (let y=0;y<H;y++){ q.push(y*W,y*W+W-1); }
    while(q.length){
      const i=q.pop();
      if (seen[i]||wall[i]) continue;
      // protect pixels that were previously part of included mask regions
      const ol=oldLabels[i];
      if (ol>=0 && oldRegions[ol] && oldRegions[ol].included) continue;
      seen[i]=1; const x=i%W,y=(i/W)|0;
      if(x>0)q.push(i-1); if(x<W-1)q.push(i+1);
      if(y>0)q.push(i-W); if(y<H-1)q.push(i+W);
    }
    const labels = new Int32Array(W*H).fill(-1);
    let nComp=0; const sizes=[];
    for (let s=0;s<W*H;s++){
      if (seen[s]||wall[s]||labels[s]>=0) continue;
      const stack=[s]; labels[s]=nComp; let size=0,sx=0,sy=0;
      while(stack.length){
        const i=stack.pop(); size++;
        const x=i%W,y=(i/W)|0; sx+=x;sy+=y;
        if(x>0&&!seen[i-1]&&!wall[i-1]&&labels[i-1]<0){labels[i-1]=nComp;stack.push(i-1);}
        if(x<W-1&&!seen[i+1]&&!wall[i+1]&&labels[i+1]<0){labels[i+1]=nComp;stack.push(i+1);}
        if(y>0&&!seen[i-W]&&!wall[i-W]&&labels[i-W]<0){labels[i-W]=nComp;stack.push(i-W);}
        if(y<H-1&&!seen[i+W]&&!wall[i+W]&&labels[i+W]<0){labels[i+W]=nComp;stack.push(i+W);}
      }
      sizes.push({size, cx:sx/size, cy:sy/size}); nComp++;
    }
    const newGroupFor=new Array(nComp).fill(-1);
    for (let id=0;id<nComp;id++){
      const {cx,cy}=sizes[id]; let best=-1,bestD=40*40;
      for (const g in oldCent){ const c=oldCent[g]; const d=(c.x-cx)*(c.x-cx)+(c.y-cy)*(c.y-cy); if (d<bestD){bestD=d;best=+g;} }
      newGroupFor[id]=best;
    }
    RW.labels=labels; RW.nComp=nComp;
    const areaFloor = RW._areaFloor || 2500;
    RW.regions = sizes.map((s,id)=>{ const g=newGroupFor[id]>=0?newGroupFor[id]:id; return {id,size:s.size,included:s.size>=areaFloor,group:g,color:'hsl('+((g*67)%360)+',70%,55%)'}; });
  };

  /* ---------- rect tool: unified block/open via RW.maskAction ---------- */
  const ac = document.getElementById('annotation-canvas');

  // n.b.: v2.6's previewV=5 handles poly2/brush; this module only handles
  // maskMode==='rect'.  v2.6 keys (N/J) check maskMode2 to avoid conflict.
  // legacy keys B/O are removed here; unified rect uses B-only gated on
  // maskMode2 being null (so B does nothing while poly2/brush are armed).

  ac.addEventListener('mousedown', function(e){
    if (RW.maskMode!=='rect') return;
    e.stopPropagation(); e.preventDefault();
    RW.__rectStartN = RW._toNorm(e.clientX, e.clientY);
    RW.__rectCurN = RW.__rectStartN.slice();
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    e.stopPropagation();
    RW.__rectCurN = RW._toNorm(e.clientX, e.clientY);
    // render via the shared preview path from v2.2
    RW._renderPreview2({x:e.clientX,y:e.clientY});
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    e.stopPropagation(); e.preventDefault();
    const s=RW.__rectStartN; RW.__rectStartN=null; RW.__rectCurN=null;
    const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
    const en=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskAction==='add'){
      // Add mode: clear interior first, then trace perimeter wall → new enclosed region
      const rx0=s[0]*RW.W, ry0=s[1]*RW.H, rx1=en[0]*RW.W, ry1=en[1]*RW.H;
      const ix0=Math.max(0,Math.min(rx0,rx1)|0), ix1=Math.min(RW.W-1,Math.max(rx0,rx1)|0);
      const iy0=Math.max(0,Math.min(ry0,ry1)|0), iy1=Math.min(RW.H-1,Math.max(ry0,ry1)|0);
      for (let y=iy0;y<=iy1;y++) for (let x=ix0;x<=ix1;x++) RW.wall[y*RW.W+x]=0;
      RW._paintPolylineGap([[rx0,ry0],[rx1,ry0],[rx1,ry1],[rx0,ry1]]);
    } else if (RW.maskAction==='open'){
      // open mode: seal perimeter gaps, then convert interior walls to non-wall
      const rx0=s[0]*RW.W, ry0=s[1]*RW.H, rx1=en[0]*RW.W, ry1=en[1]*RW.H;
      RW._paintPolylineGap([[rx0,ry0],[rx1,ry0],[rx1,ry1],[rx0,ry1]]);
      const xa=Math.max(0,Math.min(rx0,rx1)|0), xb=Math.min(RW.W-1,Math.max(rx0,rx1)|0);
      const ya=Math.max(0,Math.min(ry0,ry1)|0), yb=Math.min(RW.H-1,Math.max(ry0,ry1)|0);
      for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++) {
        if (RW.wall[y*RW.W+x]===1) RW.wall[y*RW.W+x]=0;
      }
    } else {
      const val = RW.maskAction==='block' ? 1 : 0;
      RW._paintRect(s[0]*RW.W, s[1]*RW.H, en[0]*RW.W, en[1]*RW.H, val);
    }
    const saveFloor = RW._areaFloor; if (RW.maskAction==='add') RW._areaFloor = 100;
    RW._relabel(); RW.renderList(); RW.renderOverlay();
    RW._areaFloor = saveFloor;
    RW._renderCommitPreview();
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.maskMode==='rect'){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ---------- rect preview render (plugged into v2.2 renderer) ---------- */
  // v2.2 _renderPreview only checks maskMode==='poly' — we extend it here
  // by wrapping into a _renderPreview2 that the v2.2 mousemove calls instead.
  RW._renderPreview2 = function(cursorClient){
    // delegate to v2.2 renderer for poly/brush first
    RW._renderPreview(cursorClient);
    if (RW.maskMode!=='rect' || !RW.__rectStartN) return;
    const sw = 1.5;  // constant screen px — zoom-invariant
    const svg = RW._mkSvg ? RW._mkSvg('rw-rectline', 71) : null;
    if (!svg) return;
    let x0=RW.__rectStartN[0], y0=RW.__rectStartN[1];
    let x1=RW.__rectCurN ? RW.__rectCurN[0] : x0, y1=RW.__rectCurN ? RW.__rectCurN[1] : y0;
    const [ax,ay]=RW._toPx(Math.min(x0,x1),Math.min(y0,y1));
    const [bx,by]=RW._toPx(Math.max(x0,x1),Math.max(y0,y1));
    const col = RW._actionColor ? RW._actionColor() : (RW.maskAction==='block' ? 'orange' : 'deepskyblue');
    svg.innerHTML='<rect x="'+ax+'" y="'+ay+'" width="'+(bx-ax)+'" height="'+(by-ay)+'" fill="rgba(255,160,60,0.10)" stroke="'+col+'" stroke-width="'+sw+'"/>';
  };

  /* ---------- keys: B = rect (Shift-B toggles action) ---------- */
  window.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    // never handle when v2.6 tools are armed — BUT disarm them first so the
    // user can switch directly between rect and poly2/brush in one keystroke
    if (e.key==='b'||e.key==='B'){
      if (RW.maskMode2){ RW.setMaskMode2(null); }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey){ const next=RW.maskAction==='block'?'open':RW.maskAction==='open'?'add':'block'; RW.maskAction=next; RW._syncRectBtn(); return; }
      RW.maskMode = RW.maskMode==='rect' ? null : 'rect';
      RW._syncRectBtn();
      const ac=document.getElementById('annotation-canvas');
      ac.style.cursor = RW.maskMode==='rect' ? 'crosshair' : '';
      if (RW.maskMode!=='rect'){ RW.__rectStartN=null; RW.__rectCurN=null; const rl=document.getElementById('rw-rectline'); if(rl) rl.remove(); }
    }
    if (e.key==='Escape' && RW.maskMode==='rect'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
      document.getElementById('annotation-canvas').style.cursor='';
      const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
      RW._syncRectBtn();
    }
  }, true);

  /* ---------- panel button ---------- */
  RW._syncRectBtn = function(){
    const b = document.getElementById('rw-rect');
    if (!b) return;
    const sym = RW.maskAction==='block' ? '-' : (RW.maskAction==='open' ? '+' : '⊕');
    b.innerText = 'Rect '+sym+' (B)';
    const bg = RW.maskAction==='add' ? 'rgba(50,205,50,0.4)' : 'rgba(255,160,60,0.4)';
    b.style.background = RW.maskMode==='rect' ? bg : '';
  };
  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-rect')){
    const b=document.createElement('button');
    b.id='rw-rect'; b.title='Unified rect mask. Shift+B cycles block→open→add.';
    b.style.cssText='font-size:11px;padding:2px 6px;';
    b.onclick=()=>{
      // cross-disarm: if any v2.6 tool is armed, kill it first
      if (RW.maskMode2) RW.setMaskMode2(null);
      if (RW.maskMode!=='rect'){ RW.maskMode='rect'; RW.__rectStartN=null; RW.__rectCurN=null; }
      else { RW.maskMode=null; }
      document.getElementById('annotation-canvas').style.cursor = RW.maskMode==='rect' ? 'crosshair' : '';
      RW._syncRectBtn();
    };
    bar.appendChild(b);
  }
  RW._syncRectBtn();

  return 'v2.1r unified rect up: B=rect (Shift+B toggles block/open), pan-stable';
})()
;
// ===== rw_stable.js =====
// RW v2.2 — pan/zoom-stable previews. Stores in-progress geometry in normalized
// page coords (0-1 of page), converts to pixels at render time. Supersedes v3 preview handlers.
(function(){
  const RW = window.__RW;
  if (!RW || (!RW.v21 && !RW.v21r)) return 'need v2.1 first';
  if (RW.v22) return 'v2.2 already installed';
  RW.v22 = true;
  RW._previewV = 4;

  // client (screen) -> normalized page coords
  RW._toNorm = function(cx, cy){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [(cx - cr.x)/cr.width, (cy - cr.y)/cr.height];
  };
  // normalized -> client px offset within container's box
  RW._toPx = function(nx, ny){
    const cr = document.getElementById('pdf-container').getBoundingClientRect();
    return [nx*cr.width, ny*cr.height];
  };

  RW._strokeK = function(){
    const pc = document.getElementById('pdf-container');
    const sc = document.getElementById('canvas-scroll-container');
    return pc.getBoundingClientRect().width / sc.getBoundingClientRect().width;
  };

  RW._mkSvg = function(id, z){
    const old = document.getElementById(id); if(old) old.remove();
    const container = document.getElementById('pdf-container');
    const cr = container.getBoundingClientRect();
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.id = id;
    svg.setAttribute('viewBox', '0 0 ' + cr.width + ' ' + cr.height);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:'+z+';';
    container.appendChild(svg);
    return svg;
  };

  // re-render previews from normalized state (call on mousemove AND on pan/zoom)
  RW._renderPreview = function(cursorClient){
    const sw = 1.5;   // constant screen px — zoom-invariant
    const dotR = 2.5;  // constant screen px

    // poly (legacy 'poly' via maskMode, v2.6 'poly2' via maskMode2)
    const polyActive = (RW.maskMode==='poly') || (RW.maskMode2==='poly2');
    if (polyActive && RW._polyPtsN && RW._polyPtsN.length){
      const svg = RW._mkSvg('rw-polyline', 71);
      const pts = RW._polyPtsN.map(([nx,ny])=>{
        const [px,py]=RW._toPx(nx,ny); return px+','+py;
      });
      if (cursorClient){
        const [cnx,cny]=RW._toNorm(cursorClient.x,cursorClient.y);
        const [px,py]=RW._toPx(cnx,cny);
        pts.push(px+','+py);
      }
      let inner = '<polyline points="'+pts.join(' ')+'" fill="rgba(255,160,60,0.18)" stroke="orange" stroke-width="'+sw+'"/>';
      for (const [nx,ny] of RW._polyPtsN){
        const [px,py]=RW._toPx(nx,ny);
        inner += '<circle cx="'+px+'" cy="'+py+'" r="'+dotR+'" fill="orange" stroke="white" stroke-width="1.0"/>';
      }
      svg.innerHTML = inner;
    }
    // rect preview (used by v2.1r _renderPreview2 wrapper)
    if ((RW.maskMode==='block' || RW.maskMode==='open' || RW.maskMode==='rect') && RW.__rectStartN){
      const svg = RW._mkSvg('rw-rectline', 71);
      let x0=RW.__rectStartN[0], y0=RW.__rectStartN[1];
      let x1=RW.__rectCurN ? RW.__rectCurN[0] : x0, y1=RW.__rectCurN ? RW.__rectCurN[1] : y0;
      const [ax,ay]=RW._toPx(Math.min(x0,x1),Math.min(y0,y1));
      const [bx,by]=RW._toPx(Math.max(x0,x1),Math.max(y0,y1));
      const col = RW.maskMode==='block' ? 'orange' : 'deepskyblue';
      svg.innerHTML='<rect x="'+ax+'" y="'+ay+'" width="'+(bx-ax)+'" height="'+(by-ay)+'" fill="rgba(255,160,60,0.10)" stroke="'+col+'" stroke-width="'+sw+'"/>';
    }
  };

  const ac = document.getElementById('annotation-canvas');

  // v4 listeners (guarded by _previewV so older handlers no-op)
  ac.addEventListener('mousedown', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    e.stopPropagation(); e.preventDefault();
    const [nx,ny]=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskMode==='poly'){
      RW._polyPtsN = RW._polyPtsN || [];
      RW._polyPtsN.push([nx,ny]);
    } else {
      RW.__rectStartN = [nx,ny];
      RW.__rectCurN = [nx,ny];
    }
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    e.stopPropagation();
    if (RW.maskMode==='block'||RW.maskMode==='open'){
      if (RW.__rectStartN) RW.__rectCurN = RW._toNorm(e.clientX,e.clientY);
    }
    RW._renderPreview({x:e.clientX,y:e.clientY});
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    e.stopPropagation(); e.preventDefault();
    if (RW.maskMode==='poly') return; // commits on dblclick
    if (!RW.__rectStartN) return;
    const s=RW.__rectStartN; RW.__rectStartN=null; RW.__rectCurN=null;
    const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
    const e_n = RW._toNorm(e.clientX,e.clientY);
    const W=RW.W, H=RW.H;
    const val = RW.maskMode==='block' ? 1 : 0;
    if (RW.maskMode==='open'){
      RW._paintPolylineGap([[s[0]*W, s[1]*H], [e_n[0]*W, s[1]*H], [e_n[0]*W, e_n[1]*H], [s[0]*W, e_n[1]*H]]);
      const xa=Math.max(0,Math.min(s[0]*W, e_n[0]*W)|0), xb=Math.min(W-1,Math.max(s[0]*W, e_n[0]*W)|0);
      const ya=Math.max(0,Math.min(s[1]*H, e_n[1]*H)|0), yb=Math.min(H-1,Math.max(s[1]*H, e_n[1]*H)|0);
      for (let y=ya;y<=yb;y++) for (let x=xa;x<=xb;x++) {
        if (RW.wall[y*W+x]===1) RW.wall[y*W+x]=0;
      }
    } else {
      RW._paintRect(s[0]*W, s[1]*H, e_n[0]*W, e_n[1]*H, val);
    }
    RW._relabel(); RW.renderList(); RW.renderOverlay();
    RW._renderCommitPreview();
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (RW._previewV!==4 || RW.maskMode!=='poly') return;
    e.stopPropagation(); e.preventDefault();
    if (RW._polyPtsN && RW._polyPtsN.length>=3){
      const mpts = RW._polyPtsN.map(([nx,ny])=>[nx*RW.W, ny*RW.H]);
      RW._paintPoly(mpts, 1);
      RW._relabel(); RW.renderList(); RW.renderOverlay();
      RW._renderCommitPreview();
    }
    RW._polyPtsN=[];
    const pl=document.getElementById('rw-polyline'); if(pl) pl.remove();
  }, true);

  // keep preview glued during pan/zoom: re-render on scroll + wheel
  const sc = document.getElementById('canvas-scroll-container');
  RW.__scrollRaf = false;
  sc.addEventListener('scroll', function(){
    if (RW._previewV!==4) return;
    if (!RW.maskMode && !RW.maskMode2) return;
    if (RW.__scrollRaf) return;              // debounce: one rAF at a time
    RW.__scrollRaf = true;
    requestAnimationFrame(() => {
      RW.__scrollRaf = false;
      RW._renderPreview(null);
      if (RW._renderPreview2) RW._renderPreview2(null);
      if (RW._renderCommitPreview) RW._renderCommitPreview();
    });
  }, {passive:true});
  // wheel = zoom (Ctrl+scroll) — re-render so stroke stays zoom-invariant
  ac.addEventListener('wheel', function(e){
    if (RW._previewV!==4) return;
    if (!RW.maskMode && !RW.maskMode2) return;
    // let the app handle the zoom, then re-render after a microtask
    requestAnimationFrame(() => {
      RW._renderPreview(null);
      if (RW._renderPreview2) RW._renderPreview2(null);
      if (RW._renderCommitPreview) RW._renderCommitPreview();
    });
  }, {passive:true});
  document.addEventListener('mouseup', function(){
    // after any pan gesture ends, re-render so preview re-anchors
    if (RW._previewV!==4 || !RW.maskMode) return;
    setTimeout(()=>RW._renderPreview(null), 30);
  }, true);

  // Escape clears normalized state too
  document.addEventListener('keydown', function(e){
    if (e.key==='Escape' && RW.maskMode){
      RW._polyPtsN=[]; RW.__rectStartN=null; RW.__rectCurN=null;
    }
  }, true);

  return 'v2.2 up: pan/zoom-stable previews (normalized coords)';
})()

;
// ===== rw_undo.js =====
// RW v2.3 — undo system for mask tools.
// Load AFTER rw_stable.js (needs v2.2).
//
// Behavior:
// - Poly: Backspace removes last vertex; Escape clears in-progress vertices FIRST,
//   second Escape closes the tool; double-click commits.
// - Block/Open rect strokes, Poly commits, Cut, Merge: snapshot-based undo stack.
//   Panel "Undo" button or backtick (`) key reverts the last edit.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v22) return 'need v2.2 first';
  if (RW.v23) return 'v2.3 already installed';
  RW.v23 = true;
  const ac = document.getElementById('annotation-canvas');

  /* ---------- undo stack ---------- */
  RW._undoStack = [];
  RW._snapshot = function(label){
    RW._undoStack.push({
      label,
      wall: RW.wall.slice(),
      labels: RW.labels.slice(),
      nComp: RW.nComp,
      regions: JSON.parse(JSON.stringify(RW.regions.map(r=>({id:r.id,size:r.size,included:r.included,group:r.group,color:r.color})))),
    });
    if (RW._undoStack.length > 30) RW._undoStack.shift();
    RW._updateUndoBtn();
  };
  RW.undo = function(){
    const s = RW._undoStack.pop();
    if (!s) return 'nothing to undo';
    RW.wall = s.wall;
    RW.labels = s.labels;
    RW.nComp = s.nComp;
    RW.regions = s.regions;
    const live = new Set(RW.regions.map(r=>r.group));
    RW.selected = new Set(Array.from(RW.selected).filter(g=>live.has(g)));
    RW.renderList(); RW.renderOverlay();
    RW._updateUndoBtn();
    return 'undid: ' + s.label;
  };
  RW._updateUndoBtn = function(){
    const b = document.getElementById('rw-undo');
    if (b) b.innerText = 'Undo (`)' + (RW._undoStack.length ? ' '+RW._undoStack.length : '');
  };

  /* ---------- snapshot triggers (window-level capture = fires before element handlers) ---------- */
  // rect strokes: snapshot on stroke-start mousedown
  window.addEventListener('mousedown', function(e){
    if (RW._previewV!==4 || !RW.maskMode) return;
    if (e.target !== ac && !ac.contains(e.target)) return;
    if (RW.maskMode==='block' || RW.maskMode==='open' || RW.maskMode==='rect') RW._snapshot(RW.maskMode);
  }, true);

  // poly commit: snapshot via _paintPoly wrapper (fires on dblclick commit only,
  // because v2.2's dblclick handler is the sole caller with a full polygon)
  const origPaintPoly = RW._paintPoly;
  let polySnapArmed = false;
  RW._paintPoly = function(pts, val){
    if (!polySnapArmed){
      polySnapArmed = true;
      RW._snapshot('poly');
      const r = origPaintPoly.apply(RW, arguments);
      polySnapArmed = false;
      return r;
    }
    return origPaintPoly.apply(RW, arguments);
  };

  // cut + merge
  const origApplyCut = RW.applyCut;
  RW.applyCut = function(){
    RW._snapshot('cut');
    return origApplyCut.apply(RW, arguments);
  };
  const origMerge = RW.mergeSelected;
  RW.mergeSelected = function(){
    if (RW.selected.size >= 2) RW._snapshot('merge');
    return origMerge.apply(RW, arguments);
  };

  /* ---------- poly vertex editing (window capture beats older document handlers) ---------- */
  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (RW.maskMode !== 'poly') return;
    if (e.key === 'Backspace'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN.pop();
        RW._renderPreview(null);
      }
      return;
    }
    if (e.key === 'Escape'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN = [];
        const pl = document.getElementById('rw-polyline'); if (pl) pl.remove();
      } else {
        RW.setMaskMode(null);
      }
    }
  }, true);

  /* ---------- undo trigger: backtick + panel button ---------- */
  window.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    if (e.key === '`'){
      e.preventDefault(); e.stopImmediatePropagation();
      RW.undo();
    }
  }, true);

  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  if (bar && !document.getElementById('rw-undo')){
    const b = document.createElement('button');
    b.id = 'rw-undo';
    b.title = 'Undo last mask edit (block/open/poly/cut/merge)';
    b.style.cssText = 'font-size:11px;padding:2px 6px;';
    b.onclick = ()=>RW.undo();
    bar.appendChild(b);
  }
  RW._updateUndoBtn();

  return 'v2.3 undo up: Backspace=poly point, Esc=clear points then close, `=undo mask edit';
})()

;
// ===== rw_commit.js =====
// RW v2.5 — Direct-write commit: mask contours become real pending annotations
// via the app's own state + EditHistory contract. No synthetic clicks.
//
// Mechanism (mirrors createPolygonPolylineAnnotation exactly):
//   1. build newAnnotation { id: temp_*, tag, measurement_type:'POLYGON',
//      coordinates: <normalized pts>, _pending: true, _data: {page_id,
//      measurement_type, points_data, notes, tag_id, temp_id} }
//   2. annotationState.annotations.push(newAnnotation)
//   3. editHistory.push(createHistoryEntry('create_annotation', {before:null,
//      after: newAnnotation})) — this is what buildSaveManifest classifies
//      into the create bucket; saveAnnotationChanges then POSTs _data.
//   4. render via the app's own redraw: simulated by nudging UI through their
//      exposed controls (zoom round-trip) since renderAnnotations is module-scoped.
//
// Load AFTER rw_undo.js (needs v2.3). Replaces v2.4 click-replay commit.
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v23) return 'need v2.3 first';
  RW.v24 = true; // supersedes
  RW.v25 = true;

  /* ---------- contour tracing (Moore neighbor, union of group members) ---------- */
  RW._groupToPolygon = function(gid, eps){
    const {W,H,labels,regions} = RW;
    const memberIds = new Set(regions.filter(r=>r.group===gid).map(r=>r.id));
    if (!memberIds.size) return null;
    const uni = new Int8Array(W*H);
    for (let i=0;i<W*H;i++){
      const l = labels[i];
      uni[i] = (l>=0 && memberIds.has(l)) ? 1 : 0;
    }
    const on = (x,y)=> x>=0&&x<W&&y>=0&&y<H&&uni[y*W+x]===1;
    let sx=-1, sy=-1;
    outer: for (let y=0;y<H;y++) for (let x=0;x<W;x++){ if(on(x,y)){sx=x;sy=y;break outer;} }
    if (sx<0) return null;
    const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    let path=[[sx,sy]];
    let cx=sx, cy=sy, dir=6;
    for (let step=0; step<400000; step++){
      let found=false;
      for (let k=0;k<8;k++){
        const d=(dir+k)%8;
        const nx=cx+dirs[d][0], ny=cy+dirs[d][1];
        if (on(nx,ny)){ cx=nx; cy=ny; dir=(d+6)%8; found=true; path.push([cx,cy]); break; }
      }
      if (!found) break;
      if (cx===sx&&cy===sy&&path.length>3) break;
    }
    // simplify closed contour
    function dp(pts, e2){
      if (pts.length<3) return pts;
      const [x1,y1]=pts[0], [x2,y2]=pts[pts.length-1];
      const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
      let maxD=0, idx=0;
      for (let i=1;i<pts.length-1;i++){
        const dd=Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/len;
        if (dd>maxD){maxD=dd;idx=i;}
      }
      if (maxD>e2){
        const l=dp(pts.slice(0,idx+1),e2), r=dp(pts.slice(idx),e2);
        return l.slice(0,-1).concat(r);
      }
      return [pts[0], pts[pts.length-1]];
    }
    // Chaikin corner-cutting: smooth pixel staircases (dragon's teeth) on
    // diagonal edges. Each vertex -> two points at 25%/75% of adjacent edges.
    // `passes` rounds progressively; ~0.5-1px inward erosion per pass at mask res.
    function chaikin(pts, passes){
      let out = pts;
      for (let p=0;p<passes;p++){
        const next = [];
        for (let i=0;i<out.length;i++){
          const [ax,ay]=out[i], [bx,by]=out[(i+1)%out.length];
          next.push([ax*0.75+bx*0.25, ay*0.75+by*0.25]);
          next.push([ax*0.25+bx*0.75, ay*0.25+by*0.75]);
        }
        out = next;
      }
      return out;
    }
    let simp = path;
    if (path.length >= 8){
      // smooth first so DP sees curves, not staircases
      let work = chaikin(path, RW.smoothPasses != null ? RW.smoothPasses : 4);
      let far=0, farD=0;
      const [sx2,sy2]=work[0];
      for (let i=0;i<work.length;i++){
        const d=Math.hypot(work[i][0]-sx2, work[i][1]-sy2);
        if (d>farD){farD=d;far=i;}
      }
      const e2 = RW.smoothEps != null ? RW.smoothEps : (eps||1.2);
      const h1=dp(work.slice(0,far+1), e2), h2=dp(work.slice(far), e2);
      simp = h1.slice(0,-1).concat(h2.slice(0,-1));
    }
    return simp.map(([x,y])=>({x:+(x/W).toFixed(6), y:+(y/H).toFixed(6)}));
  };

  /* ---------- direct annotation creation ---------- */
  let tempCounter = 1;
  RW._createPendingAnnotation = function(normPts){
    const st = annotationState;
    const tag = st.currentTag;
    const tempId = 'temp_rw_' + (Date.now()%100000) + '_' + (tempCounter++);
    const annotationData = {
      page_id: st.pageId,
      measurement_type: 'POLYGON',
      points_data: normPts,
      notes: '',
      temp_id: tempId,
    };
    if (tag) annotationData.tag_id = tag.id;
    const newAnnotation = {
      id: tempId,
      tag: tag || null,
      labels: [],
      measurement_type: 'POLYGON',
      coordinates: normPts,
      notes: '',
      _pending: true,
      _data: annotationData,
    };
    // 1. state
    st.annotations.push(newAnnotation);
    // 2. WAL entry (this is what buildSaveManifest reads)
    window.editHistory.push(window.createHistoryEntry('create_annotation', {
      description: 'Draw polygon',
      targetId: newAnnotation.id,
      targetType: 'annotation',
      before: null,
      after: JSON.parse(JSON.stringify(newAnnotation)),
    }));
    return newAnnotation;
  };

  /* ---------- redraw: force the app to re-render annotations ----------
     renderAnnotations is module-scoped. The exposed zoom controls trigger a
     full re-render pipeline. We do a silent zoom round-trip. */
  RW._forceRender = async function(){
    const zin = document.getElementById('zoom-in-btn');
    const zout = document.getElementById('zoom-out-btn');
    if (zin && zout){
      zin.click();
      await new Promise(r=>setTimeout(r,120));
      zout.click();
      await new Promise(r=>setTimeout(r,120));
    }
  };

  /* ---------- commit flow ---------- */
  RW._commitAbort = false;
  RW.commitSelected = async function(){
    if (!RW.selected.size){ RW._commitStatus('nothing selected'); return; }
    if (!annotationState.currentTag){ RW._commitStatus('no active tag — press a tag number first'); return; }
    const groups = Array.from(RW.selected);
    const total = groups.length;
    let done = 0, failed = 0;
    const tagName = annotationState.currentTag.name;
    RW._commitStatus('committing 0/'+total+' — tag: '+tagName);
    const created = [];
    for (const gid of groups){
      const poly = RW._groupToPolygon(gid, 1.2);
      if (!poly || poly.length < 3){ failed++; continue; }
      created.push(RW._createPendingAnnotation(poly));
      done++;
      RW._commitStatus('staged '+done+'/'+total+' (failed: '+failed+')');
    }
    RW._commitStatus('staged '+done+', rendering...');
    await RW._forceRender();
    RW._commitStatus('done: '+done+' committed, '+failed+' failed — review and Save');
    RW._lastCommit = created;
    RW.selected = new Set();
    RW.renderList(); RW.renderOverlay();
    RW._renderCommitPreview();
  };
  RW.abortCommit = function(){ RW._commitAbort = true; };
  RW._commitStatus = function(msg){
    const el = document.getElementById('rw-commit-status');
    if (el) el.innerText = msg;
    console.log('[RW commit]', msg);
  };

  /* ---------- panel wiring ---------- */
  const commitBtn = document.getElementById('rw-commit');
  if (commitBtn) commitBtn.onclick = ()=>RW.commitSelected();
  const panel = document.getElementById('rw-panel');
  if (panel && !document.getElementById('rw-commit-status')){
    const s = document.createElement('div');
    s.id='rw-commit-status';
    s.style.cssText='font-size:11px;opacity:0.75;margin-top:4px;min-height:14px;';
    panel.insertBefore(s, document.getElementById('rw-list'));
  }

  return 'v2.5 direct-write commit up: instant staging, no click replay';
})()

;
// ===== rw_brushpoly.js =====
// RW v2.6 — Poly (dual-action) + Brush mask tools.
// Load AFTER rw_undo.js (needs v2.3). Adds:
//   N  — Poly2 tool: freeform vertices, dbl-click closes. Shift+N toggles block/open.
//   J  — Brush tool: freehand stroke, Tab+scroll sizes radius. Shift+J toggles block/open.
//   A  — Cycle maskAction: block → open → add (creates new regions from drawn shapes).
(function(){
  const RW = window.__RW;
  if (!RW || !RW.v23) return 'need v2.3 first';
  if (RW.v26) return 'v2.6 already installed';
  if (window.__RWv26listeners) return 'v2.6 listeners already attached';
  window.__RWv26listeners = true;
  RW.v26 = true;
  RW._previewV = 5;

  const ac = document.getElementById('annotation-canvas');

  RW.maskAction = 'block';
  RW.brushR = 6;

  RW.setMaskMode2 = function(mode){
    if (RW.maskMode==='rect'){ RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
      document.getElementById('annotation-canvas').style.cursor='';
      const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
      if (RW._syncRectBtn) RW._syncRectBtn(); }
    RW.maskMode2 = mode || null;
    RW._polyPtsN = [];
    ['rw-polyline','rw-rectline','rw-brushline'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.remove();
    });
    ac.style.cursor = RW.maskMode2 ? 'crosshair' : '';
    RW._syncToolButtons();
  };

  RW._actionLabel = function(){ return RW.maskAction==='block'?'−':RW.maskAction==='open'?'+':'⊕'; };
  RW._actionColor = function(){ return RW.maskAction==='block'?'orange':RW.maskAction==='open'?'deepskyblue':'limegreen'; };
  RW._actionBg = function(){ return RW.maskAction==='block'?'rgba(255,160,60,0.18)':RW.maskAction==='open'?'rgba(60,180,255,0.18)':'rgba(50,205,50,0.18)'; };
  RW.setMaskAction = function(a){ RW.maskAction = a; RW._syncToolButtons(); RW._syncRectBtn && RW._syncRectBtn(); };

  RW._syncToolButtons = function(){
    const label = RW._actionLabel();
    const pb = document.getElementById('rw-poly2');
    if (pb) pb.innerText = 'Poly2 ' + label + ' (N)';
    if (pb) pb.style.background = RW.maskMode2==='poly2' ? 'rgba(255,160,60,0.4)' : '';
    const bb = document.getElementById('rw-brush');
    if (bb) bb.innerText = 'Brush ' + label + ' (J)';
    if (bb) bb.style.background = RW.maskMode2==='brush' ? 'rgba(255,160,60,0.4)' : '';
    const ab = document.getElementById('rw-addmode');
    if (ab){
      ab.innerText = 'Add ' + label + ' (A)';
      ab.style.background = RW.maskAction==='add' ? 'rgba(50,205,50,0.45)' : '';
    }
  };

  RW._paintDisk = function(mx, my, r, val){
    const {W,H,wall} = RW;
    const x0=Math.max(0,Math.round(mx-r)), x1=Math.min(W-1,Math.round(mx+r));
    const y0=Math.max(0,Math.round(my-r)), y1=Math.min(H-1,Math.round(my+r));
    const r2=r*r;
    for (let y=y0;y<=y1;y++) for (let x=x0;x<=x1;x++){
      const dx=x-mx, dy=y-my;
      if (dx*dx+dy*dy<=r2) wall[y*W+x]=val;
    }
  };

  ac.addEventListener('mousedown', function(e){
    if (!RW.maskMode2) return;
    e.stopPropagation(); e.preventDefault();
    const [nx,ny]=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskMode2==='poly2'){
      RW._polyPtsN = RW._polyPtsN || [];
      RW._polyPtsN.push([nx,ny]);
      return;
    }
    if (RW.maskMode2==='brush'){
      RW._brushDown = true;
      RW._brushStroke = [[nx,ny]];
      RW._snapshot('brush');
      const val = RW.maskAction==='add' ? 0 : (RW.maskAction==='block' ? 1 : 0);
      RW._paintDisk(nx*RW.W, ny*RW.H, RW.brushR, val);
    }
  }, true);

  ac.addEventListener('mousemove', function(e){
    if (!RW.maskMode2) return;
    e.stopPropagation();
    const [nx,ny]=RW._toNorm(e.clientX,e.clientY);
    if (RW.maskMode2==='poly2'){
      RW._renderPreview({x:e.clientX,y:e.clientY});
      return;
    }
    if (RW.maskMode2==='brush'){
      if (RW._brushDown){
        RW._brushStroke.push([nx,ny]);
        const val = RW.maskAction==='add' ? 0 : (RW.maskAction==='block' ? 1 : 0);
        RW._paintDisk(nx*RW.W, ny*RW.H, RW.brushR, val);
      }
      RW._renderBrushCursor(e.clientX, e.clientY);
    }
  }, true);

  ac.addEventListener('mouseup', function(e){
    if (!RW.maskMode2) return;
    e.stopPropagation(); e.preventDefault();
    if (RW.maskMode2==='poly2') return;
    if (RW.maskMode2==='brush' && RW._brushDown){
      RW._brushDown = false;
      if (RW.maskAction==='add'){
        // Create perimeter ring around the cleared stroke
        const r = RW.brushR;
        for (const [snx,sny] of RW._brushStroke){
          RW._paintDisk(snx*RW.W, sny*RW.H, r+2, 1);   // outer wall ring
        }
        for (const [snx,sny] of RW._brushStroke){
          RW._paintDisk(snx*RW.W, sny*RW.H, r-1, 0);    // reinforce interior clear
        }
      }
      const saveFloor = RW._areaFloor; if (RW.maskAction==='add') RW._areaFloor = 100;
      RW._relabel(); RW.renderList(); RW.renderOverlay();
      RW._areaFloor = saveFloor;
      RW._renderCommitPreview();
    }
  }, true);

  ac.addEventListener('dblclick', function(e){
    if (RW.maskMode2!=='poly2') return;
    e.stopPropagation(); e.preventDefault();
      if (RW._polyPtsN && RW._polyPtsN.length>=3){
      const mpts = RW._polyPtsN.map(([nx,ny])=>[nx*RW.W, ny*RW.H]);
      if (RW.maskAction==='add'){
        // Clear interior first, then trace perimeter wall → creates new enclosed region
        RW._paintPoly(mpts, 0);
        RW._paintPolylineGap(mpts);
      } else if (RW.maskAction==='open'){
        // open mode: seal perimeter gaps, then convert interior walls to non-wall
        RW._paintPolylineGap(mpts);
        const W=RW.W, H=RW.H, wall=RW.wall;
        let minY=H,maxY=0;
        for (const [x,y] of mpts){ if(y<minY)minY=y; if(y>maxY)maxY=y; }
        minY=Math.max(0,minY|0); maxY=Math.min(H-1,Math.ceil(maxY));
        for (let y=minY;y<=maxY;y++){
          const xs=[];
          for (let i=0,j=mpts.length-1;i<mpts.length;j=i++){
            const [xi,yi]=mpts[i], [xj,yj]=mpts[j];
            if ((yi>y)!==(yj>y)) xs.push(xi+(y-yi)/(yj-yi)*(xj-xi));
          }
          xs.sort((a,b)=>a-b);
          for (let k=0;k+1<xs.length;k+=2){
            const xa=Math.max(0,Math.round(xs[k])), xb=Math.min(W-1,Math.round(xs[k+1]));
            for (let x=xa;x<=xb;x++) if (wall[y*W+x]===1) wall[y*W+x]=0;
          }
        }
      } else {
        RW._paintPoly(mpts, RW.maskAction==='block' ? 1 : 0);
      }
      const saveFloor = RW._areaFloor; if (RW.maskAction==='add') RW._areaFloor = 100;
      RW._relabel(); RW.renderList(); RW.renderOverlay();
      RW._areaFloor = saveFloor;
      RW._renderCommitPreview();
    }
    RW._polyPtsN=[];
    const pl=document.getElementById('rw-polyline'); if(pl) pl.remove();
  }, true);

  ac.addEventListener('click', function(e){
    if (RW.maskMode2){ e.stopPropagation(); e.preventDefault(); }
  }, true);

  ac.addEventListener('wheel', function(e){
    if (RW.maskMode2!=='brush' || !RW.__tabHeld) return;
    e.stopPropagation(); e.preventDefault();
    RW.brushR = Math.min(30, Math.max(2, RW.brushR + (e.deltaY<0?1:-1)));
    const bb = document.getElementById('rw-brush');
    if (bb) bb.title = 'Brush radius: '+RW.brushR+' mask px (Tab+scroll to resize)';
    RW._renderBrushCursor(e.clientX, e.clientY);
  }, {capture:true, passive:false});

  ac.addEventListener('wheel', function(e){
    if (!RW.maskMode2) return;
    if (RW.__tabHeld) return;
    requestAnimationFrame(() => {
      if (RW.maskMode2==='brush') RW._renderBrushCursor(e.clientX||0, e.clientY||0);
    });
  }, {passive:true});

  window.addEventListener('keydown', function(e){
    if (e.key==='Tab' && RW.maskMode2==='brush'){ RW.__tabHeld = true; e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', function(e){
    if (e.key==='Tab') RW.__tabHeld = false;
  }, true);

  RW._renderBrushCursor = function(cx, cy){
    const svg = RW._mkSvg('rw-brushline', 72);
    const [nx,ny]=RW._toNorm(cx,cy);
    const [px,py]=RW._toPx(nx,ny);
    const pr = RW._toPx(RW.brushR/RW.W, 0)[0];
    const col = RW._actionColor();
    const sw = 1.2;
    let inner = '<circle cx="'+px+'" cy="'+py+'" r="'+pr+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-dasharray="8"/>';
    if (RW._brushDown && RW._brushStroke && RW._brushStroke.length){
      const fill = RW.maskAction==='add' ? 'rgba(50,205,50,0.35)' : (RW.maskAction==='block' ? 'rgba(255,120,0,0.30)' : 'rgba(60,180,255,0.30)');
      // Render as a single thick polyline instead of N individual circles
      // (1 DOM node instead of potentially hundreds — huge perf win for long strokes)
      const ptsStr = RW._brushStroke.map(([snx,sny])=>{
        const [spx,spy]=RW._toPx(snx,sny);
        return spx+','+spy;
      }).join(' ');
      inner += '<polyline points="'+ptsStr+'" fill="none" stroke="'+fill+'" stroke-width="'+(pr*2)+'" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    svg.innerHTML = inner;
  };

  const sc = document.getElementById('canvas-scroll-container');
  sc.addEventListener('scroll', function(){
    if (!RW.maskMode2) return;
    if (RW.maskMode2==='poly2') RW._renderPreview(null);
  }, {passive:true});

  (function(){
    const orig = RW._renderPreview;
    RW._renderPreview = function(cursorClient){
      const ret = orig.call(RW, cursorClient);
      if (RW.maskMode2==='poly2'){
        const svg = document.getElementById('rw-polyline');
        if (svg){
          const col = RW._actionColor();
          svg.querySelectorAll('polyline,circle').forEach(el=>{
            el.setAttribute('stroke', col);
          });
        }
      }
      return ret;
    };
  })();

  window.addEventListener('keydown', function(e){
    const t=e.target;
    if (t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if (e.ctrlKey||e.metaKey||e.altKey) return;
    const k = e.key.toLowerCase();
    if (k==='a'){
      e.preventDefault(); e.stopImmediatePropagation();
      const cycle = {block:'open',open:'add',add:'block'};
      const next = e.shiftKey ? {add:'open',open:'block',block:'add'}[RW.maskAction] : cycle[RW.maskAction];
      RW.setMaskAction(next);
      return;
    }
    if (k==='n'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey){ const next=RW.maskAction==='block'?'open':RW.maskAction==='open'?'add':'block'; RW.setMaskAction(next); return; }
      if (RW.maskMode==='rect'){ RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
        document.getElementById('annotation-canvas').style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        RW._syncRectBtn(); }
      RW.setMaskMode2(RW.maskMode2==='poly2' ? null : 'poly2');
    }
    if (k==='j'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.shiftKey){ const next=RW.maskAction==='block'?'open':RW.maskAction==='open'?'add':'block'; RW.setMaskAction(next); return; }
      if (RW.maskMode==='rect'){ RW.maskMode=null; RW.__rectStartN=null; RW.__rectCurN=null;
        document.getElementById('annotation-canvas').style.cursor='';
        const rl=document.getElementById('rw-rectline'); if(rl) rl.remove();
        RW._syncRectBtn(); }
      RW.setMaskMode2(RW.maskMode2==='brush' ? null : 'brush');
    }
    if (e.key==='Escape' && RW.maskMode2){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW.maskMode2==='poly2' && RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN=[];
        const pl=document.getElementById('rw-polyline'); if(pl) pl.remove();
      } else {
        RW.setMaskMode2(null);
      }
    }
    if (e.key==='Backspace' && RW.maskMode2==='poly2'){
      e.preventDefault(); e.stopImmediatePropagation();
      if (RW._polyPtsN && RW._polyPtsN.length){
        RW._polyPtsN.pop();
        RW._renderPreview(null);
      }
    }
  }, true);

  const bar = (document.getElementById('rw-pick') || {}).parentNode;
  const legacyPoly = document.getElementById('rw-poly');
  if (legacyPoly) legacyPoly.style.display = 'none';
  function addBtn(id, title){
    if (document.getElementById(id)) return null;
    const b=document.createElement('button');
    b.id=id; b.title=title;
    b.style.cssText='font-size:11px;padding:2px 6px;';
    bar.appendChild(b);
    return b;
  }
  const pb = addBtn('rw-poly2','Freeform mask: click vertices, double-click closes. Shift+N toggles mode.');
  if (pb) pb.onclick=()=>RW.setMaskMode2(RW.maskMode2==='poly2'?null:'poly2');
  const bb = addBtn('rw-brush','Freehand mask stroke. Tab+scroll resizes. Shift+J toggles mode.');
  if (bb) bb.onclick=()=>RW.setMaskMode2(RW.maskMode2==='brush'?null:'brush');
  const ab = document.createElement('button');
  ab.id='rw-addmode'; ab.title='Cycle mask action: block → open → add. A key toggles, Shift+A reverse.';
  ab.style.cssText='font-size:11px;padding:2px 6px;';
  ab.onclick=()=>{
    const cycle = {block:'open',open:'add',add:'block'};
    RW.setMaskAction(cycle[RW.maskAction]);
  };
  bar.appendChild(ab);
  RW._syncToolButtons();

  return 'v2.6 up: Poly2 (N) + Brush (J) + Add (A)';
})()

;
// ===== wf_helpers.js =====
// Workflow helpers — page nav keys + coverage heatmap.
// Independent of Region Workbench. Safe to load alongside it.
(function(){
  if (window.__wfHelpers) return 'already installed';
  window.__wfHelpers = true;

  /* ---- [ ] page nav + / tag search ---- */
  document.addEventListener('keydown', function(e){
    const t = e.target;
    const typing = t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.isContentEditable);
    if (!typing && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const s = document.getElementById('tag-search-input');
      if (s) { e.preventDefault(); s.focus(); s.select(); return; }
    }
    if (typing) return;
    if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeof annotationState === 'undefined') return;
      const links = Array.from(document.querySelectorAll('a[href*="/annotate/"]'))
        .filter(a => a.href.includes(annotationState.jobId) && !a.href.includes(annotationState.jobPageId));
      if (!links.length) return;
      e.preventDefault();
      const idx = e.key === ']' ? links.length - 1 : 0;
      window.location.href = links[idx].href;
    }
  }, true);

  /* ---- H coverage heatmap ---- */
  window.__toggleHeatmap = function(){
    const existing = document.getElementById('wf-coverage-overlay');
    if (existing) { existing.remove(); return 'heatmap off'; }
    const container = document.getElementById('pdf-container');
    if (!container || typeof annotationState === 'undefined') return 'no page';
    const w = container.clientWidth, h = container.clientHeight;
    const cv = document.createElement('canvas');
    cv.id = 'wf-coverage-overlay';
    cv.width = Math.max(1, Math.round(w/4)); cv.height = Math.max(1, Math.round(h/4));
    cv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;opacity:0.45;image-rendering:pixelated;';
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(255,80,80,0.55)';
    ctx.fillRect(0,0,cv.width,cv.height);
    ctx.globalCompositeOperation = 'destination-out';
    for (const a of annotationState.annotations) {
      if (a._hidden || a.is_void) continue;
      const pts = a.coordinates;
      if (!pts || !pts.length) continue;
      ctx.beginPath();
      pts.forEach((p,i)=>{ const X=p.x*cv.width, Y=p.y*cv.height; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y); });
      ctx.closePath(); ctx.fill();
    }
    container.appendChild(cv);
    return 'heatmap on: red = uncovered ('+annotationState.annotations.length+' shapes)';
  };

  document.addEventListener('keydown', function(e){
    const t = e.target;
    if (t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    if ((e.key==='h'||e.key==='H') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      window.__toggleHeatmap();
    }
  }, true);

  return 'wf helpers installed: [ ] nav, / tag search, H heatmap';
})()


  console.log('[RW] workbench ready: ' + __RW.regions.filter(r=>r.included).length + ' regions. Keys: P pick, K cut, B/O rects, N poly, J brush, ` undo, H heatmap, [ ] pages.');
})()
