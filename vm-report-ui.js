import {parseVMReport} from './vm-report.js';
const input=document.getElementById('vm-report-file');
const output=document.getElementById('vm-report-results');
const status=document.getElementById('vm-report-status');
const clear=document.getElementById('vm-report-clear');
function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
function reset(){output.replaceChildren();status.textContent='لم يُحمّل أي تقرير بعد.';input.value='';}
clear.addEventListener('click',reset);
input.addEventListener('change',async()=>{
  output.replaceChildren();
  const file=input.files?.[0];
  if(!file){reset();return;}
  if(file.size>256000){status.textContent='الملف كبير جدًا (الحد 256 كيلوبايت).';return;}
  try{
    const machines=parseVMReport(await file.text());
    status.textContent='تمت قراءة '+machines.length+' أجهزة محليًا في المتصفح. لم تُرسل البيانات إلى خادم.';
    if(!machines.length)output.append(element('p','لا توجد أجهزة في التقرير.'));
    for(const vm of machines){
      const card=element('article','');
      card.append(element('h3',vm.name));
      card.append(element('p','الحالة: '+vm.state));
      card.append(element('p',vm.isolated?'الشبكات: Host-Only / Internal فقط وفق التقرير':'تنبيه: العزل غير مؤكد؛ راجع جميع المحولات'));
      const list=document.createElement('ul');
      for(const a of vm.adapters)list.append(element('li','المحول '+a.slot+': '+a.attachment));
      card.append(list);output.append(card);
    }
  }catch(err){status.textContent=err instanceof Error?err.message:'تعذر قراءة التقرير';}
});
