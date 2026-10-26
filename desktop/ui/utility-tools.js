(()=>{
const $=id=>document.getElementById(id);
const configs={
 'number-text':{title:'Đọc số thành chữ',description:'Chuyển số nguyên thành chữ tiếng Việt.',group:'numberGroup',icon:'123',note:'Hỗ trợ số nguyên đến 999 tỷ.'},
 'vn-text':{title:'Xử lý văn bản tiếng Việt',description:'Chuẩn hóa Unicode, khoảng trắng và kiểu chữ.',group:'vnTextGroup',icon:'Aa',note:'Văn bản được xử lý trong máy, không gửi lên mạng.'},
 vat:{title:'Tính VAT',description:'Tính phần VAT và tổng tiền theo thuế suất đã chọn.',group:'vatGroup',icon:'%',note:'Kết quả chỉ là phép tính theo mức thuế bạn nhập.'},
 percent:{title:'Tính phần trăm',description:'Tính mức tăng hoặc giảm giữa hai giá trị.',group:'percentGroup',icon:'%',note:'Tỷ lệ thay đổi tính theo giá trị ban đầu.'},
 age:{title:'Tính tuổi',description:'Tính số tuổi tròn theo ngày sinh.',group:'ageGroup',icon:'◷',note:'Tính theo lịch dương và ngày tham chiếu đã chọn.'},
 bmi:{title:'BMI',description:'Tính chỉ số khối cơ thể từ cân nặng và chiều cao.',group:'bmiGroup',icon:'B',note:'Chỉ hiển thị chỉ số BMI, không thay thế đánh giá y tế.'},
 aircon:{title:'Công suất điều hòa',description:'Ước lượng tải lạnh theo diện tích và điều kiện nắng.',group:'airconGroup',icon:'❄',note:'Ước lượng sơ bộ; cách nhiệt, trần cao và số người sẽ làm thay đổi nhu cầu thực tế.'}
};
const mode=new URLSearchParams(location.search).get('tool')||'',config=configs[mode];
function showStatus(text,kind=''){const node=$('status');node.textContent=text;node.className='status-text'+(kind?' '+kind:'');}
if(!config){$('toolTitle').textContent='Tiện ích chưa khả dụng';$('calculate').disabled=true;return;}
document.title=config.title+' — SolYan PDF';$('toolTitle').textContent=config.title;$('toolDescription').textContent=config.description;$('toolIcon').textContent=config.icon;$('note').textContent=config.note;$(config.group).hidden=false;
function words(number){
 const unit=['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'],scale=['','nghìn','triệu','tỷ'];
 if(!Number.isSafeInteger(number)||Math.abs(number)>999999999999)throw Error('Nhập số nguyên từ 0 đến 999.999.999.999.');
 if(number===0)return 'không';
 const negative=number<0,groups=[];let value=Math.abs(number);
 while(value){groups.push(value%1000);value=Math.floor(value/1000);}
 const highest=groups.length-1,parts=[];
 for(let index=highest;index>=0;index--){
  const n=groups[index];if(!n)continue;
  const h=Math.floor(n/100),t=Math.floor(n/10)%10,u=n%10,full=index<highest,group=[];
  if(h||full)group.push(unit[h]+' trăm');
  if(t>1){group.push(unit[t]+' mươi');if(u===1)group.push('mốt');else if(u===5)group.push('lăm');else if(u)group.push(unit[u]);}
  else if(t===1){group.push('mười');if(u===5)group.push('lăm');else if(u)group.push(unit[u]);}
  else if(u){if(h||full)group.push('lẻ');group.push(unit[u]);}
  if(index>0)group.push(scale[index]);parts.push(group.join(' '));
 }
 return (negative?'âm ':'')+parts.join(' ').replace(/\s+/g,' ').trim();
}
function money(value){return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(value)+' ₫';}
function calculate(){
 try{
  let answer='';
  if(mode==='number-text')answer=words(Number($('numberInput').value));
  else if(mode==='vn-text'){
   const value=$('vnText').value;
   let normalized=value.normalize('NFC').replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim().replace(/\s+/g,' ')).join('\n').trim();
   if($('vnAction').value==='upper')normalized=normalized.toLocaleUpperCase('vi-VN');
   if($('vnAction').value==='lower')normalized=normalized.toLocaleLowerCase('vi-VN');
   const count=normalized.trim()?normalized.trim().split(/\s+/).length:0;
   answer=normalized+'\n\nSố từ: '+count+' · Ký tự: '+normalized.length;
  }else if(mode==='vat'){
   const amount=Number($('vatAmount').value),rate=Number($('vatRate').value);
   if(!Number.isFinite(amount)||amount<0)throw Error('Số tiền không hợp lệ.');
   const base=$('vatMode').value==='inclusive'?amount/(1+rate/100):amount,vat=base*rate/100,total=base+vat;
   answer='Tiền trước VAT: '+money(base)+'\nVAT ('+rate+'%): '+money(vat)+'\nTổng tiền: '+money(total);
  }else if(mode==='percent'){
   const base=Number($('percentBase').value),next=Number($('percentNext').value);
   if(!Number.isFinite(base)||!Number.isFinite(next)||base===0)throw Error('Giá trị ban đầu phải khác 0.');
   const change=next-base,ratio=change/base*100;
   answer=(change>=0?'Tăng ':'Giảm ')+new Intl.NumberFormat('vi-VN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(ratio))+'% · Chênh lệch '+new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(change);
  }else if(mode==='age'){
   const birth=$('birthDate').value,asOf=$('asOfDate').value;
   if(!birth||!asOf||birth>asOf)throw Error('Ngày sinh và ngày tham chiếu chưa hợp lệ.');
   const [by,bm,bd]=birth.split('-').map(Number),[ry,rm,rd]=asOf.split('-').map(Number);
   let age=ry-by;if(rm<bm||(rm===bm&&rd<bd))age--;
   answer=age+' tuổi';
  }else if(mode==='bmi'){
   const weight=Number($('weightKg').value),height=Number($('heightCm').value)/100;
   if(!Number.isFinite(weight)||!Number.isFinite(height)||weight<=0||height<=0)throw Error('Nhập cân nặng và chiều cao lớn hơn 0.');
   answer='BMI: '+(weight/(height*height)).toFixed(2);
  }else if(mode==='aircon'){
   const area=Number($('areaM2').value),factor=Number($('sunlight').value);
   if(!Number.isFinite(area)||area<=0)throw Error('Diện tích phải lớn hơn 0.');
   const btu=Math.round(area*factor);
   answer='Khoảng '+new Intl.NumberFormat('vi-VN').format(btu)+' BTU/h (≈ '+(btu/3412.142).toFixed(2)+' kW tải lạnh)';
  }
  $('result').textContent=answer;showStatus('Đã tính xong.','success');
 }catch(error){$('result').textContent='';showStatus(error.message||String(error),'error');}
}
$('calculate').addEventListener('click',calculate);
})();

