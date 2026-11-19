// Petit DOM d'essai : événements et horloges pilotés, aucune bibliothèque externe.
class Element {
 constructor(doc,tag='div'){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.events={};this.attrs={};this.dataset={};this.style={};this.hidden=false;this.className='';this.classList={toggle(){},remove(){},add(){}};}
 append(...nodes){for(const n of nodes){if(n.parent)n.remove();this.children.push(n);n.parent=this;}}
 appendChild(n){this.append(n);return n;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,f){(this.events[k]??=[]).push(f);}
 removeEventListener(k,f){this.events[k]=(this.events[k]||[]).filter(x=>x!==f);}
 fire(k,props={}){for(const f of this.events[k]||[])f({pointerId:1,pointerType:'touch',currentTarget:this,preventDefault(){},stopPropagation(){},...props});}
 getBoundingClientRect(){return {left:0,top:0,right:390,bottom:400,width:390,height:400};}
 focus(){this.ownerDocument.activeElement=this;}
 setPointerCapture(){}
}
function hote(){
 let id=0;const timers=new Map(),frames=new Map();
 const win={navigator:{},addEventListener(){},removeEventListener(){},setTimeout(f,ms){timers.set(++id,{f,ms});return id;},clearTimeout(i){timers.delete(i);},requestAnimationFrame(f){frames.set(++id,f);return id;},cancelAnimationFrame(i){frames.delete(i);}};
 const doc={defaultView:win,createElement:t=>new Element(doc,t),createElementNS:(_,t)=>new Element(doc,t),createTextNode:t=>({textContent:t})};
 const parent=new Element(doc);
 const tous=(e=parent)=>[e,...(e.children||[]).flatMap(tous)];
 return {parent,win,timers,frames,tous,trouver:classe=>tous().find(e=>e.className?.split(' ').includes(classe)),image(t){const fs=[...frames.values()];frames.clear();fs.forEach(f=>f(t));}};
}
module.exports={hote};
