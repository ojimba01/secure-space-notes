const {PDFDocument}=require('pdf-lib');const fs=require('fs');const path=require('path');
const root=process.argv[2];
function walk(d,acc){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,acc);else if(/\.pdf$/i.test(e.name))acc.push(p);}return acc;}
(async()=>{for(const p of walk(root,[]).sort()){
 try{const d=await PDFDocument.load(fs.readFileSync(p),{ignoreEncryption:true});
   let f=[];try{f=d.getForm().getFields();}catch(e){}
   // collapse repeated Row-suffixed names
   const seen=new Set();const uniq=[];
   for(const x of f){const n=x.getName().replace(/(Row)?\d+(_\d+)?$/,'#').replace(/ - \d+$/,'#');if(!seen.has(n)){seen.add(n);uniq.push(x.constructor.name.replace('PDF','').replace('Field','')+':'+n);}}
   console.log(`\n### ${p.replace(root,'')}\npages=${d.getPageCount()} fields=${f.length} uniqueShapes=${uniq.length}`);
   console.log('  '+uniq.slice(0,45).join('\n  '));
 }catch(e){console.log(`\n### ${p.replace(root,'')}\nERR ${e.message}`);}
}})();
