import { readFileSync } from 'fs';
function parse(file){
  const txt=readFileSync(file,'utf8');
  const funcs=[]; let cur=null;
  for(const l of txt.split('\n')){
    const m=l.match(/^# (\S+) @ ([0-9a-f]+)\s*$/);
    if(m){cur={name:m[1],addr:m[2],lines:[]};funcs.push(cur);continue;}
    if(cur)cur.lines.push(l);
  }
  return funcs;
}
function analyze(f){
  const bytes=[], labels=[];
  for(const l of f.lines){
    const lm=l.match(/FUN_00444840\("([^"]+)"/); if(lm)labels.push(lm[1]);
    if(!l.includes('*(undefined')) { 
      // header via 4/2/1-byte DAT copy
      if(/=\s*DAT_00(77f544|7800e0)\b/.test(l)) bytes.push('HDR7');
      continue;
    }
    // byte store ending in = VALUE;
    const bm=l.match(/=\s*(0x[0-9a-fA-F]+|\d+);\s*$/);
    if(bm && /\*\(undefined1 \*\)/.test(l)){
      let v=bm[1].startsWith('0x')?parseInt(bm[1],16):parseInt(bm[1],10);
      if(v>=0&&v<=0xff) bytes.push(v);
    }
    if(/\*\(undefined4 \*\).*=\s*DAT_00(77f544|7800e0)\b/.test(l)) bytes.push('HDR7');
  }
  return {bytes,labels};
}
const files=process.argv.slice(2);
const seen=new Set();
for(const file of files){
  for(const f of parse(file)){
    if(seen.has(f.addr))continue; seen.add(f.addr);
    const {bytes,labels}=analyze(f);
    if(!bytes.length && !labels.length) continue;
    const hex=bytes.map(b=>b==='HDR7'?'‹21 25 7E 47 50 2D 32›':b.toString(16).padStart(2,'0')).join(' ');
    console.log(`\n### ${f.name} @ ${f.addr}`);
    if(labels.length)console.log('  labels: '+labels.map(s=>JSON.stringify(s)).join(', '));
    if(bytes.length)console.log('  stores: '+hex);
  }
}
