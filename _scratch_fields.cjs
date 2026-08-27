const {PDFDocument}=require('pdf-lib');const fs=require('fs');const path=require('path');
const root=process.argv[2];
function walk(d,acc){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p,acc);else if(/\.pdf$/i.test(e.name))acc.push(p);}return acc;}
(async()=>{for(const p of walk(root,[])){
 let out='';
 try{const d=await PDFDocument.load(fs.readFileSync(p),{ignoreEncryption:true});
   const pages=d.getPageCount();
   let f=[];try{f=d.getForm().getFields();}catch(e){}
   out=`\n### ${p.replace(root,'')}\npages=${pages} fields=${f.length}`;
   f.forEach(x=>{out+=`\n  ${x.constructor.name.replace('PDF','')} | ${x.getName()}`});
 }catch(e){out=`\n### ${p.replace(root,'')}\nERR ${e.message}`;}
 console.log(out);
}})();
