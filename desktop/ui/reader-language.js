// Reader UI only. PDF text, filenames, bookmark names and signature names are excluded.
let language='vi';try{if(localStorage.getItem('sreader.language')==='en')language='en';}catch{}
const strings={
  'Xóa lịch sử':'Clear history','Tệp PDF gần đây':'Recent PDFs','Tệp PDF gần đây…':'Recent PDFs…',
  'Chưa có PDF gần đây.':'No recent PDFs.','Không tìm thấy tệp':'File not found',
  'Chỉ lưu đường dẫn và vị trí đọc trong hồ sơ sReader trên máy này. Không lưu nội dung PDF hoặc thay đổi chưa lưu.':'Only file paths and reading positions are stored in the sReader profile on this device. PDF contents and unsaved edits are not stored.',
  'Đã bỏ qua PDF không còn tồn tại: ':'Skipped missing PDFs: ','Không lưu được phiên đọc PDF: ':'Unable to save reading session: ',
  'Điền biểu mẫu PDF':'Fill PDF forms','PDF này không có trường biểu mẫu có thể điền.':'This PDF has no fillable form fields.','Nhấn vào trường trên trang để điền; dùng Tab để chuyển trường.':'Click a field on the page; use Tab to move between fields.',
  'Thuộc tính tài liệu':'Document properties','Thuộc tính tài liệu…':'Document properties…',
  'Tên tệp':'File name','Số trang':'Pages','Dung lượng':'File size','Kích thước trang đầu':'First page size',
  'Phiên bản PDF':'PDF version','Tiêu đề':'Title','Chủ đề':'Subject','Từ khóa':'Keywords',
  'Ứng dụng tạo':'Creator application','Phần mềm PDF':'PDF producer','Ngày tạo':'Created','Ngày sửa':'Modified',
  'Không có thông tin':'Not specified',
  'In':'Print','In PDF':'Print PDF','In PDF…    Ctrl+P':'Print PDF…    Ctrl+P','In…':'Print…','Máy in':'Printer','Tên máy in':'Printer name','Số bản':'Copies','Số bản in':'Copies','Chọn máy in':'Choose printer','Thuộc tính…':'Properties…','Phạm vi trang':'Page range','Phạm vi':'Range','Cách in':'Print handling','Nội dung và chất lượng':'Content and quality','Trang cần in':'Pages to print','Độ phân giải bản in':'Print resolution','Khổ giấy':'Paper size','Theo trang PDF':'Match PDF page','Hướng giấy':'Orientation','Theo khổ giấy':'Auto (match page)','Dọc':'Portrait','Ngang':'Landscape','Bố trí':'Layout','Một trang mỗi tờ':'One page per sheet','Nhiều trang mỗi tờ':'Multiple pages per sheet','Sách gấp đôi':'Booklet','Chia trang lớn thành nhiều tờ':'Tile large pages across sheets','Trang mỗi tờ':'Pages per sheet','Tỷ lệ':'Scale','Vừa vùng in':'Fit to printable area','Chỉ thu nhỏ':'Shrink oversized pages','Kích thước thật':'Actual size','Tùy chỉnh':'Custom','Tỷ lệ tùy chỉnh (%)':'Custom scale (%)','Lề mỗi cạnh (mm)':'Margins (mm)','Tự xoay và căn giữa':'Auto-rotate and center','Chất lượng ảnh in':'Print image quality','Gồm chữ ký và phần đã chèn':'Include signatures and inserted content','Gồm chú thích PDF':'Include PDF annotations','Gồm dữ liệu biểu mẫu đã điền':'Include filled form data','In đen trắng':'Print in grayscale','Xem trước':'Preview','Máy in không hỗ trợ thì dùng thiết lập mặc định của driver.':'If the printer does not support this, its driver default will be used.','Vừa vùng in có thể phóng to hoặc thu nhỏ; Chỉ thu nhỏ chỉ giảm trang quá khổ; Kích thước thật giữ tỷ lệ 100%. Nếu khổ giấy gần bằng trang PDF thì kết quả có thể giống nhau.':'Fit can enlarge or shrink; Shrink only reduces oversized pages; Actual size keeps 100% scale. Results may look alike when the PDF and paper sizes match.','Trang cần in (all hoặc 1,3-5)':'Pages to print (all or 1,3-5)','Trang (all hoặc 1,3-5)':'Pages (all or 1,3-5)','Tất cả':'All','Trang hiện tại':'Current page','Các trang đang xem':'Visible pages','Khoảng tùy chọn':'Custom range','Lọc trang':'Page filter','Chẵn và lẻ':'Odd and even','Trang lẻ':'Odd pages','Trang chẵn':'Even pages','Đảo thứ tự':'Reverse order',
  'In bản làm việc gồm biểu mẫu và phần đã chèn. PDF nguồn không thay đổi.':'Print the working copy including forms and inserted content. The source PDF stays unchanged.',
  'Tối đa 50 trang và 80 triệu điểm ảnh mỗi đợt. Chọn khoảng nhỏ hơn khi tài liệu lớn.':'Up to 50 pages and 80 million pixels per job. Choose a smaller range for large documents.',
  'Chọn từ 1 đến 50 trang cho mỗi đợt in.':'Select 1 to 50 pages per print job.','Bản in quá lớn; chọn ít trang hơn.':'The print job is too large; select fewer pages.','Đã mở hộp thoại in.':'Print dialog opened.','Đã chuyển bản làm việc sang sTool PDF.':'Opened the working copy in sTool PDF.',
  'Tài liệu đã thay đổi; mở lại công cụ chèn chữ.':'The active document changed; reopen the text tool.','Chưa cài sTool PDF':'sTool PDF is not installed.',
  'Ctrl + lăn chuột':'Ctrl + mouse wheel','Lưu':'Save','Lưu (Ctrl+S)':'Save (Ctrl+S)','Lưu    Ctrl+S':'Save    Ctrl+S','Trang đầu':'First page','Trang cuối':'Last page','Giới thiệu…':'About…','Phiên bản:':'Version:','Tác giả:':'Author:',
  'Màu bút / tô sáng':'Pen / highlight colors','Màu bút vẽ':'Pen color','Màu tô sáng':'Highlight color','Chèn chữ (Typewriter)':'Insert text (Typewriter)','Font chữ':'Font','Cỡ chữ':'Font size','Màu chữ':'Text color','In hai mặt':'Print on both sides','Theo máy in':'Printer default','Một mặt':'One-sided','Hai mặt · lật cạnh dài':'Two-sided · flip on long edge','Hai mặt · lật cạnh ngắn':'Two-sided · flip on short edge','Tờ':'Sheet','Trang trước':'Previous page','Trang sau':'Next page','Hủy / Đóng':'Cancel / Close','Đang tải máy in Windows…':'Loading Windows printers…','Không tìm thấy máy in':'No printers found','Không tải được danh sách máy in':'Unable to load printer list','Thuộc tính mở cài đặt driver Windows của máy đang chọn.':'Properties opens Windows driver settings for the selected printer.','Cài đặt hoặc kết nối máy in rồi bấm thử lại.':'Install or connect a printer, then retry.','Chọn máy in trước.':'Choose a printer first.','Đã mở thuộc tính driver của ':'Opened driver properties for ','Đang cập nhật bản xem trước…':'Updating preview…','Đang tạo bản xem trước…':'Creating preview…','Đang chuẩn bị xem trước.':'Preparing preview.','Tỷ lệ hoặc lề không hợp lệ.':'Scale or margins are invalid.','Chọn từ 1 đến 50 trang cho mỗi đợt in.':'Select 1 to 50 pages per print batch.','Chọn khổ giấy cố định cho bố trí nhiều trang, sách hoặc chia trang.':'Choose a fixed paper size for multiple pages, booklet, or tiling.','Quá 100 tờ in; chọn ít trang hoặc khổ giấy lớn hơn.':'More than 100 print sheets; select fewer pages or a larger paper size.','Bản in quá lớn; chọn ít trang hơn.':'The print job is too large; select fewer pages.','Độ phân giải tự điều chỉnh còn ':'Print resolution adjusted to ',' để giữ đủ ':' dpi to fit all ',' tờ trong bộ nhớ (mục tiêu ':' sheets in memory (target ',' dpi).':' dpi).','Đã chuẩn bị ':'Prepared ','/':'/',' tờ.':' sheets.','Đang xem trước tờ ':'Previewing sheet ','… Chọn tối đa 50 trang để in mỗi đợt.':'… Select up to 50 pages per print batch.','Đã gửi ':'Sent ',' bản tới ':' copies to ','.':'.','Thuộc tính mở cài đặt driver Windows của máy đang chọn.':'Properties opens Windows driver settings for the selected printer.',' (Mặc định)':' (Default)','Đã mở hộp thoại in.':'Print dialog opened.','Đã gửi':'Sent','bản tới':'copies to',
  'Chữ PDF thật, hỗ trợ tiếng Việt. Chọn font, cỡ và màu; xuống dòng theo ý muốn.':'Searchable PDF text with Vietnamese support. Choose font, size and color; add line breaks as needed.',
  'Nhập 1–2000 ký tự, tối đa 20 dòng.':'Enter 1–2000 characters on up to 20 lines.','Kiểu chữ không hợp lệ.':'Invalid text style.','Font không hợp lệ.':'Invalid font.','Không tải được font.':'Unable to load font.',
  'Đoạn chữ quá lớn; giảm cỡ chữ hoặc xuống dòng.':'The text is too large; reduce the font size or add line breaks.',
  'Mở PDF':'Open PDF','Mở PDF trước.':'Open a PDF first.','Mở PDF trước khi ký.':'Open a PDF before signing.',
  'Mở PDF (Ctrl+O)':'Open PDF (Ctrl+O)','Mở PDF…    Ctrl+O':'Open PDF…    Ctrl+O',
  'Lưu thành…':'Save As…','Lưu thành… (Ctrl+Shift+S)':'Save As… (Ctrl+Shift+S)','Lưu thành…    Ctrl+Shift+S':'Save As…    Ctrl+Shift+S',
  'Lưu thành bản PDF mới':'Save a new PDF copy','Chọn chữ':'Select text','Bàn tay':'Hand tool','Sao chép':'Copy',
  'Hoàn tác':'Undo','Làm lại':'Redo','Tô sáng':'Highlight','Gạch dưới':'Underline','Gạch ngang':'Strikethrough',
  'Ghi chú':'Note','Bút vẽ':'Pen','Chữ nhật':'Rectangle','Đường thẳng':'Line','Mũi tên':'Arrow','Tẩy bản chưa lưu':'Erase pending marks',
  'Tạo chữ ký':'Create signature','Ký nhanh':'Quick Sign','＋ Ký nhanh':'Quick Sign','Chữ ký':'Signature',
  'Nhập chữ…':'Enter text…','Văn bản chèn vào PDF':'Text to insert into PDF','Hủy':'Cancel','Đặt vào trang':'Place on page',
  'Nhập chữ vào PDF':'Insert text into PDF','Nhập chữ':'Insert text','Văn bản':'Text','Ngày tháng':'Date',
  'Dấu ✓':'Check mark','Dấu tích':'Check mark','Dấu ×':'Cross mark','Dấu X':'Cross mark',
  'Chữ ký đã lưu':'Saved signatures','Chữ ký của bạn':'Your signatures','Đóng':'Close','Đổi tên':'Rename','Tên chữ ký:':'Signature name:','Xóa':'Delete',
  'Một trang':'Single page','Hai trang':'Two pages','Cuộn liên tục':'Continuous scroll','Xoay chế độ xem':'Rotate view',
  'Trình chiếu tài liệu (F11)':'Document presentation (F11)','Trình chiếu tài liệu':'Document presentation',
  'Sáng / tối':'Light / dark theme','Dấu trang':'Bookmarks','Mục lục':'Chapters','Trang':'Page','Tài liệu':'Document',
  'Đánh dấu trang':'Bookmark this page','Danh sách dấu trang':'Bookmark list','Nội dung ghi chú':'Note content','Nội dung ghi chú:':'Note content:',
  'Chú thích đang chọn':'Selected annotation','Đối tượng':'Object','Chữ ký đang chọn':'Selected signature','Xóa chú thích':'Delete annotation','Xóa chữ ký':'Delete signature',
  'Kéo cửa sổ · nhấp đúp để phóng to':'Drag window · double-click to maximize','Thu nhỏ':'Minimize','Phóng to / khôi phục':'Maximize / restore',
  'Đóng cửa sổ':'Close window','Đóng cửa sổ và bỏ thay đổi chưa lưu?':'Close the window and discard unsaved changes?',
  'Đóng tài liệu và bỏ chữ ký chưa lưu?':'Close the document and discard unsaved changes?',
  'Thêm công cụ chú thích':'More annotation tools','Chú thích':'Annotations','Điền & ký':'Fill & Sign','Menu':'Menu','Chế độ xem':'View',
  'Thu phóng':'Zoom','Đảo màu trang':'Invert page colors','Phím tắt':'Keyboard shortcuts','Phím tắt    F1':'Keyboard shortcuts    F1',
  'Tìm trong tài liệu':'Find in document','Tìm trong tài liệu…':'Find in document…','Tìm kiếm':'Search',
  'Hoàn tác / làm lại chú thích':'Undo / redo annotations','Xóa đối tượng đang chọn':'Delete selected object',
  'Ẩn / hiện thanh bên':'Toggle sidebar','Trang trước / sau khi trình chiếu':'Previous / next presentation page',
  'Thoát trình chiếu / đóng hộp thoại':'Exit presentation / close dialog','Esc để thoát · ← → chuyển trang':'Esc to exit · ← → change page',
  'Sáng':'Light','Tối':'Dark','Giao diện':'Theme','Tùy chọn hiển thị':'Display settings','Tùy chọn hiển thị…':'Display settings…','Ngôn ngữ':'Language',
  'Ẩn/hiện thanh bên':'Toggle sidebar','Trang trước':'Previous page','Trang sau':'Next page','Thu nhỏ trang':'Zoom out','Phóng to':'Zoom in',
  'Kết quả trước':'Previous match','Kết quả sau':'Next match','Vừa chiều rộng':'Fit width','Vừa trang':'Fit page',
  'Đọc dễ dàng. Ký nhanh. Hoàn toàn offline.':'Read easily. Sign quickly. Fully offline.',
  'Kéo thả PDF hoặc chọn Mở PDF. Tài liệu nguồn luôn được giữ nguyên.':'Drop PDFs here or choose Open PDF. Your source document stays unchanged.',
  'Sẵn sàng · PDF không rời máy của bạn':'Ready · Your PDF stays on this device',
  'Gõ tên':'Type your name','Vẽ chữ ký bằng chuột hoặc bút':'Draw a signature with a mouse or pen','Vẽ lại':'Clear drawing','Dùng tên':'Use typed name','Chọn ảnh':'Choose image',
  'Áp dụng cho':'Apply to','Trang này':'This page','Nhiều trang':'Page range','Toàn bộ tài liệu':'All pages','Khoảng trang':'Page range',
  'Ví dụ: 1,3-5':'Example: 1,3-5','Áp dụng vị trí mẫu':'Apply this placement',
  'Kéo để di chuyển. Bốn góc giữ tỷ lệ; bốn cạnh chỉnh ngang/dọc.':'Drag to move. Corner handles keep proportions; edge handles adjust width or height.',
  'Vị trí và kích thước mẫu được giữ theo đơn vị PDF; trang nhỏ hơn được giới hạn trong trang.':'Placement uses PDF units; smaller pages keep the artwork within page bounds.',
  'Đây là chữ ký hình ảnh, không phải chữ ký số có chứng thư.':'This is signature artwork, not a certificate-based digital signature.',
  'PNG/JPEG được xử lý tại máy. Chữ ký được lưu trong hồ sơ ứng dụng trên máy để dùng lại. Có thể đổi tên hoặc xóa trong Chữ ký đã lưu.':'PNG/JPEG images are processed locally. Reusable signatures are stored on this device. Rename or delete them in Saved signatures.',
  'Tối đa 200 ký tự, 3 dòng. Sau khi đặt, kéo và chỉnh kích thước trực tiếp.':'Up to 200 characters on 3 lines. Drag and resize after placing.',
  'Nhập 1–200 ký tự, tối đa 3 dòng.':'Enter 1–200 characters on up to 3 lines.','Dòng chữ quá dài; hãy ngắt dòng.':'This line is too long; add a line break.',
  'Lưu tại hồ sơ ứng dụng trên máy này. Xóa chữ ký không xóa bản đã ký trong PDF.':'Stored in this device’s app profile. Removing a saved signature does not remove copies already placed in PDFs.',
  'Chưa có chữ ký. Tạo hoặc nhập chữ ký để lưu dùng lại.':'No saved signatures yet. Create or import one to reuse it.',
  'Thư viện chữ ký đã đầy (3 MB). Xóa chữ ký không dùng trước khi thêm.':'The signature library is full (3 MB). Remove unused signatures before adding more.',
  'Màu giao diện được nhớ trên máy. Đảo màu trang chỉ đổi cách hiển thị; PDF lưu và chữ ký vẫn giữ màu gốc.':'Your theme is remembered on this device. Page inversion changes display only; saved PDFs and signature colors stay unchanged.',
  'Không ghi được dấu trang trong hồ sơ ứng dụng.':'Unable to store bookmarks in the app profile.',
  'Mở PDF để xem dấu trang.':'Open a PDF to view bookmarks.','Chưa có dấu trang. Nhấn “Đánh dấu trang” trong menu hoặc Ctrl+B.':'No bookmarks yet. Choose Bookmark this page from the menu or press Ctrl+B.',
  'Trang này đã được đánh dấu.':'This page is already bookmarked.','Tối đa 100 dấu trang cho mỗi PDF.':'Up to 100 bookmarks per PDF.',
  'Reader R1 giới hạn mỗi PDF ở 200 MB.':'The Reader supports PDFs up to 200 MB.','Mật khẩu chưa đúng. Nhập lại:':'Incorrect password. Try again:','Mật khẩu PDF:':'PDF password:',
  'Đã hủy mở PDF.':'Opening cancelled.','PDF này chưa có mục lục.':'This PDF has no chapters.','Ảnh chữ ký tối đa 10 MB.':'Signature images must be 10 MB or smaller.',
  'Vẽ, nhập tên hoặc chọn ảnh chữ ký.':'Draw, type a name, or choose a signature image.','Chữ ký đang trống.':'The signature is empty.',
  'Đã lưu chữ ký trên máy để dùng lại cho PDF khác.':'Signature saved on this device for reuse in other PDFs.',
  'Chọn chữ ký mẫu.':'Select a signature placement.','Chọn chữ ký hình ảnh để áp dụng nhiều trang.':'Select signature artwork to apply it to multiple pages.',
  'Đã hủy lưu. Chữ ký vẫn ở bản làm việc.':'Saving cancelled. Your signature remains in the working copy.',
  'Đã tạo bản PDF mới để Lưu thành. PDF nguồn không thay đổi.':'A new PDF copy is ready to save. The source PDF is unchanged.',
  'Chọn đoạn chữ cần sao chép.':'Select text to copy.','Đã sao chép chữ đã chọn.':'Selected text copied.',
  'PDF này có chữ ký số. Thay đổi bản sao có thể làm mất hiệu lực xác thực. Tiếp tục Lưu thành?':'This PDF contains a digital signature. Editing a copy may invalidate verification. Continue with Save As?',
  'Đã hủy lưu để giữ trạng thái chữ ký số.':'Saving cancelled to preserve the digital signature status.','Kiểm tra lưu: số trang bị thay đổi.':'Save validation failed: page count changed.',
};
export const getLanguage=()=>language;
export function t(value){
  if(language!=='en'||typeof value!=='string')return value;
  const m=value.match(/^(\s*)([\s\S]*?)(\s*)$/),s=m[2];let result=strings[s];
  if(!result){
    if(s.endsWith(' đang chọn'))result='Selected '+t(s.slice(0,-10));
    if(s.startsWith('Font không hỗ trợ ký tự: '))result='Font does not support character: '+s.slice('Font không hỗ trợ ký tự: '.length);
    const patterns=[
      [/^Trang (\d+)$/,'Page $1'],[/^Tờ (\d+)\/(\d+)$/,'Sheet $1/$2'],[/^Đã chuẩn bị (\d+)\/(\d+) tờ\.$/,'Prepared $1/$2 sheets.'],[/^Đang xem trước tờ (\d+)\/(\d+)\. Chọn tối đa 50 trang để in mỗi đợt\.$/,'Previewing sheet $1/$2. Select up to 50 pages per print batch.'],[/^Độ phân giải tự điều chỉnh còn (\d+) dpi để giữ đủ (\d+) tờ trong bộ nhớ \(mục tiêu (\d+) dpi\)\.$/,'Print resolution adjusted to $1 dpi to fit $2 sheets in memory (target $3 dpi).'],[/^Đang tạo bản xem trước tờ (\d+)…$/,'Creating preview for sheet $1…'],[/^Đã gửi (\d+) bản tới (.+)\.$/,'Sent $1 copies to $2.'],[/^Đến trang (\d+)$/,'Go to page $1'],[/^Xóa dấu trang (.+)$/,'Remove bookmark $1'],
      [/^Đóng (.+)$/,'Close $1'],[/^Đang mở (.+)$/,'Opening $1'],[/^(.+) · (\d+) trang · Xử lý offline$/,'$1 · $2 pages · Offline'],
      [/^Đã đánh dấu trang (\d+)\.$/,'Page $1 bookmarked.'],[/^Đã lưu bản PDF mới: (.+)$/,'New PDF copy saved: $1'],
      [/^Đã áp dụng trên (\d+) trang; lưu thành PDF mới để hoàn tất\.$/,'Applied to $1 pages; save a new PDF copy to finish.'],
      [/^(.+) đang chọn$/,'Selected $1'],[/^Đổi kích thước (.+)$/,'Resize $1'],
      [/^(.+): kéo di chuyển hoặc dùng phím mũi tên$/,'$1: drag to move or use arrow keys'],
      [/^Xóa chữ ký “(.+)” khỏi thư viện\?$/,'Remove signature “$1” from the library?'],
    ];
    if(!result)for(const [pattern,replacement]of patterns)if(pattern.test(s)){result=s.replace(pattern,replacement);break;}
    if(!result){
      const prefixes={'Không thể thực hiện: ':'Unable to complete: ','Không mở được PDF: ':'Unable to open PDF: ','Không nhận được tệp: ':'Unable to receive file: ','Không thể trình chiếu: ':'Unable to present: ','Đã đặt chữ ký, nhưng chưa lưu vào thư viện: ':'Signature placed, but not saved in the library: '};
      for(const [vi,en]of Object.entries(prefixes))if(s.startsWith(vi)){result=en+t(s.slice(vi.length));break;}
      const placed=s.match(/^Đã đặt (.+)\. Kéo để điều chỉnh trước khi Lưu thành\.$/);if(placed)result='Placed '+t(placed[1][0].toUpperCase()+placed[1].slice(1))+'. Drag to adjust before Save As.';
    }
  }
  return m[1]+(result||s)+m[3];
}
export function installLanguage(){
  const memory=new WeakMap();
  function field(target,key,get,set){let state=memory.get(target);if(!state){state={};memory.set(target,state);}const value=get();let record=state[key];if(!record||value!==record.last)record=state[key]={source:value,last:value};const result=t(record.source);record.last=result;if(value!==result)set(result);}
  function attrs(el){for(const name of ['title','aria-label','placeholder'])if(el.hasAttribute(name))field(el,name,()=>el.getAttribute(name),v=>el.setAttribute(name,v));}
  const excluded='.textLayer,.annotationLayer,.canvasWrapper,.typewriter-visual,#outline,#bookmarks,.tab .title,.signature-library-row button:first-of-type';
  function walk(root){
    if(root.nodeType===Node.TEXT_NODE){const el=root.parentElement;if(el&&!el.closest(excluded)&&!el.closest('.readerContainer'))field(root,'text',()=>root.data,v=>{root.data=v;});return;}
    if(root.nodeType!==Node.ELEMENT_NODE||root.matches('script,style,canvas,svg')||root.closest(excluded))return;
    if(root.closest('.readerContainer')){if(root.matches('.signature,.handle'))attrs(root);for(const b of root.querySelectorAll('.signature,.handle'))attrs(b);return;}
    attrs(root);for(const child of root.childNodes)walk(child);
  }
  const settings=document.getElementById('readerSettings'),label=document.createElement('label'),select=document.createElement('select');label.textContent='Ngôn ngữ';select.id='readerLanguage';select.setAttribute('aria-label','Ngôn ngữ');
  for(const [value,text]of [['vi','Tiếng Việt'],['en','English']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}select.value=language;label.append(select);settings.querySelector('h2').after(label);
  select.onchange=()=>{language=select.value;try{localStorage.setItem('sreader.language',language);}catch{}document.documentElement.lang=language;walk(document.body);document.dispatchEvent(new Event('reader-language-changed'));};
  document.documentElement.lang=language;walk(document.body);
  new MutationObserver(records=>{for(const r of records){if(r.type==='childList')for(const child of r.addedNodes)walk(child);else if(r.type==='characterData')walk(r.target);else if(!r.target.closest(excluded))attrs(r.target);}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','aria-label','placeholder']});
}
